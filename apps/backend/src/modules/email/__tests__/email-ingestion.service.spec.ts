import { EmailIngestionService } from '../email-ingestion.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailAccountService } from '../email-account.service';
import { ExtractionService } from '../../extraction/extraction.service';
import { ComplianceService } from '../../compliance/compliance.service';
import { OrdersService } from '../../orders/orders.service';
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

function makeComplianceServiceMock() {
    return {
        mask: jest.fn().mockImplementation((text: string) => text),
    } as unknown as ComplianceService;
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

    beforeEach(() => {
        jest.clearAllMocks();
        mockedImap.mockClear();
        mockedSimpleParser.mockReset();

        prisma = makePrismaMock();
        emailAccountService = makeEmailAccountServiceMock();
        extractionService = makeExtractionServiceMock();
        complianceService = makeComplianceServiceMock();
        ordersService = makeOrdersServiceMock();

        service = new EmailIngestionService(
            prisma,
            emailAccountService,
            extractionService,
            complianceService,
            ordersService,
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
                undefined,
                undefined,
                undefined,
                'purchaseOrder',
            );
            expect(ordersService.saveOrder).toHaveBeenCalled();
            expect(prisma.emailAccount.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ lastProcessedUid: 11, lastSyncStatus: 'OK' }),
                }),
            );
        });

        it('skips non-PO emails without attachments', async () => {
            makeImapMock([{ uid: 12, body: Buffer.from('random email') }]);
            mockedSimpleParser.mockResolvedValue({
                subject: 'Weekly team update',
                text: 'Here is the agenda.',
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
});
