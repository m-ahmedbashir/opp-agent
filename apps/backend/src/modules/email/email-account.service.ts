import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import Imap from 'imap';

export interface CreateEmailAccountDto {
    email: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    username: string;
    password: string;
}

export interface UpdateEmailAccountDto {
    email?: string;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
    username?: string;
    password?: string;
    enabled?: boolean;
}

export interface EmailAccountListItem {
    id: string;
    email: string;
    provider: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    username: string;
    enabled: boolean;
    lastProcessedUid: number;
    lastSyncAt: Date;
    lastSyncStatus: string;
    lastSyncError: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Manages email account credentials for IMAP-based ingestion.
 *
 * Passwords are encrypted with the same AES-256-GCM service used for BYOK provider
 * API keys and are never returned to callers.
 */
@Injectable()
export class EmailAccountService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
    ) {}

    async getAccountsByUser(userId: string): Promise<EmailAccountListItem[]> {
        const accounts = await this.prisma.emailAccount.findMany({
            where: { user: { clerkId: userId } },
            orderBy: { createdAt: 'desc' },
        });

        return accounts.map((account) => this.mapToListItem(account));
    }

    async getAccountById(id: string, userId: string) {
        const account = await this.prisma.emailAccount.findFirst({
            where: { id, user: { clerkId: userId } },
        });

        if (!account) {
            throw new NotFoundException(`Email account ${id} not found`);
        }

        return account;
    }

    async createAccount(userId: string, dto: CreateEmailAccountDto): Promise<EmailAccountListItem> {
        if (!dto.email || !dto.username || !dto.password || !dto.imapHost) {
            throw new BadRequestException('Email, username, password, and IMAP host are required');
        }

        await this.testImapConnection(dto);

        const encryptedPassword = this.encryptionService.encrypt(dto.password);

        const account = await this.prisma.emailAccount.create({
            data: {
                user: {
                    connectOrCreate: {
                        where: { clerkId: userId },
                        create: { clerkId: userId },
                    },
                },
                email: dto.email,
                provider: 'imap',
                imapHost: dto.imapHost,
                imapPort: dto.imapPort,
                imapSecure: dto.imapSecure,
                username: dto.username,
                encryptedPassword,
            },
        });

        return this.mapToListItem(account);
    }

    async updateAccount(id: string, userId: string, dto: UpdateEmailAccountDto): Promise<EmailAccountListItem> {
        const existing = await this.getAccountById(id, userId);

        const updateData: any = {};
        if (dto.email !== undefined) updateData.email = dto.email;
        if (dto.imapHost !== undefined) updateData.imapHost = dto.imapHost;
        if (dto.imapPort !== undefined) updateData.imapPort = dto.imapPort;
        if (dto.imapSecure !== undefined) updateData.imapSecure = dto.imapSecure;
        if (dto.username !== undefined) updateData.username = dto.username;
        if (dto.enabled !== undefined) updateData.enabled = dto.enabled;

        if (dto.password) {
            const testDto: CreateEmailAccountDto = {
                email: updateData.email ?? existing.email,
                imapHost: updateData.imapHost ?? existing.imapHost,
                imapPort: updateData.imapPort ?? existing.imapPort,
                imapSecure: updateData.imapSecure ?? existing.imapSecure,
                username: updateData.username ?? existing.username,
                password: dto.password,
            };
            await this.testImapConnection(testDto);
            updateData.encryptedPassword = this.encryptionService.encrypt(dto.password);
        } else if (Object.keys(updateData).length > 0) {
            // Re-test with existing password if connection settings changed.
            const password = this.decryptPassword(existing.encryptedPassword);
            const testDto: CreateEmailAccountDto = {
                email: updateData.email ?? existing.email,
                imapHost: updateData.imapHost ?? existing.imapHost,
                imapPort: updateData.imapPort ?? existing.imapPort,
                imapSecure: updateData.imapSecure ?? existing.imapSecure,
                username: updateData.username ?? existing.username,
                password,
            };
            await this.testImapConnection(testDto);
        }

        const updated = await this.prisma.emailAccount.update({
            where: { id },
            data: updateData,
        });

        return this.mapToListItem(updated);
    }

    async deleteAccount(id: string, userId: string): Promise<void> {
        await this.getAccountById(id, userId);
        await this.prisma.emailAccount.delete({ where: { id } });
    }

    decryptPassword(encryptedPassword: string): string {
        return this.encryptionService.decrypt(encryptedPassword);
    }

    async testImapConnection(dto: Pick<CreateEmailAccountDto, 'imapHost' | 'imapPort' | 'imapSecure' | 'username' | 'password'>): Promise<void> {
        return new Promise((resolve, reject) => {
            const client = new Imap({
                host: dto.imapHost,
                port: dto.imapPort,
                tls: dto.imapSecure,
                user: dto.username,
                password: dto.password,
                tlsOptions: { rejectUnauthorized: false },
                connTimeout: 15000,
            });

            client.once('ready', () => {
                client.end();
                resolve();
            });

            client.once('error', (err: Error) => {
                client.end();
                reject(new UnauthorizedException(`IMAP connection failed: ${err.message}`));
            });

            client.connect();
        });
    }

    private mapToListItem(account: any): EmailAccountListItem {
        return {
            id: account.id,
            email: account.email,
            provider: account.provider,
            imapHost: account.imapHost,
            imapPort: account.imapPort,
            imapSecure: account.imapSecure,
            username: account.username,
            enabled: account.enabled,
            lastProcessedUid: account.lastProcessedUid,
            lastSyncAt: account.lastSyncAt,
            lastSyncStatus: account.lastSyncStatus,
            lastSyncError: account.lastSyncError,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
        };
    }
}
