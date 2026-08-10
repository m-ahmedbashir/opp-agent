import { Controller, Get } from '@nestjs/common';
import { ProductCatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
    constructor(private readonly catalogService: ProductCatalogService) {}

    @Get()
    getCatalog() {
        return this.catalogService.getCatalog();
    }
}
