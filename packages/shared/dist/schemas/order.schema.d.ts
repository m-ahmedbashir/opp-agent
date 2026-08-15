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
export declare const LineItemSchema: z.ZodObject<{
    lineNumber: z.ZodNumber;
    rawDescription: z.ZodString;
    customerSku: z.ZodNullable<z.ZodString>;
    quantity: z.ZodNumber;
    unitPrice: z.ZodNullable<z.ZodNumber>;
    totalAmount: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
/**
 * Purchase order schema. Fields are nullable where the extraction model may not
 * find a value, matching the convention used for InvoiceSchema and ReceiptSchema.
 */
export declare const PurchaseOrderSchema: z.ZodObject<{
    poNumber: z.ZodNullable<z.ZodString>;
    orderDate: z.ZodNullable<z.ZodString>;
    customerName: z.ZodNullable<z.ZodString>;
    customerEmail: z.ZodNullable<z.ZodString>;
    shippingAddress: z.ZodNullable<z.ZodString>;
    lineItems: z.ZodArray<z.ZodObject<{
        lineNumber: z.ZodNumber;
        rawDescription: z.ZodString;
        customerSku: z.ZodNullable<z.ZodString>;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNullable<z.ZodNumber>;
        totalAmount: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    currency: z.ZodNullable<z.ZodString>;
    totalAmount: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
/**
 * Confidence score for each extracted purchase order field.
 * Uses the same six-anchor scale as the other document schemas: 0.0, 0.2, 0.4, 0.6, 0.8, 1.0.
 */
export declare const PurchaseOrderConfidenceSchema: z.ZodObject<{
    poNumber: z.ZodNumber;
    orderDate: z.ZodNumber;
    customerName: z.ZodNumber;
    customerEmail: z.ZodNumber;
    shippingAddress: z.ZodNumber;
    lineItems: z.ZodNumber;
    currency: z.ZodNumber;
    totalAmount: z.ZodNumber;
}, z.core.$strip>;
export type PurchaseOrderConfidence = z.infer<typeof PurchaseOrderConfidenceSchema>;
