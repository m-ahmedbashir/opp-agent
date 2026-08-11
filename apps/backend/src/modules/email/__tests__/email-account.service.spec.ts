import { UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailAccountService, CreateEmailAccountDto } from '../email-account.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import Imap from 'imap';

jest.mock('imap', () => ({
    __esModule: true,
    default: jest.fn(),
}));

const mockedImap = Imap as unknown as jest.MockedClass<typeof Imap>;

function makePrismaMock() {
    const accounts: any[] = [];
    return {
        emailAccount: {
            create: jest.fn().mockImplementation(({ data }: any) => {
                const account = {
                    id: 'acc-1',
                    ...data,
                    userId: data.user?.connectOrCreate?.where?.clerkId ?? 'user-1',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                accounts.push(account);
                return Promise.resolve(account);
            }),
            findMany: jest.fn().mockImplementation(({ where }: any) => {
                return Promise.resolve(accounts.filter((a) => a.userId === where.user?.clerkId));
            }),
            findFirst: jest.fn().mockImplementation(({ where }: any) => {
                return Promise.resolve(
                    accounts.find((a) => a.id === where.id && a.userId === where.user?.clerkId) ?? null,
                );
            }),
            findUnique: jest.fn().mockImplementation(({ where }: any) => {
                return Promise.resolve(accounts.find((a) => a.id === where.id) ?? null);
            }),
            update: jest.fn().mockImplementation(({ where, data }: any) => {
                const account = accounts.find((a) => a.id === where.id);
                if (!account) return Promise.resolve(null);
                Object.assign(account, data, { updatedAt: new Date() });
                return Promise.resolve(account);
            }),
            delete: jest.fn().mockImplementation(({ where }: any) => {
                const idx = accounts.findIndex((a) => a.id === where.id);
                if (idx >= 0) accounts.splice(idx, 1);
                return Promise.resolve({ id: where.id });
            }),
        },
    } as unknown as PrismaService;
}

function makeEncryptionMock() {
    return {
        encrypt: jest.fn().mockImplementation((text: string) => `enc:${text}`),
        decrypt: jest.fn().mockImplementation((text: string) => text.replace(/^enc:/, '')),
    } as unknown as EncryptionService;
}

function makeImapMock(eventHandlers: { ready?: () => void; error?: (err: Error) => void }) {
    const connect = jest.fn();
    const end = jest.fn();
    const once = jest.fn().mockImplementation((event: string, handler: any) => {
        if (event === 'ready' && eventHandlers.ready) {
            setImmediate(() => handler());
        }
        if (event === 'error' && eventHandlers.error) {
            setImmediate(() => handler(new Error('IMAP error')));
        }
        return { connect, end, once } as any;
    });
    return { connect, end, once };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EmailAccountService', () => {
    let service: EmailAccountService;
    let prisma: PrismaService;
    let encryption: EncryptionService;

    const validDto: CreateEmailAccountDto = {
        email: 'procurement@company.com',
        imapHost: 'imap.company.com',
        imapPort: 993,
        imapSecure: true,
        username: 'procurement@company.com',
        password: 'secret',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockedImap.mockClear();
        prisma = makePrismaMock();
        encryption = makeEncryptionMock();
        service = new EmailAccountService(prisma, encryption);
    });

    describe('createAccount()', () => {
        it('encrypts the password and stores the account after a successful IMAP test', async () => {
            const { connect, end, once } = makeImapMock({ ready: () => undefined });
            mockedImap.mockImplementation(() => ({ connect, end, once } as any));

            const result = await service.createAccount('user-1', validDto);

            expect(connect).toHaveBeenCalled();
            expect(end).toHaveBeenCalled();
            expect(encryption.encrypt).toHaveBeenCalledWith('secret');
            expect(prisma.emailAccount.create).toHaveBeenCalled();
            expect(result.email).toBe('procurement@company.com');
            expect(result).not.toHaveProperty('encryptedPassword');
            expect(result).not.toHaveProperty('password');
        });

        it('throws BadRequestException when required fields are missing', async () => {
            await expect(service.createAccount('user-1', { ...validDto, email: '' })).rejects.toThrow(BadRequestException);
        });

        it('throws UnauthorizedException when the IMAP test fails', async () => {
            const { connect, end, once } = makeImapMock({ error: () => undefined });
            mockedImap.mockImplementation(() => ({ connect, end, once } as any));

            await expect(service.createAccount('user-1', validDto)).rejects.toThrow(UnauthorizedException);
            expect(end).toHaveBeenCalled();
            expect(prisma.emailAccount.create).not.toHaveBeenCalled();
        });
    });

    describe('getAccountsByUser()', () => {
        it('returns accounts without credentials', async () => {
            const { connect, end, once } = makeImapMock({ ready: () => undefined });
            mockedImap.mockImplementation(() => ({ connect, end, once } as any));
            await service.createAccount('user-1', validDto);

            const accounts = await service.getAccountsByUser('user-1');

            expect(accounts).toHaveLength(1);
            expect(accounts[0]).not.toHaveProperty('encryptedPassword');
            expect(accounts[0]).not.toHaveProperty('password');
            expect(accounts[0].email).toBe('procurement@company.com');
        });
    });

    describe('updateAccount()', () => {
        it('updates a password by re-testing the connection and re-encrypting', async () => {
            const { connect, end, once } = makeImapMock({ ready: () => undefined });
            mockedImap.mockImplementation(() => ({ connect, end, once } as any));
            await service.createAccount('user-1', validDto);

            jest.clearAllMocks();
            mockedImap.mockImplementation(() => ({ connect, end, once } as any));
            const result = await service.updateAccount('acc-1', 'user-1', { password: 'new-secret' });

            expect(connect).toHaveBeenCalled();
            expect(encryption.encrypt).toHaveBeenLastCalledWith('new-secret');
            expect(result).not.toHaveProperty('encryptedPassword');
        });

        it('throws NotFoundException for an unknown account', async () => {
            await expect(service.updateAccount('unknown', 'user-1', { enabled: false })).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteAccount()', () => {
        it('removes the account', async () => {
            const { connect, end, once } = makeImapMock({ ready: () => undefined });
            mockedImap.mockImplementation(() => ({ connect, end, once } as any));
            await service.createAccount('user-1', validDto);

            await service.deleteAccount('acc-1', 'user-1');

            const accounts = await service.getAccountsByUser('user-1');
            expect(accounts).toHaveLength(0);
        });
    });

    describe('decryptPassword()', () => {
        it('delegates to the encryption service', () => {
            expect(service.decryptPassword('enc:hello')).toBe('hello');
        });
    });
});
