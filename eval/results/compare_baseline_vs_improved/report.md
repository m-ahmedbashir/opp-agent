# Compare: baseline vs improved

Models: `google:gemini-3.1-flash-lite` vs `google:gemini-3.1-flash-lite`. Documents: 12 vs 12. Change is in percentage points.

## Overall

| Metric | baseline | improved | Change |
|---|---|---|---|
| Schema valid | 100.0% | 91.7% | -8.3 |
| Field accuracy | 97.7% | 90.9% | -6.8 |
| Accuracy when completed | 97.7% | 99.2% | +1.4 |
| Line precision | 100.0% | 100.0% | +0.0 |
| Line recall | 100.0% | 93.2% | -6.8 |
| Line F1 | 100.0% | 96.5% | -3.5 |

Mean latency: 5.6s vs 5.4s.

## Per field

| Field | baseline | improved | Change |
|---|---|---|---|
| invoiceNumber | 83.3% | 91.7% | +8.3 |
| vendorName | 100.0% | 91.7% | -8.3 |
| vendorAddress | 100.0% | 91.7% | -8.3 |
| customerName | 100.0% | 91.7% | -8.3 |
| customerAddress | 91.7% | 83.3% | -8.3 |
| currency | 100.0% | 91.7% | -8.3 |
| issueDate | 100.0% | 91.7% | -8.3 |
| dueDate | 100.0% | 91.7% | -8.3 |
| subtotal | 100.0% | 91.7% | -8.3 |
| taxAmount | 100.0% | 91.7% | -8.3 |
| totalAmount | 100.0% | 91.7% | -8.3 |
| lineItems (F1) | 100.0% | 96.5% | -3.5 |

## Field accuracy per group

| Group | baseline | improved | Change |
|---|---|---|---|
| german | 97.0% | 81.8% | -15.2 |
| english | 98.5% | 100.0% | +1.5 |
| clean | 97.0% | 83.3% | -13.6 |
| scanned | 97.0% | 97.0% | +0.0 |
| photo | 100.0% | 100.0% | +0.0 |

## Line F1 per group

| Group | baseline | improved | Change |
|---|---|---|---|
| german | 100.0% | 93.3% | -6.7 |
| english | 100.0% | 100.0% | +0.0 |
| clean | 100.0% | 93.0% | -7.0 |
| scanned | 100.0% | 100.0% | +0.0 |
| photo | 100.0% | 100.0% | +0.0 |
