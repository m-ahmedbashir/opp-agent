import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Generic document storage for extraction results that don't have a dedicated
 * pipeline yet (receipts, resumes, and any future document types). Uses the
 * same `Document` table as invoices but preserves the AI's classified type.
 */
@Injectable()
export class DocumentsService {
    constructor(private prisma: PrismaService) {}

    async saveDocument(
        documentType: string,
        data: unknown,
        userId: string,
        fieldConfidence?: unknown,
        avgConfidence?: number,
    ) {
        const created = await this.prisma.document.create({
            data: {
                user: {
                    connectOrCreate: {
                        where: { clerkId: userId },
                        create: { clerkId: userId },
                    },
                },
                documentType,
                data: data as any,
                fieldConfidence: fieldConfidence ? (fieldConfidence as any) : undefined,
                avgConfidence: avgConfidence ?? undefined,
                status: 'APPROVED',
            },
        });

        return { ...created, ...(created.data as Record<string, unknown>) };
    }
}
