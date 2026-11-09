# Compare: baseline vs improved_repeat

Models: `google:gemini-3.1-flash-lite` vs `google:gemini-3.1-flash-lite`. Documents: 12 vs 12. Change is in percentage points.

## Overall

| Metric | baseline | improved_repeat | Change |
|---|---|---|---|
| Schema valid | 100.0% | 100.0% | +0.0 |
| Field accuracy | 97.7% | 99.2% | +1.5 |
| Accuracy when completed | 97.7% | 99.2% | +1.5 |
| Line precision | 100.0% | 100.0% | +0.0 |
| Line recall | 100.0% | 100.0% | +0.0 |
| Line F1 | 100.0% | 100.0% | +0.0 |

Mean latency: 5.6s vs 6.2s.

## Per field

| Field | baseline | improved_repeat | Change |
|---|---|---|---|
| invoiceNumber | 83.3% | 100.0% | +16.7 |
| vendorName | 100.0% | 100.0% | +0.0 |
| vendorAddress | 100.0% | 100.0% | +0.0 |
| customerName | 100.0% | 100.0% | +0.0 |
| customerAddress | 91.7% | 91.7% | +0.0 |
| currency | 100.0% | 100.0% | +0.0 |
| issueDate | 100.0% | 100.0% | +0.0 |
| dueDate | 100.0% | 100.0% | +0.0 |
| subtotal | 100.0% | 100.0% | +0.0 |
| taxAmount | 100.0% | 100.0% | +0.0 |
| totalAmount | 100.0% | 100.0% | +0.0 |
| lineItems (F1) | 100.0% | 100.0% | +0.0 |

## Field accuracy per group

| Group | baseline | improved_repeat | Change |
|---|---|---|---|
| german | 97.0% | 98.5% | +1.5 |
| english | 98.5% | 100.0% | +1.5 |
| clean | 97.0% | 100.0% | +3.0 |
| scanned | 97.0% | 97.0% | +0.0 |
| photo | 100.0% | 100.0% | +0.0 |

## Line F1 per group

| Group | baseline | improved_repeat | Change |
|---|---|---|---|
| german | 100.0% | 100.0% | +0.0 |
| english | 100.0% | 100.0% | +0.0 |
| clean | 100.0% | 100.0% | +0.0 |
| scanned | 100.0% | 100.0% | +0.0 |
| photo | 100.0% | 100.0% | +0.0 |
