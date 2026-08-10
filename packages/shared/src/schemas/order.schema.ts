import { z } from 'zod';

export const LineItemSchema = z.object({
    lineNumber: z.number().describe('Line item number / position in the PO'),
    rawDescription: z.string().describe('Raw item description as written on the purchase order'),
    customerSku: z.string().optional().describe('Customer SKU or part number, if present'),
    matchedSystemSku: z.string().nullable().describe('System-matched SKU, or null if no match'),
    skuMatchScore: z.number().min(0).max(1).describe('Confidence score 0.0-1.0 for the SKU match'),
    quantity: z.number().describe('Quantity ordered'),
    unitPrice: z.number().nullable().describe('Unit price, or null if not found'),
    totalAmount: z.number().nullable().describe('Total line amount, or null if not found'),
});

/**
 * Purchase order schema. Fields are nullable where the extraction model may not
 * find a value, matching the convention used for InvoiceSchema and ReceiptSchema.
 */
export const PurchaseOrderSchema = z.object({
    poNumber: z.string().nullable().describe('Purchase order number, or null if not found'),
    orderDate: z.string().nullable().describe('Order date, or null if not found'),
    customerName: z.string().nullable().describe('Customer / buyer name, or null if not found'),
    customerEmail: z.string().nullable().optional().describe('Customer email, optional / null if not found'),
    shippingAddress: z.string().nullable().describe('Shipping address, or null if not found'),
    lineItems: z.array(LineItemSchema).describe('Array of purchase order line items — empty array if none found'),
    currency: z.string().nullable().describe('Currency code (e.g. USD), or null if not found'),
    totalAmount: z.number().nullable().describe('Total PO amount, or null if not found'),
});

export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;

/**
 * Confidence score for each extracted purchase order field.
 * Uses the same six-anchor scale as the other document schemas: 0.0, 0.2, 0.4, 0.6, 0.8, 1.0.
 */
export const PurchaseOrderConfidenceSchema = z.object({
    poNumber: z.number().describe('Confidence score 0.0-1.0 for poNumber'),
    orderDate: z.number().describe('Confidence score 0.0-1.0 for orderDate'),
    customerName: z.number().describe('Confidence score 0.0-1.0 for customerName'),
    customerEmail: z.number().describe('Confidence score 0.0-1.0 for customerEmail'),
    shippingAddress: z.number().describe('Confidence score 0.0-1.0 for shippingAddress'),
    lineItems: z.number().describe('Confidence score 0.0-1.0 for the line items array as a whole'),
    currency: z.number().describe('Confidence score 0.0-1.0 for currency'),
    totalAmount: z.number().describe('Confidence score 0.0-1.0 for totalAmount'),
});

export type PurchaseOrderConfidence = z.infer<typeof PurchaseOrderConfidenceSchema>;
