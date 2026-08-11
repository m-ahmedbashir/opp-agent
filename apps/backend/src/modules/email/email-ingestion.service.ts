import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailAccountService } from './email-account.service';
import { ExtractionService } from '../extraction/extraction.service';
import { ComplianceService } from '../compliance/compliance.service';
import { OrdersService } from '../orders/orders.service';
import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';

const PO_KEYWORDS = [
    'purchase order',
    'po number',
    'p.o. number',
    'new order',
    'order confirmation',
    'purchaseorder',
];

/**
 * Polls connected IMAP email accounts and feeds candidate purchase-order
 * emails into the existing extraction/SKU-matching/approval pipeline.
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

                    if (this.isPurchaseOrderCandidate(parsed)) {
                        const textPayload = this.buildTextPayload(parsed);
                        const pdfAttachments = this.collectPdfAttachments(parsed);

                        if (pdfAttachments.length === 0 && !textPayload.trim()) {
                            this.logger.debug(`Skipping email UID ${message.uid}: no extractable content.`);
                            skipped++;
                            continue;
                        }

                        // Prefer the first PDF attachment as the primary source.
                        const file = pdfAttachments[0];

                        const extractionResult = await this.extractionService.processFile(
                            file,
                            textPayload || undefined,
                            undefined, // modelKey
                            undefined, // apiKeyOverride
                            undefined, // processingMode
                            'purchaseOrder',
                        );

                        const orderData = extractionResult.extractedData as any;
                        await this.ordersService.saveOrder(
                            orderData,
                            account.userId,
                            extractionResult.confidence as any,
                            extractionResult.avgConfidence,
                        );

                        processed++;
                    } else {
                        skipped++;
                    }

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

    private isPurchaseOrderCandidate(parsed: ParsedMail): boolean {
        const subject = (parsed.subject ?? '').toLowerCase();
        const text = (parsed.text ?? '').toLowerCase();
        const combined = `${subject} ${text}`;

        const hasKeyword = PO_KEYWORDS.some((keyword) => combined.includes(keyword.toLowerCase()));
        const hasPdfAttachment = parsed.attachments.some((att) => att.contentType === 'application/pdf' || att.filename?.toLowerCase().endsWith('.pdf'));

        return hasKeyword || hasPdfAttachment;
    }

    private buildTextPayload(parsed: ParsedMail): string {
        const parts: string[] = [];
        if (parsed.subject) parts.push(`Subject: ${parsed.subject}`);
        if (parsed.from?.text) parts.push(`From: ${parsed.from.text}`);
        if (parsed.text) parts.push(parsed.text);
        return parts.join('\n\n');
    }

    private collectPdfAttachments(parsed: ParsedMail): Express.Multer.File[] {
        return parsed.attachments
            .filter((att) => att.contentType === 'application/pdf' || att.filename?.toLowerCase().endsWith('.pdf'))
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
