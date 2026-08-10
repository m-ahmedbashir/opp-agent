import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { ExtractionModule } from './modules/extraction/extraction.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { UsersModule } from './modules/users/users.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, ComplianceModule, ExtractionModule, InvoicesModule, UsersModule, CatalogModule, OrdersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
