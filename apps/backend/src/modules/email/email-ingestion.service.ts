import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailAccountService } from './email-account.service';
import { ExtractionService } from '../extraction/extraction.service';
import { ComplianceService } from '../compliance/compliance.service';
import { OrdersService } from '../orders/orders.service';
import { InvoicesService } from '../invoices/invoices.service';
import { DocumentsService } from '../documents/documents.service';
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
export class EmailIngestionService {
    private readonly logger = new Logger(EmailIngestionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly emailAccountService: EmailAccountService,
        private readonly extractionService: ExtractionService,
        private readonly complianceService: ComplianceService,
        private readonly ordersService: OrdersService,
        private readonly invoicesService: InvoicesService,
        private readonly documentsService: DocumentsService,
    ) {}

    /**
     * Called automatically every 5 minutes. Pulls all enabled accounts and
     * ingests any new messages since the last processed UID.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
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
    async syncAccount(accountId: string): Promise<{ processed: number; skipped: number }> {
        const account = await this.prisma.emailAccount.findUnique({
            where: { id: accountId },
        });

        if (!account) {
            throw new Error(`Email account ${accountId} not found`);
        }

        if (!account.enabled) {
            return { processed: 0, skipped: 0 };
        }

        const password = this.emailAccountService.decryptPassword(account.encryptedPassword);

        let processed = 0;
        let skipped = 0;
        let highestUid = account.lastProcessedUid;
        let lastError: string | null = null;

        try {
            const messages = await this.fetchMessagesSinceUid(account, password);

            for (const message of messages) {
                try {
                    const parsed = await simpleParser(message.body);

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
                        undefined, // modelKey
                        undefined, // apiKeyOverride
                        undefined, // processingMode
                        'auto',
                    );

                    await this.routeExtractionResult(extractionResult, account.userId);
                    processed++;

                    if (message.uid > highestUid) {
                        highestUid = message.uid;
                    }
                } catch (innerError) {
                    const messageText = innerError instanceof Error ? innerError.message : 'Unknown error';
                    this.logger.error(`Failed to process email UID ${message.uid} for account ${accountId}: ${messageText}`);
                    lastError = messageText;
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
                    lastSyncStatus: lastError ? 'ERROR' : 'OK',
                    lastSyncError: lastError,
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

        this.logger.log(`Email sync complete for account ${accountId}: ${processed} processed, ${skipped} skipped, highest UID ${highestUid}.`);
        return { processed, skipped };
    }

    private hasExtractableContent(parsed: ParsedMail): boolean {
        const hasDocumentAttachment = this.collectDocumentAttachments(parsed).length > 0;
        const hasBodyText = (parsed.text ?? '').trim().length > 0;
        return hasDocumentAttachment || hasBodyText;
    }

    private async routeExtractionResult(result: any, userId: string): Promise<void> {
        const documentType: string = result.documentType;
        const data = result.extractedData;
        const confidence = result.confidence;
        const avgConfidence = result.avgConfidence;

        switch (documentType) {
            case 'invoice':
                await this.invoicesService.saveInvoice(data, userId, undefined, confidence, avgConfidence);
                this.logger.log(`Routed email extraction to invoice pipeline.`);
                break;
            case 'purchaseOrder':
                await this.ordersService.saveOrder(data, userId, confidence, avgConfidence);
                this.logger.log(`Routed email extraction to purchase-order pipeline.`);
                break;
            case 'receipt':
            case 'resume':
                await this.documentsService.saveDocument(documentType, data, userId, confidence, avgConfidence);
                this.logger.log(`Routed email extraction to generic document pipeline (${documentType}).`);
                break;
            default:
                this.logger.warn(`Email returned unhandled document type '${documentType}' — flagging for review.`);
                await this.documentsService.saveDocument(documentType || 'unknown', data, userId, confidence, avgConfidence);
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
            });

            const messages: { uid: number; body: Buffer }[] = [];

            client.once('ready', () => {
                client.openBox('INBOX', true, (err) => {
                    if (err) {
                        client.end();
                        return reject(err);
                    }

                    // Search for UIDs strictly greater than the last processed one.
                    client.search([['UID', `${account.lastProcessedUid + 1}:*`]], (searchErr, results) => {
                        if (searchErr) {
                            client.end();
                            return reject(searchErr);
                        }

                        if (!results || results.length === 0) {
                            client.end();
                            return resolve([]);
                        }

                        const fetch = client.fetch(results, { bodies: '', struct: false });

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
                client.end();
                reject(err);
            });

            client.connect();
        });
    }
}
