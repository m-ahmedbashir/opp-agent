import { Module } from '@nestjs/common';
import { EmailAccountService } from './email-account.service';
import { EmailIngestionService } from './email-ingestion.service';
import { EmailController } from './email.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
    imports: [PrismaModule, ComplianceModule, ExtractionModule, OrdersModule],
    providers: [EmailAccountService, EmailIngestionService],
    controllers: [EmailController],
})
export class EmailModule {}
