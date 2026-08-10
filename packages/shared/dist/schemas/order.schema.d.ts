import { z } from 'zod';
export declare const LineItemSchema: z.ZodObject<{
    lineNumber: z.ZodNumber;
    rawDescription: z.ZodString;
    customerSku: z.ZodOptional<z.ZodString>;
    matchedSystemSku: z.ZodNullable<z.ZodString>;
    skuMatchScore: z.ZodNumber;
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
    customerEmail: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    shippingAddress: z.ZodNullable<z.ZodString>;
    lineItems: z.ZodArray<z.ZodObject<{
        lineNumber: z.ZodNumber;
        rawDescription: z.ZodString;
        customerSku: z.ZodOptional<z.ZodString>;
        matchedSystemSku: z.ZodNullable<z.ZodString>;
        skuMatchScore: z.ZodNumber;
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
