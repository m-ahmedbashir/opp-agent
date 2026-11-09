import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [DocumentsService],
    exports: [DocumentsService],
})
export class DocumentsModule {}
