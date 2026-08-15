import { EmailIngestionService } from '../email-ingestion.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailAccountService } from '../email-account.service';
import { ExtractionService } from '../../extraction/extraction.service';
import { ComplianceService } from '../../compliance/compliance.service';
import { OrdersService } from '../../orders/orders.service';
import { InvoicesService } from '../../invoices/invoices.service';
import { DocumentsService } from '../../documents/documents.service';
import { UsersService } from '../../users/users.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

jest.mock('imap', () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('mailparser', () => ({
    simpleParser: jest.fn(),
}));

const mockedImap = Imap as unknown as jest.MockedClass<typeof Imap>;
const mockedSimpleParser = simpleParser as jest.Mock;

function makePrismaMock(accountOverrides?: any) {
    const account = {
        id: 'acc-1',
        userId: 'user-1',
        email: 'procurement@company.com',
        imapHost: 'imap.company.com',
        imapPort: 993,
        imapSecure: true,
        username: 'user',
        encryptedPassword: 'enc:pass',
        enabled: true,
        lastProcessedUid: 10,
        lastSyncAt: new Date(),
        lastSyncStatus: 'PENDING',
        lastSyncError: null,
        user: { clerkId: 'clerk-user-1' },
        ...accountOverrides,
    };

    return {
        emailAccount: {
            findUnique: jest.fn().mockResolvedValue(account),
            update: jest.fn().mockResolvedValue(account),
        },
    } as unknown as PrismaService;
}

function makeEmailAccountServiceMock() {
    return {
        decryptPassword: jest.fn().mockReturnValue('pass'),
    } as unknown as EmailAccountService;
}

function makeExtractionServiceMock() {
    return {
        processFile: jest.fn().mockResolvedValue({
            documentType: 'purchaseOrder',
            extractedData: {
                poNumber: 'PO-EMAIL-001',
                orderDate: '2024-03-15',
                customerName: 'Email Customer',
                customerEmail: 'procurement@company.com',
                shippingAddress: null,
                currency: 'USD',
                totalAmount: 1500,
                lineItems: [
                    {
                        lineNumber: 1,
                        rawDescription: 'Ball valve 6 inch flanged',
                        matchedSystemSku: null,
                        skuMatchScore: 0,
                        quantity: 5,
                        unitPrice: 300,
                        totalAmount: 1500,
                    },
                ],
            },
            confidence: {},
            avgConfidence: 0.85,
        }),
    } as unknown as ExtractionService;
}

function makeOrdersServiceMock() {
    return {
        saveOrder: jest.fn().mockResolvedValue({ id: 'po-1' }),
    } as unknown as OrdersService;
}

function makeInvoicesServiceMock() {
    return {
        saveInvoice: jest.fn().mockResolvedValue({ id: 'inv-1' }),
    } as unknown as InvoicesService;
}

function makeDocumentsServiceMock() {
    return {
        saveDocument: jest.fn().mockResolvedValue({ id: 'doc-1' }),
    } as unknown as DocumentsService;
}

function makeComplianceServiceMock() {
    return {
        mask: jest.fn().mockImplementation((text: string) => text),
    } as unknown as ComplianceService;
}

function makeUsersServiceMock() {
    return {
        getSettings: jest.fn().mockResolvedValue({ modelKey: 'groq:llama-4-scout', processingMode: 'vision' }),
        getDecryptedApiKey: jest.fn().mockResolvedValue(undefined),
    } as unknown as UsersService;
}

function makeSchedulerRegistryMock() {
    return {
        addCronJob: jest.fn(),
    } as unknown as SchedulerRegistry;
}

interface MockMessage {
    uid: number;
    body: Buffer;
    parsed?: any;
}

function makeImapMock(messages: MockMessage[]) {
    const connect = jest.fn().mockImplementation(() => {
        const handler = readyHandler;
        if (handler) setImmediate(() => handler());
    });
    const end = jest.fn();
    let readyHandler: (() => void) | null = null;

    const once = jest.fn().mockImplementation((event: string, handler: any) => {
        if (event === 'ready') {
            readyHandler = handler;
        }
        return { connect, end, once, openBox, search, fetch } as any;
    });

    const openBox = jest.fn().mockImplementation((_box: string, _readonly: boolean, cb: any) => cb(null));

    const search = jest.fn().mockImplementation((_criteria: any, cb: any) => {
        cb(null, messages.map((m) => m.uid));
    });

    const fetch = jest.fn().mockImplementation((_uids: any, _opts: any) => {
        let messageIndex = 0;
        const emitter = {
            on: (event: string, handler: any) => {
                if (event === 'message') {
                    messages.forEach((msg, i) => {
                        const bodyEmitter = {
                            on: (bodyEvent: string, bodyHandler: any) => {
                                if (bodyEvent === 'data') bodyHandler(msg.body);
                            },
                        };

                        const msgEmitter = {
                            on: (msgEvent: string, msgHandler: any) => {
                                if (msgEvent === 'body') msgHandler(bodyEmitter);
                                if (msgEvent === 'attributes') msgHandler({ uid: msg.uid });
                            },
                            once: (msgEvent: string, msgHandler: any) => {
                                if (msgEvent === 'end') {
                                    setTimeout(() => msgHandler(), messageIndex++ * 10);
                                }
                            },
                        };
                        handler(msgEmitter, i + 1);
                    });
                }
            },
            once: (event: string, handler: any) => {
                if (event === 'end') {
                    setTimeout(() => handler(), messages.length * 10 + 10);
                }
            },
        };
        return emitter;
    });

    const instance = { connect, end, once, openBox, search, fetch };
    mockedImap.mockImplementation(() => instance as any);

    return instance as any;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EmailIngestionService', () => {
    let service: EmailIngestionService;
    let prisma: PrismaService;
    let emailAccountService: EmailAccountService;
    let extractionService: ExtractionService;
    let complianceService: ComplianceService;
    let ordersService: OrdersService;
    let invoicesService: InvoicesService;
    let documentsService: DocumentsService;
    let usersService: UsersService;
    let schedulerRegistry: SchedulerRegistry;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedImap.mockClear();
        mockedSimpleParser.mockReset();

        // DEBUG_FETCH_ONLY is a temporary flag (see its doc comment) that makes
        // the real class skip extraction entirely. Force it off here so this
        // describe block keeps covering the actual extraction/routing logic;
        // a dedicated describe block below covers the flag itself.
        (EmailIngestionService as any).DEBUG_FETCH_ONLY = false;

        prisma = makePrismaMock();
        emailAccountService = makeEmailAccountServiceMock();
        extractionService = makeExtractionServiceMock();
        complianceService = makeComplianceServiceMock();
        ordersService = makeOrdersServiceMock();
        invoicesService = makeInvoicesServiceMock();
        documentsService = makeDocumentsServiceMock();
        usersService = makeUsersServiceMock();
        schedulerRegistry = makeSchedulerRegistryMock();

        service = new EmailIngestionService(
            prisma,
            emailAccountService,
            extractionService,
            complianceService,
            ordersService,
            invoicesService,
            documentsService,
            usersService,
            schedulerRegistry,
        );
    });

    describe('syncAccount()', () => {
        it('processes a purchase-order email and saves it as an order', async () => {
            makeImapMock([{ uid: 11, body: Buffer.from('email body') }]);
            mockedSimpleParser.mockResolvedValue({
                subject: 'Purchase Order PO-EMAIL-001',
                text: 'Please find the attached purchase order.',
                from: { text: 'procurement@company.com' },
                attachments: [
                    {
                        filename: 'po-001.pdf',
                        contentType: 'application/pdf',
                        content: Buffer.from('pdf bytes'),
                    },
                ],
            });

            const result = await service.syncAccount('acc-1');

            expect(result.processed).toBe(1);
            expect(result.skipped).toBe(0);
            expect(extractionService.processFile).toHaveBeenCalledWith(
                expect.objectContaining({ mimetype: 'application/pdf' }),
                expect.stringContaining('Purchase Order PO-EMAIL-001'),
                'groq:llama-4-scout',
                undefined,
                'vision',
                'auto',
            );
            expect(ordersService.saveOrder).toHaveBeenCalled();
            expect(invoicesService.saveInvoice).not.toHaveBeenCalled();
            expect(prisma.emailAccount.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ lastProcessedUid: 11, lastSyncStatus: 'OK' }),
                }),
            );
        });

        it('processes an invoice email and routes it to the invoice pipeline', async () => {
            makeImapMock([{ uid: 12, body: Buffer.from('email body') }]);
            mockedSimpleParser.mockResolvedValue({
                subject: 'Invoice INV-EMAIL-002',
                text: 'Please find the attached invoice.',
                from: { text: 'billing@company.com' },
                attachments: [
                    {
                        filename: 'inv-002.pdf',
                        contentType: 'application/pdf',
                        content: Buffer.from('pdf bytes'),
                    },
                ],
            });
            (extractionService.processFile as jest.Mock).mockResolvedValue({
                documentType: 'invoice',
                extractedData: { invoiceNumber: 'INV-EMAIL-002' },
                confidence: {},
                avgConfidence: 0.9,
            });

            const result = await service.syncAccount('acc-1');

            expect(result.processed).toBe(1);
            expect(result.skipped).toBe(0);
            expect(extractionService.processFile).toHaveBeenCalledWith(
                expect.objectContaining({ mimetype: 'application/pdf' }),
                expect.stringContaining('Invoice INV-EMAIL-002'),
                'groq:llama-4-scout',
                undefined,
                'vision',
                'auto',
            );
            expect(invoicesService.saveInvoice).toHaveBeenCalledWith(
                expect.objectContaining({ invoiceNumber: 'INV-EMAIL-002' }),
                'clerk-user-1',
                undefined,
                expect.anything(),
                0.9,
            );
            expect(ordersService.saveOrder).not.toHaveBeenCalled();
        });

        it('processes body-text-only emails without attachments', async () => {
            makeImapMock([{ uid: 12, body: Buffer.from('email body') }]);
            mockedSimpleParser.mockResolvedValue({
                subject: 'Quote for new fittings',
                text: 'Please review the quote below and confirm the order.',
                from: { text: 'sales@company.com' },
                attachments: [],
            });
            (extractionService.processFile as jest.Mock).mockResolvedValue({
                documentType: 'purchaseOrder',
                extractedData: { poNumber: 'PO-TEXT-003' },
                confidence: {},
                avgConfidence: 0.75,
            });

            const result = await service.syncAccount('acc-1');

            expect(result.processed).toBe(1);
            expect(result.skipped).toBe(0);
            expect(extractionService.processFile).toHaveBeenCalledWith(
                undefined,
                expect.stringContaining('Quote for new fittings'),
                'groq:llama-4-scout',
                undefined,
                'vision',
                'auto',
            );
            expect(ordersService.saveOrder).toHaveBeenCalled();
        });

        it('routes a receipt to the generic document pipeline', async () => {
            makeImapMock([{ uid: 14, body: Buffer.from('email body') }]);
            mockedSimpleParser.mockResolvedValue({
                subject: 'Receipt for your payment',
                text: 'Thank you for your payment.',
                from: { text: 'payments@company.com' },
                attachments: [
                    {
                        filename: 'receipt.pdf',
                        contentType: 'application/pdf',
                        content: Buffer.from('pdf bytes'),
                    },
                ],
            });
            (extractionService.processFile as jest.Mock).mockResolvedValue({
                documentType: 'receipt',
                extractedData: { merchantName: 'Acme Co' },
                confidence: {},
                avgConfidence: 0.8,
            });

            const result = await service.syncAccount('acc-1');

            expect(result.processed).toBe(1);
            expect(documentsService.saveDocument).toHaveBeenCalledWith(
                'receipt',
                expect.objectContaining({ merchantName: 'Acme Co' }),
                'clerk-user-1',
                expect.anything(),
                0.8,
            );
            expect(invoicesService.saveInvoice).not.toHaveBeenCalled();
            expect(ordersService.saveOrder).not.toHaveBeenCalled();
        });

        it('skips emails with no body text and no document attachments', async () => {
            makeImapMock([{ uid: 15, body: Buffer.from('random email') }]);
            mockedSimpleParser.mockResolvedValue({
                subject: 'Weekly team update',
                text: '',
                from: { text: 'team@company.com' },
                attachments: [],
            });

            const result = await service.syncAccount('acc-1');

            expect(result.processed).toBe(0);
            expect(result.skipped).toBe(1);
            expect(extractionService.processFile).not.toHaveBeenCalled();
        });

        it('updates the last processed UID even when extraction fails', async () => {
            makeImapMock([{ uid: 13, body: Buffer.from('bad email') }]);
            mockedSimpleParser.mockResolvedValue({
                subject: 'Purchase Order PO-BAD',
                text: 'Please see attached PO.',
                from: { text: 'vendor@example.com' },
                attachments: [
                    {
                        filename: 'po.pdf',
                        contentType: 'application/pdf',
                        content: Buffer.from('pdf bytes'),
                    },
                ],
            });
            (extractionService.processFile as jest.Mock).mockRejectedValue(new Error('Extraction failed'));

            const result = await service.syncAccount('acc-1');

            expect(result.processed).toBe(0);
            expect(result.skipped).toBe(0);
            expect(prisma.emailAccount.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ lastProcessedUid: 13, lastSyncStatus: 'ERROR' }),
                }),
            );
        });
    });

    describe('syncAccount() — DEBUG_FETCH_ONLY mode', () => {
        it('fetches and logs the latest message(s) without calling extraction, and does not advance lastProcessedUid', async () => {
            (EmailIngestionService as any).DEBUG_FETCH_ONLY = true;

            makeImapMock([{ uid: 20, body: Buffer.from('email body') }]);
            mockedSimpleParser.mockResolvedValue({
                subject: 'Purchase Order PO-EMAIL-999',
                text: 'Please find the attached purchase order.',
                from: { text: 'procurement@company.com' },
                attachments: [],
            });

            const result = await service.syncAccount('acc-1');

            expect(result.processed).toBe(0);
            expect(extractionService.processFile).not.toHaveBeenCalled();
            expect(ordersService.saveOrder).not.toHaveBeenCalled();
            expect(invoicesService.saveInvoice).not.toHaveBeenCalled();
            expect(documentsService.saveDocument).not.toHaveBeenCalled();
            expect(prisma.emailAccount.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ lastProcessedUid: 10 }), // unchanged — see makePrismaMock's default
                }),
            );
        });
    });
});
