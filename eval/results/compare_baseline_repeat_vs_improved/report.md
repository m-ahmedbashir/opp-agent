# Compare: baseline_repeat vs improved

Models: `google:gemini-3.1-flash-lite` vs `google:gemini-3.1-flash-lite`. Documents: 12 vs 12. Change is in percentage points.

## Overall

| Metric | baseline_repeat | improved | Change |
|---|---|---|---|
| Schema valid | 91.7% | 91.7% | +0.0 |
| Field accuracy | 89.4% | 90.9% | +1.5 |
| Accuracy when completed | 97.5% | 99.2% | +1.7 |
| Line precision | 100.0% | 100.0% | +0.0 |
| Line recall | 90.9% | 93.2% | +2.3 |
| Line F1 | 95.2% | 96.5% | +1.2 |

Mean latency: 5.7s vs 5.4s.

## Per field

| Field | baseline_repeat | improved | Change |
|---|---|---|---|
| invoiceNumber | 75.0% | 91.7% | +16.7 |
| vendorName | 91.7% | 91.7% | +0.0 |
| vendorAddress | 91.7% | 91.7% | +0.0 |
| customerName | 91.7% | 91.7% | +0.0 |
| customerAddress | 83.3% | 83.3% | +0.0 |
| currency | 91.7% | 91.7% | +0.0 |
| issueDate | 91.7% | 91.7% | +0.0 |
| dueDate | 91.7% | 91.7% | +0.0 |
| subtotal | 91.7% | 91.7% | +0.0 |
| taxAmount | 91.7% | 91.7% | +0.0 |
| totalAmount | 91.7% | 91.7% | +0.0 |
| lineItems (F1) | 95.2% | 96.5% | +1.2 |

## Field accuracy per group

| Group | baseline_repeat | improved | Change |
|---|---|---|---|
| german | 80.3% | 81.8% | +1.5 |
| english | 98.5% | 100.0% | +1.5 |
| clean | 97.0% | 83.3% | -13.6 |
| scanned | 97.0% | 97.0% | +0.0 |
| photo | 66.7% | 100.0% | +33.3 |

## Line F1 per group

| Group | baseline_repeat | improved | Change |
|---|---|---|---|
| german | 90.9% | 93.3% | +2.4 |
| english | 100.0% | 100.0% | +0.0 |
| clean | 100.0% | 93.0% | -7.0 |
| scanned | 100.0% | 100.0% | +0.0 |
| photo | 75.0% | 100.0% | +25.0 |
