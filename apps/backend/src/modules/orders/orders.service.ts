import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExtractionService } from '../extraction/extraction.service';
import type { ExtractionResult } from '../extraction/extraction.service';
import { ProductCatalogService } from '../catalog/catalog.service';
import type { PurchaseOrder, PurchaseOrderConfidence } from '@opp/shared';

export interface PendingRevision {
    data: PurchaseOrder;
    confidence: PurchaseOrderConfidence | null;
    avgConfidence: number | null;
    receivedAt: string;
}

export interface ExtractAndSaveOrderResult {
    extraction: ExtractionResult;
    savedOrder: PurchaseOrderRecord;
}

export interface PurchaseOrderRecord {
    id: string;
    userId: string;
    poNumber: string;
    orderDate: string | null;
    customerName: string | null;
    customerEmail: string | null;
    shippingAddress: string | null;
    currency: string | null;
    totalAmount: number | null;
    status: string;
    avgConfidence: number | null;
    fieldConfidence: Record<string, number> | null;
    lineItems: OrderLineItemRecord[];
    createdAt: Date;
    updatedAt: Date;
}

export interface OrderLineItemRecord {
    id: string;
    lineNumber: number;
    rawDescription: string;
    customerSku: string | null;
    matchedSystemSku: string | null;
    skuMatchScore: number;
    /** "auto" = ProductCatalogService matched it, "manual" = the user picked it via the override dropdown. */
    skuMatchSource: 'auto' | 'manual';
    quantity: number;
    unitPrice: number | null;
    totalAmount: number | null;
}

/**
 * Orchestrates purchase order extraction, SKU matching against the mock catalog,
 * persistence, and mock ERP approval.
 */
@Injectable()
export class OrdersService {
    private readonly logger = new Logger(OrdersService.name);

    constructor(
        private readonly extractionService: ExtractionService,
        private readonly catalogService: ProductCatalogService,
        private readonly prisma: PrismaService,
    ) {}

    /**
     * Extracts a purchase order from a file or text payload, runs every line item
     * through the product catalog matcher, and persists the result.
     */
    async extractAndSaveOrder(
        file: Express.Multer.File | undefined,
        textPayload: string | undefined,
        userId: string,
        modelKey?: string,
        apiKeyOverride?: string,
        processingMode?: string,
    ): Promise<ExtractAndSaveOrderResult> {
        const extraction = await this.extractionService.processFile(
            file,
            textPayload,
            modelKey,
            apiKeyOverride,
            processingMode,
            'purchaseOrder',
        );

        const orderData = extraction.extractedData as PurchaseOrder;
        const confidence = extraction.confidence as PurchaseOrderConfidence;

        // SKU matching happens inside saveOrder() itself now — every caller
        // (this one, and EmailIngestionService's direct saveOrder() call) gets
        // it automatically instead of each having to remember to run it.
        const savedOrder = await this.saveOrder(orderData, userId, confidence, extraction.avgConfidence);

        return {
            extraction,
            savedOrder,
        };
    }

    /**
     * Persists a PurchaseOrder and its line items to Prisma.
     */
    async saveOrder(
        orderData: PurchaseOrder,
        userId: string,
        fieldConfidence?: PurchaseOrderConfidence,
        avgConfidence?: number,
    ): Promise<PurchaseOrderRecord> {
        const created = await this.prisma.purchaseOrder.create({
            data: {
                user: {
                    connectOrCreate: {
                        where: { clerkId: userId },
                        create: { clerkId: userId },
                    },
                },
                poNumber: orderData.poNumber ?? 'UNKNOWN',
                orderDate: orderData.orderDate,
                customerName: orderData.customerName,
                customerEmail: orderData.customerEmail ?? null,
                shippingAddress: orderData.shippingAddress,
                currency: orderData.currency,
                totalAmount: orderData.totalAmount,
                status: 'PENDING_REVIEW',
                fieldConfidence: fieldConfidence ? (fieldConfidence as any) : undefined,
                avgConfidence: avgConfidence ?? undefined,
                lineItems: {
                    // Every caller gets SKU matching against the catalog here —
                    // it must not be something each caller has to remember to do
                    // itself (that's exactly how the email-ingestion path ended
                    // up saving orders with no SKU matches at all).
                    create: orderData.lineItems.map((item) => {
                        const match = this.catalogService.matchSku(item.rawDescription);
                        return {
                            lineNumber: item.lineNumber,
                            rawDescription: item.rawDescription,
                            customerSku: item.customerSku ?? null,
                            matchedSystemSku: match.matchedSku,
                            skuMatchScore: match.score,
                            skuMatchSource: 'auto',
                            quantity: Math.round(item.quantity),
                            unitPrice: item.unitPrice,
                            totalAmount: item.totalAmount,
                        };
                    }),
                },
            },
            include: { lineItems: true },
        });

        return this.mapPrismaOrder(created);
    }

    async getOrdersByUser(userId: string): Promise<PurchaseOrderRecord[]> {
        const orders = await this.prisma.purchaseOrder.findMany({
            where: { user: { clerkId: userId } },
            orderBy: { createdAt: 'desc' },
            include: { lineItems: true },
        });

        return orders.map((order) => this.mapPrismaOrder(order));
    }

    async getOrderById(id: string): Promise<PurchaseOrderRecord | null> {
        const order = await this.prisma.purchaseOrder.findUnique({
            where: { id },
            include: { lineItems: true },
        });

        return order ? this.mapPrismaOrder(order) : null;
    }

    async approveOrder(id: string): Promise<PurchaseOrderRecord> {
        const order = await this.prisma.purchaseOrder.findUnique({
            where: { id },
            include: { lineItems: true },
        });

        if (!order) {
            throw new NotFoundException(`Purchase order ${id} not found`);
        }

        const updated = await this.prisma.purchaseOrder.update({
            where: { id },
            data: { status: 'APPROVED' },
            include: { lineItems: true },
        });

        // Simulate pushing to a mock ERP endpoint.
        this.logger.log(`[MOCK ERP PUSH] Purchase order ${id} pushed to ERP. PO number: ${order.poNumber}, total line items: ${order.lineItems.length}`);

        return this.mapPrismaOrder(updated);
    }

    async updateLineItemSku(orderId: string, lineItemId: string, matchedSystemSku: string): Promise<PurchaseOrderRecord> {
        const order = await this.prisma.purchaseOrder.findUnique({
            where: { id: orderId },
            include: { lineItems: true },
        });

        if (!order) {
            throw new NotFoundException(`Purchase order ${orderId} not found`);
        }

        const lineItem = order.lineItems.find((item) => item.id === lineItemId);
        if (!lineItem) {
            throw new NotFoundException(`Line item ${lineItemId} not found on order ${orderId}`);
        }

        await this.prisma.orderLineItem.update({
            where: { id: lineItemId },
            data: { matchedSystemSku, skuMatchScore: 1.0, skuMatchSource: 'manual' },
        });

        const updated = await this.prisma.purchaseOrder.findUnique({
            where: { id: orderId },
            include: { lineItems: true },
        });

        return this.mapPrismaOrder(updated!);
    }

    private mapPrismaOrder(order: any): PurchaseOrderRecord {
        return {
            ...order,
            lineItems: order.lineItems.map((item: any) => ({
                id: item.id,
                lineNumber: item.lineNumber,
                rawDescription: item.rawDescription,
                customerSku: item.customerSku,
                matchedSystemSku: item.matchedSystemSku,
                skuMatchScore: item.skuMatchScore,
                skuMatchSource: item.skuMatchSource,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalAmount: item.totalAmount,
            })),
        };
    }
}
