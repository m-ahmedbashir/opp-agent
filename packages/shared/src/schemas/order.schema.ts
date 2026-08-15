import { z } from 'zod';

/**
 * What the extraction model actually produces per line item. Deliberately
 * excludes matchedSystemSku/skuMatchScore — those describe a match against
 * *our* internal product catalog, which the model is never shown, so asking
 * it to fill them in only invites a confident-sounding guess (seen in
 * practice: "Hex Bolt 10mm Pack" matched to a stainless steel pipe SKU at
 * 100% "confidence"). That matching is entirely ProductCatalogService's job,
 * computed fresh in OrdersService.saveOrder() every time an order is saved —
 * matchedSystemSku/skuMatchScore only exist on the persisted/returned record
 * shape (OrderLineItemRecord on the backend, SavedLineItem on the frontend),
 * never on what the model is asked to produce.
 */
export const LineItemSchema = z.object({
    lineNumber: z.number().describe('Line item number / position in the PO'),
    rawDescription: z.string().describe('Raw item description as written on the purchase order'),
    customerSku: z.string().nullable().describe('SKU or part number the customer themselves wrote on the PO, or null if none is stated'),
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
    customerEmail: z.string().nullable().describe('Customer email, or null if not found'),
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
