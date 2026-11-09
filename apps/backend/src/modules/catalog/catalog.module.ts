import { Module } from '@nestjs/common';
import { ProductCatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';

@Module({
    controllers: [CatalogController],
    providers: [ProductCatalogService],
    exports: [ProductCatalogService],
})
export class CatalogModule {}
