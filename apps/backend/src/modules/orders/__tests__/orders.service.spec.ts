import { NotFoundException } from '@nestjs/common';
import { OrdersService } from '../orders.service';
import { ExtractionService } from '../../extraction/extraction.service';
import { ProductCatalogService } from '../../catalog/catalog.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PurchaseOrder, PurchaseOrderConfidence } from '@opp/shared';

// ── Mocks ────────────────────────────────────────────────────────────────────

function makePrismaMock() {
    const orders: any[] = [];

    return {
        purchaseOrder: {
            create: jest.fn().mockImplementation(({ data }: any) => {
                const order = {
                    id: 'po-1',
                    ...data,
                    lineItems: data.lineItems?.create?.map((item: any, idx: number) => ({
                        id: `li-${idx + 1}`,
                        ...item,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })) ?? [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                orders.push(order);
                return Promise.resolve(order);
            }),
            findMany: jest.fn().mockResolvedValue(orders),
            findUnique: jest.fn().mockImplementation(({ where }: any) => {
                const found = orders.find((o) => o.id === where.id);
                return Promise.resolve(found ? JSON.parse(JSON.stringify(found)) : null);
            }),
            update: jest.fn().mockImplementation(({ where, data }: any) => {
                const found = orders.find((o) => o.id === where.id);
                if (!found) return Promise.resolve(null);
                Object.assign(found, data, { updatedAt: new Date() });
                return Promise.resolve(JSON.parse(JSON.stringify(found)));
            }),
        },
        orderLineItem: {
            update: jest.fn().mockImplementation(({ where, data }: any) => {
                for (const order of orders) {
                    const item = order.lineItems.find((i: any) => i.id === where.id);
                    if (item) {
                        Object.assign(item, data, { updatedAt: new Date() });
                        return Promise.resolve(JSON.parse(JSON.stringify(item)));
                    }
                }
                return Promise.resolve({ id: where.id, ...data });
            }),
        },
    } as unknown as PrismaService;
}

function makeExtractionServiceMock(order: PurchaseOrder) {
    return {
        processFile: jest.fn().mockResolvedValue({
            extractedData: order,
            confidence: {},
            avgConfidence: 0.85,
            documentType: 'purchaseOrder',
            piiDetected: false,
            maskedText: 'mock text',
            imagePiiDetected: false,
            ocrUsed: false,
            processingTimeMs: 100,
            sourceType: 'TEXT',
            processedAt: new Date().toISOString(),
            logId: 'log-1',
        }),
    } as unknown as ExtractionService;
}

function makeCatalogServiceMock() {
    return {
        matchSku: jest.fn().mockImplementation((desc: string) => {
            if (desc.toLowerCase().includes('pump')) return { matchedSku: 'PUMP-CENT-5HP', score: 0.92 };
            if (desc.toLowerCase().includes('pipe')) return { matchedSku: 'PIPE-CS-4IN', score: 0.88 };
            return { matchedSku: null, score: 0.1 };
        }),
    } as unknown as ProductCatalogService;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OrdersService', () => {
    let service: OrdersService;
    let extractionService: ExtractionService;
    let catalogService: ProductCatalogService;
    let prisma: PrismaService;

    const sampleOrder: PurchaseOrder = {
        poNumber: 'PO-2024-001',
        orderDate: '2024-03-15',
        customerName: 'Industrial Supply Co',
        customerEmail: 'procurement@industrial.com',
        shippingAddress: '123 Factory Lane, Houston, TX',
        currency: 'USD',
        totalAmount: 2450.0,
        lineItems: [
            {
                lineNumber: 1,
                rawDescription: 'Centrifugal pump 5 HP for water system',
                customerSku: 'CP-5HP',
                matchedSystemSku: null,
                skuMatchScore: 0,
                quantity: 2,
                unitPrice: 1000,
                totalAmount: 2000,
            },
            {
                lineNumber: 2,
                rawDescription: 'Carbon steel pipe 4 inch schedule 40',
                customerSku: null,
                matchedSystemSku: null,
                skuMatchScore: 0,
                quantity: 10,
                unitPrice: 45,
                totalAmount: 450,
            },
        ],
    };

    beforeEach(() => {
        extractionService = makeExtractionServiceMock(sampleOrder);
        catalogService = makeCatalogServiceMock();
        prisma = makePrismaMock();
        service = new OrdersService(extractionService, catalogService, prisma);
    });

    describe('extractAndSaveOrder()', () => {
        it('extracts a purchase order, matches SKUs, and saves the result', async () => {
            const result = await service.extractAndSaveOrder(undefined, 'raw po text', 'user-1');

            expect(extractionService.processFile).toHaveBeenCalledWith(
                undefined,
                'raw po text',
                undefined,
                undefined,
                undefined,
                'purchaseOrder',
            );
            expect(catalogService.matchSku).toHaveBeenCalledTimes(2);
            expect(result.savedOrder.lineItems).toHaveLength(2);
            expect(result.savedOrder.lineItems[0].matchedSystemSku).toBe('PUMP-CENT-5HP');
            expect(result.savedOrder.lineItems[1].matchedSystemSku).toBe('PIPE-CS-4IN');
            expect(result.savedOrder.status).toBe('PENDING_REVIEW');
        });

        it('passes user model preferences to the extraction service', async () => {
            await service.extractAndSaveOrder(undefined, 'text', 'user-1', 'openai:gpt-4o', 'sk-test', 'local-ocr');

            expect(extractionService.processFile).toHaveBeenCalledWith(
                undefined,
                'text',
                'openai:gpt-4o',
                'sk-test',
                'local-ocr',
                'purchaseOrder',
            );
        });
    });

    describe('saveOrder()', () => {
        it('creates a purchase order with line items', async () => {
            const confidence: PurchaseOrderConfidence = {
                poNumber: 1,
                orderDate: 0.8,
                customerName: 0.8,
                customerEmail: 0.6,
                shippingAddress: 0.4,
                lineItems: 0.9,
                currency: 1,
                totalAmount: 1,
            };

            const result = await service.saveOrder(sampleOrder, 'user-1', confidence, 0.85);

            expect(result.poNumber).toBe('PO-2024-001');
            expect(result.lineItems).toHaveLength(2);
            expect(result.avgConfidence).toBe(0.85);
        });
    });

    describe('approveOrder()', () => {
        it('approves an existing order and returns the updated status', async () => {
            await service.saveOrder(sampleOrder, 'user-1');
            const approved = await service.approveOrder('po-1');

            expect(approved.status).toBe('APPROVED');
        });

        it('throws NotFoundException when the order does not exist', async () => {
            await expect(service.approveOrder('non-existent')).rejects.toThrow(NotFoundException);
        });
    });

    describe('updateLineItemSku()', () => {
        it('updates the matched system SKU for a line item', async () => {
            await service.saveOrder(sampleOrder, 'user-1');
            const updated = await service.updateLineItemSku('po-1', 'li-1', 'VALVE-BV-6IN');

            expect(updated.lineItems[0].matchedSystemSku).toBe('VALVE-BV-6IN');
            expect(updated.lineItems[0].skuMatchScore).toBe(1);
        });

        it('throws NotFoundException when the order does not exist', async () => {
            await expect(service.updateLineItemSku('non-existent', 'li-1', 'X')).rejects.toThrow(NotFoundException);
        });
    });
});
