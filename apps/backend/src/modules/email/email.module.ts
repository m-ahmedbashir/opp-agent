import { Module } from '@nestjs/common';
import { EmailAccountService } from './email-account.service';
import { EmailIngestionService } from './email-ingestion.service';
import { EmailController } from './email.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { ComplianceModule } from '../compliance/compliance.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { OrdersModule } from '../orders/orders.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { DocumentsModule } from '../documents/documents.module';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [PrismaModule, ComplianceModule, ExtractionModule, OrdersModule, InvoicesModule, DocumentsModule, UsersModule],
    providers: [EmailAccountService, EmailIngestionService, EncryptionService],
    controllers: [EmailController],
})
export class EmailModule {}
