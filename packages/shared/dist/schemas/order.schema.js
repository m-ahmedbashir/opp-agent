"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseOrderConfidenceSchema = exports.PurchaseOrderSchema = exports.LineItemSchema = void 0;
const zod_1 = require("zod");
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
exports.LineItemSchema = zod_1.z.object({
    lineNumber: zod_1.z.number().describe('Line item number / position in the PO'),
    rawDescription: zod_1.z.string().describe('Raw item description as written on the purchase order'),
    customerSku: zod_1.z.string().nullable().describe('SKU or part number the customer themselves wrote on the PO, or null if none is stated'),
    quantity: zod_1.z.number().describe('Quantity ordered'),
    unitPrice: zod_1.z.number().nullable().describe('Unit price, or null if not found'),
    totalAmount: zod_1.z.number().nullable().describe('Total line amount, or null if not found'),
});
/**
 * Purchase order schema. Fields are nullable where the extraction model may not
 * find a value, matching the convention used for InvoiceSchema and ReceiptSchema.
 */
exports.PurchaseOrderSchema = zod_1.z.object({
    poNumber: zod_1.z.string().nullable().describe('Purchase order number, or null if not found'),
    orderDate: zod_1.z.string().nullable().describe('Order date, or null if not found'),
    customerName: zod_1.z.string().nullable().describe('Customer / buyer name, or null if not found'),
    customerEmail: zod_1.z.string().nullable().describe('Customer email, or null if not found'),
    shippingAddress: zod_1.z.string().nullable().describe('Shipping address, or null if not found'),
    lineItems: zod_1.z.array(exports.LineItemSchema).describe('Array of purchase order line items — empty array if none found'),
    currency: zod_1.z.string().nullable().describe('Currency code (e.g. USD), or null if not found'),
    totalAmount: zod_1.z.number().nullable().describe('Total PO amount, or null if not found'),
});
/**
 * Confidence score for each extracted purchase order field.
 * Uses the same six-anchor scale as the other document schemas: 0.0, 0.2, 0.4, 0.6, 0.8, 1.0.
 */
exports.PurchaseOrderConfidenceSchema = zod_1.z.object({
    poNumber: zod_1.z.number().describe('Confidence score 0.0-1.0 for poNumber'),
    orderDate: zod_1.z.number().describe('Confidence score 0.0-1.0 for orderDate'),
    customerName: zod_1.z.number().describe('Confidence score 0.0-1.0 for customerName'),
    customerEmail: zod_1.z.number().describe('Confidence score 0.0-1.0 for customerEmail'),
    shippingAddress: zod_1.z.number().describe('Confidence score 0.0-1.0 for shippingAddress'),
    lineItems: zod_1.z.number().describe('Confidence score 0.0-1.0 for the line items array as a whole'),
    currency: zod_1.z.number().describe('Confidence score 0.0-1.0 for currency'),
    totalAmount: zod_1.z.number().describe('Confidence score 0.0-1.0 for totalAmount'),
});
