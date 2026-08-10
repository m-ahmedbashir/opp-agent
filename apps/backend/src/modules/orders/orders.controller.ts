import {
    Controller,
    Post,
    Get,
    Param,
    UploadedFile,
    UseInterceptors,
    Body,
    HttpCode,
    HttpStatus,
    ParseFilePipe,
    MaxFileSizeValidator,
    FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { OrdersService } from './orders.service';
import { UsersService } from '../users/users.service';

import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const ExtractOrderSchema = z.object({
    text: z.string().optional(),
    userId: z.string().optional(),
    processingMode: z.enum(['vision', 'local-ocr']).optional(),
});

export class ExtractOrderDto extends createZodDto(ExtractOrderSchema) {}

@Controller('orders')
export class OrdersController {
    constructor(
        private readonly ordersService: OrdersService,
        private readonly usersService: UsersService,
    ) {}

    @Get('user/:userId')
    async getOrdersByUser(@Param('userId') userId: string) {
        return this.ordersService.getOrdersByUser(userId);
    }

    @Post('extract')
    @HttpCode(HttpStatus.OK)
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            limits: { fileSize: 10 * 1024 * 1024 },
        }),
    )
    async extractOrder(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
                    new FileTypeValidator({
                        fileType:
                            /^(text\/plain|text\/csv|application\/json|application\/pdf|image\/(png|jpeg|webp))$/,
                    }),
                ],
                fileIsRequired: false,
            }),
        )
        file: Express.Multer.File | undefined,
        @Body() dto: ExtractOrderDto,
    ) {
        let modelKey: string | undefined;
        let apiKeyOverride: string | undefined;
        let userProcessingMode: string | undefined;

        if (dto.userId) {
            const [settings, key] = await Promise.all([
                this.usersService.getSettings(dto.userId),
                this.usersService.getDecryptedApiKey(dto.userId),
            ]);
            modelKey = settings.modelKey;
            userProcessingMode = settings.processingMode;
            apiKeyOverride = key;
        }

        return this.ordersService.extractAndSaveOrder(
            file,
            dto.text,
            dto.userId ?? 'default-user',
            modelKey,
            apiKeyOverride,
            dto.processingMode || userProcessingMode,
        );
    }

    @Post(':id/approve')
    async approveOrder(@Param('id') id: string) {
        return this.ordersService.approveOrder(id);
    }

    @Post(':orderId/line-items/:lineItemId/sku')
    async updateLineItemSku(
        @Param('orderId') orderId: string,
        @Param('lineItemId') lineItemId: string,
        @Body('matchedSystemSku') matchedSystemSku: string,
    ) {
        return this.ordersService.updateLineItemSku(orderId, lineItemId, matchedSystemSku);
    }
}
