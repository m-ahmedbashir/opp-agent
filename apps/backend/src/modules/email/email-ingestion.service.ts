import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailAccountService } from './email-account.service';
import { ExtractionService } from '../extraction/extraction.service';
import { ComplianceService } from '../compliance/compliance.service';
import { OrdersService } from '../orders/orders.service';
import { InvoicesService } from '../invoices/invoices.service';
import { DocumentsService } from '../documents/documents.service';
import { UsersService } from '../users/users.service';
import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';

/**
 * Polls connected IMAP email accounts and feeds every message that carries
 * extractable content (text body or document attachment) into the extraction
 * pipeline. The AI classifies the document and this service routes the result
 * to the appropriate downstream pipeline (invoice, purchase order, receipt,
 * resume, etc.). No keyword pre-filtering — the model decides what is actionable.
 */
@Injectable()
export class EmailIngestionService implements OnModuleInit {
    private readonly logger = new Logger(EmailIngestionService.name);

    /**
     * Standard 5-or-6-field cron expression (seconds field optional — see the
     * `cron` package). Override via EMAIL_SYNC_CRON_EXPRESSION in .env to change
     * the sync cadence without a code change, e.g. '*\/10 * * * * *' for every
     * 10 seconds while testing, or '*\/5 * * * *' for every 5 minutes in
     * production. Read in onModuleInit(), not a @Cron() decorator argument —
     * decorator arguments evaluate at import time, before ConfigModule.forRoot()
     * has loaded .env in this app's module order, so process.env would read as
     * undefined there regardless of what's actually in .env.
     */
    private static readonly DEFAULT_SYNC_CRON_EXPRESSION = CronExpression.EVERY_5_MINUTES;

    /**
     * Each message that has extractable content triggers a synchronous LLM
     * call, so an account with a large inbox backlog (first-ever sync, or one
     * that's been disabled a while) must not be drained in a single run — that
     * would block for as long as the model takes times the message count.
     * Capping the batch means a big backlog gets worked off gradually across
     * successive syncs instead of hanging the caller.
     */
    private static readonly MAX_MESSAGES_PER_SYNC = 2;

    /**
     * TEMPORARY debug switch (added 2026-08-11): when true, syncAccount() only
     * fetches and logs the latest message(s) — it never calls the extraction
     * pipeline. Requested to verify IMAP fetching in isolation while the
     * configured model was unreliable. Flip back to false once fetching is
     * confirmed solid and you want extraction running again.
     */
    private static readonly DEBUG_FETCH_ONLY = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly emailAccountService: EmailAccountService,
        private readonly extractionService: ExtractionService,
        private readonly complianceService: ComplianceService,
        private readonly ordersService: OrdersService,
        private readonly invoicesService: InvoicesService,
        private readonly documentsService: DocumentsService,
        private readonly usersService: UsersService,
        private readonly schedulerRegistry: SchedulerRegistry,
    ) {}

    onModuleInit(): void {
        const cronExpression = process.env.EMAIL_SYNC_CRON_EXPRESSION || EmailIngestionService.DEFAULT_SYNC_CRON_EXPRESSION;
        const job = new CronJob(cronExpression, () => this.syncAll());
        this.schedulerRegistry.addCronJob('email-sync', job);
        job.start();
        this.logger.log(`Email sync cron scheduled: '${cronExpression}'${process.env.EMAIL_SYNC_CRON_EXPRESSION ? ' (from EMAIL_SYNC_CRON_EXPRESSION)' : ' (default)'}.`);
    }

    /**
     * Called automatically on the schedule set by EMAIL_SYNC_CRON_EXPRESSION
     * (see onModuleInit()). Pulls all enabled accounts and ingests any new
     * messages since each account's last processed UID.
     */
    async syncAll(): Promise<void> {
        const accounts = await this.prisma.emailAccount.findMany({
            where: { enabled: true },
        });

        this.logger.log(`Starting email sync for ${accounts.length} enabled account(s).`);

        for (const account of accounts) {
            try {
                await this.syncAccount(account.id);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`Failed to sync email account ${account.id}: ${message}`);
            }
        }
    }

    /**
     * Sync a single account by ID. Public so it can be triggered manually.
     */
    async syncAccount(accountId: string): Promise<{ processed: number; skipped: number; failed: number }> {
        const account = await this.prisma.emailAccount.findUnique({
            where: { id: accountId },
            include: { user: { select: { clerkId: true } } },
        });

        if (!account) {
            throw new Error(`Email account ${accountId} not found`);
        }

        if (!account.enabled) {
            return { processed: 0, skipped: 0, failed: 0 };
        }

        const password = this.emailAccountService.decryptPassword(account.encryptedPassword);

        // Use the account owner's own model/BYOK-key preference from Settings
        // instead of always falling back to the app default — matches how the
        // manual upload endpoint (ExtractionController) resolves it.
        // NOTE: UsersService looks users up by clerkId, not the internal User.id
        // that account.userId holds — pass account.user.clerkId, not account.userId,
        // or this silently matches the wrong (or no) user.
        const [userSettings, apiKeyOverride] = await Promise.all([
            this.usersService.getSettings(account.user.clerkId),
            this.usersService.getDecryptedApiKey(account.user.clerkId),
        ]);

        let processed = 0;
        let skipped = 0;
        let failed = 0;
        let highestUid = account.lastProcessedUid;
        // Per-message extraction failure (rate limit, bad model output, etc.) —
        // informational only. It must NOT flip lastSyncStatus to ERROR: the sync
        // itself (IMAP connect + fetch, the outer try/catch below) succeeded, so
        // the account is not broken — some message's AI processing just failed.
        // Conflating the two made a single rate-limited email look like the
        // whole mailbox connection was down.
        let lastExtractionError: string | null = null;

        try {
            const messages = await this.fetchMessagesSinceUid(account, password);

            this.logger.log(
                `IMAP fetch for account ${accountId} returned ${messages.length} message(s) since UID ${account.lastProcessedUid}: [${messages.map((m) => m.uid).join(', ')}]`,
            );

            for (const message of messages) {
                try {
                    const parsed = await simpleParser(message.body);

                    this.logger.log(
                        `Email UID ${message.uid}: date="${parsed.date?.toISOString() ?? '(unknown)'}" subject="${parsed.subject ?? '(none)'}" ` +
                        `from="${parsed.from?.text ?? '(unknown)'}" bodyChars=${(parsed.text ?? '').length} attachments=${parsed.attachments.length}`,
                    );

                    if (EmailIngestionService.DEBUG_FETCH_ONLY) {
                        // Fetch-and-log only — no extraction call, and lastProcessedUid
                        // deliberately does not advance, so every sync (manual or cron)
                        // keeps showing the true latest message(s) instead of consuming
                        // the backlog. See DEBUG_FETCH_ONLY's doc comment.
                        skipped++;
                        continue;
                    }

                    if (!this.hasExtractableContent(parsed)) {
                        this.logger.debug(`Skipping email UID ${message.uid}: no extractable content.`);
                        skipped++;
                        if (message.uid > highestUid) {
                            highestUid = message.uid;
                        }
                        continue;
                    }

                    const textPayload = this.buildTextPayload(parsed);
                    const documentAttachments = this.collectDocumentAttachments(parsed);

                    // Prefer the first document attachment as the primary source.
                    const file = documentAttachments[0];

                    const extractionResult = await this.extractionService.processFile(
                        file,
                        textPayload || undefined,
                        userSettings.modelKey,
                        apiKeyOverride,
                        userSettings.processingMode,
                        'auto',
                    );

                    await this.routeExtractionResult(extractionResult, account.user.clerkId);
                    processed++;

                    if (message.uid > highestUid) {
                        highestUid = message.uid;
                    }
                } catch (innerError) {
                    const messageText = innerError instanceof Error ? innerError.message : 'Unknown error';
                    this.logger.error(`Failed to process email UID ${message.uid} for account ${accountId}: ${messageText}`);
                    failed++;
                    lastExtractionError = messageText;
                    if (message.uid > highestUid) {
                        highestUid = message.uid;
                    }
                }
            }

            await this.prisma.emailAccount.update({
                where: { id: accountId },
                data: {
                    lastProcessedUid: highestUid,
                    lastSyncAt: new Date(),
                    // Reaching here means the IMAP connection + fetch succeeded —
                    // that's what "sync" means. A message failing AI extraction is
                    // a separate, per-message concern (see lastExtractionError
                    // above), surfaced via lastSyncError for visibility without
                    // marking the whole account as broken.
                    lastSyncStatus: 'OK',
                    lastSyncError: lastExtractionError,
                },
            });
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to sync account ${accountId}: ${messageText}`);

            await this.prisma.emailAccount.update({
                where: { id: accountId },
                data: {
                    lastSyncAt: new Date(),
                    lastSyncStatus: 'ERROR',
                    lastSyncError: messageText,
                },
            });

            throw error;
        }

        this.logger.log(`Email sync complete for account ${accountId}: ${processed} processed, ${skipped} skipped, ${failed} failed, highest UID ${highestUid}.`);
        return { processed, skipped, failed };
    }

    private hasExtractableContent(parsed: ParsedMail): boolean {
        const hasDocumentAttachment = this.collectDocumentAttachments(parsed).length > 0;
        const hasBodyText = (parsed.text ?? '').trim().length > 0;
        return hasDocumentAttachment || hasBodyText;
    }

    /**
     * @param clerkId - Orders/Invoices/Documents services all resolve their
     * owning User via a clerkId connectOrCreate, not the internal User.id —
     * passing the wrong one silently creates a phantom user row instead of
     * erroring, so the param is named for what it actually has to be.
     */
    private async routeExtractionResult(result: any, clerkId: string): Promise<void> {
        const documentType: string = result.documentType;
        const data = result.extractedData;
        const confidence = result.confidence;
        const avgConfidence = result.avgConfidence;

        switch (documentType) {
            case 'invoice':
                await this.invoicesService.saveInvoice(data, clerkId, undefined, confidence, avgConfidence);
                this.logger.log(`Routed email extraction to invoice pipeline.`);
                break;
            case 'purchaseOrder':
                await this.ordersService.saveOrder(data, clerkId, confidence, avgConfidence);
                this.logger.log(`Routed email extraction to purchase-order pipeline.`);
                break;
            case 'receipt':
            case 'resume':
                await this.documentsService.saveDocument(documentType, data, clerkId, confidence, avgConfidence);
                this.logger.log(`Routed email extraction to generic document pipeline (${documentType}).`);
                break;
            default:
                this.logger.warn(`Email returned unhandled document type '${documentType}' — flagging for review.`);
                await this.documentsService.saveDocument(documentType || 'unknown', data, clerkId, confidence, avgConfidence);
                break;
        }
    }

    private buildTextPayload(parsed: ParsedMail): string {
        const parts: string[] = [];

        if (parsed.subject) parts.push(`Email Subject: ${parsed.subject}`);
        if (parsed.from?.text) parts.push(`Email From: ${parsed.from.text}`);

        const toText = Array.isArray(parsed.to)
            ? parsed.to.map((addr) => addr.text).filter(Boolean).join(', ')
            : parsed.to?.text;
        if (toText) parts.push(`Email To: ${toText}`);

        if (parsed.date) parts.push(`Email Date: ${parsed.date.toISOString()}`);

        const attachmentNames = parsed.attachments
            .map((att) => att.filename)
            .filter((name): name is string => typeof name === 'string' && name.length > 0);

        if (attachmentNames.length > 0) {
            parts.push(`Email Attachments: ${attachmentNames.join(', ')}`);
        }

        if (parsed.text) {
            parts.push('--- Email Body ---');
            parts.push(parsed.text);
        }

        return parts.join('\n\n');
    }

    private collectDocumentAttachments(parsed: ParsedMail): Express.Multer.File[] {
        const supportedMimeTypes = new Set([
            'application/pdf',
            'image/png',
            'image/jpeg',
            'image/webp',
            'text/plain',
            'text/csv',
            'application/json',
        ]);

        return parsed.attachments
            .filter((att) => {
                if (supportedMimeTypes.has(att.contentType)) return true;
                const name = att.filename?.toLowerCase() ?? '';
                return name.endsWith('.pdf') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.txt') || name.endsWith('.csv') || name.endsWith('.json');
            })
            .map((att, index) => ({
                fieldname: 'file',
                originalname: att.filename ?? `attachment-${index + 1}.pdf`,
                encoding: '7bit',
                mimetype: 'application/pdf',
                buffer: att.content,
                size: att.content.length,
                stream: null as any,
                destination: '',
                filename: att.filename ?? `attachment-${index + 1}.pdf`,
                path: '',
            }));
    }

    private fetchMessagesSinceUid(account: any, password: string): Promise<{ uid: number; body: Buffer }[]> {
        return new Promise((resolve, reject) => {
            const client = new Imap({
                host: account.imapHost,
                port: account.imapPort,
                tls: account.imapSecure,
                user: account.username,
                password,
                tlsOptions: { rejectUnauthorized: false },
                connTimeout: 30000,
                // node-imap's authTimeout defaults to 5000ms independent of
                // connTimeout — Gmail's auth handshake routinely takes longer
                // than that, which is what was actually causing every fetch to
                // fail with "Timed out while authenticating with server".
                authTimeout: 30000,
            });

            const messages: { uid: number; body: Buffer }[] = [];

            client.once('ready', () => {
                this.logger.log(`IMAP connected to ${account.imapHost}:${account.imapPort} as ${account.username}.`);

                client.openBox('INBOX', true, (err) => {
                    if (err) {
                        this.logger.error(`IMAP openBox('INBOX') failed: ${err.message}`);
                        client.end();
                        return reject(err);
                    }

                    // Search for UIDs strictly greater than the last processed one.
                    client.search([['UID', `${account.lastProcessedUid + 1}:*`]], (searchErr, results) => {
                        if (searchErr) {
                            this.logger.error(`IMAP UID search failed: ${searchErr.message}`);
                            client.end();
                            return reject(searchErr);
                        }

                        this.logger.log(`IMAP search UID ${account.lastProcessedUid + 1}:* matched ${results?.length ?? 0} message(s).`);

                        if (!results || results.length === 0) {
                            client.end();
                            return resolve([]);
                        }

                        // DEBUG_FETCH_ONLY: newest-first (UID is a reliable proxy for
                        // recency within one mailbox) so every sync shows the latest
                        // message(s) instead of the oldest of a large backlog.
                        // Normal mode: oldest-first, capped — the next sync picks up
                        // where this one left off since lastProcessedUid only advances
                        // to what was actually fetched, gradually draining a backlog.
                        const batch = [...results]
                            .sort((a, b) => (EmailIngestionService.DEBUG_FETCH_ONLY ? b - a : a - b))
                            .slice(0, EmailIngestionService.MAX_MESSAGES_PER_SYNC);

                        const fetch = client.fetch(batch, { bodies: '', struct: false });

                        fetch.on('message', (msg, seqno) => {
                            let uid = 0;
                            let buffer = Buffer.alloc(0);

                            msg.on('attributes', (attrs: any) => {
                                uid = attrs.uid;
                            });

                            msg.on('body', (stream) => {
                                stream.on('data', (chunk: Buffer) => {
                                    buffer = Buffer.concat([buffer, chunk]);
                                });
                            });

                            msg.once('end', () => {
                                if (uid > 0) {
                                    messages.push({ uid, body: buffer });
                                }
                            });
                        });

                        fetch.once('error', (fetchErr: Error) => {
                            client.end();
                            reject(fetchErr);
                        });

                        fetch.once('end', () => {
                            client.end();
                            resolve(messages);
                        });
                    });
                });
            });

            client.once('error', (err: Error) => {
                this.logger.error(`IMAP connection error for ${account.imapHost}:${account.imapPort}: ${err.message}`);
                client.end();
                reject(err);
            });

            this.logger.log(`IMAP connecting to ${account.imapHost}:${account.imapPort}...`);
            client.connect();
        });
    }
}
