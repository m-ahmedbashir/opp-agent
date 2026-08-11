import {
    Controller,
    Post,
    Get,
    Put,
    Delete,
    Param,
    Body,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { EmailAccountService, CreateEmailAccountDto, UpdateEmailAccountDto } from './email-account.service';
import { EmailIngestionService } from './email-ingestion.service';
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const CreateEmailAccountSchema = z.object({
    email: z.string().email(),
    imapHost: z.string().min(1),
    imapPort: z.number().int().min(1).max(65535).default(993),
    imapSecure: z.boolean().default(true),
    username: z.string().min(1),
    password: z.string().min(1),
});

export class CreateEmailAccountZodDto extends createZodDto(CreateEmailAccountSchema) {}

const UpdateEmailAccountSchema = z.object({
    email: z.string().email().optional(),
    imapHost: z.string().min(1).optional(),
    imapPort: z.number().int().min(1).max(65535).optional(),
    imapSecure: z.boolean().optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
});

export class UpdateEmailAccountZodDto extends createZodDto(UpdateEmailAccountSchema) {}

@Controller('email')
export class EmailController {
    constructor(
        private readonly emailAccountService: EmailAccountService,
        private readonly emailIngestionService: EmailIngestionService,
    ) {}

    @Get('accounts/:userId')
    async getAccounts(@Param('userId') userId: string) {
        return this.emailAccountService.getAccountsByUser(userId);
    }

    @Post('accounts/:userId')
    @HttpCode(HttpStatus.CREATED)
    async createAccount(
        @Param('userId') userId: string,
        @Body() dto: CreateEmailAccountZodDto,
    ) {
        return this.emailAccountService.createAccount(userId, dto as CreateEmailAccountDto);
    }

    @Put('accounts/:userId/:id')
    async updateAccount(
        @Param('userId') userId: string,
        @Param('id') id: string,
        @Body() dto: UpdateEmailAccountZodDto,
    ) {
        return this.emailAccountService.updateAccount(id, userId, dto as UpdateEmailAccountDto);
    }

    @Delete('accounts/:userId/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteAccount(
        @Param('userId') userId: string,
        @Param('id') id: string,
    ) {
        await this.emailAccountService.deleteAccount(id, userId);
    }

    @Post('accounts/:userId/:id/sync')
    @HttpCode(HttpStatus.OK)
    async syncAccount(
        @Param('userId') userId: string,
        @Param('id') id: string,
    ) {
        return this.emailIngestionService.syncAccount(id);
    }
}
