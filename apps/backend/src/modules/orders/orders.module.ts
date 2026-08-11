import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CatalogModule } from '../catalog/catalog.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [CatalogModule, ExtractionModule, PrismaModule, UsersModule],
    providers: [OrdersService],
    controllers: [OrdersController],
    exports: [OrdersService],
})
export class OrdersModule {}
