# Compare: baseline vs baseline_repeat

Models: `google:gemini-3.1-flash-lite` vs `google:gemini-3.1-flash-lite`. Documents: 12 vs 12. Change is in percentage points.

## Overall

| Metric | baseline | baseline_repeat | Change |
|---|---|---|---|
| Schema valid | 100.0% | 91.7% | -8.3 |
| Field accuracy | 97.7% | 89.4% | -8.3 |
| Accuracy when completed | 97.7% | 97.5% | -0.2 |
| Line precision | 100.0% | 100.0% | +0.0 |
| Line recall | 100.0% | 90.9% | -9.1 |
| Line F1 | 100.0% | 95.2% | -4.8 |

Mean latency: 5.6s vs 5.7s.

## Per field

| Field | baseline | baseline_repeat | Change |
|---|---|---|---|
| invoiceNumber | 83.3% | 75.0% | -8.3 |
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
| lineItems (F1) | 100.0% | 95.2% | -4.8 |

## Field accuracy per group

| Group | baseline | baseline_repeat | Change |
|---|---|---|---|
| german | 97.0% | 80.3% | -16.7 |
| english | 98.5% | 98.5% | +0.0 |
| clean | 97.0% | 97.0% | +0.0 |
| scanned | 97.0% | 97.0% | +0.0 |
| photo | 100.0% | 66.7% | -33.3 |

## Line F1 per group

| Group | baseline | baseline_repeat | Change |
|---|---|---|---|
| german | 100.0% | 90.9% | -9.1 |
| english | 100.0% | 100.0% | +0.0 |
| clean | 100.0% | 100.0% | +0.0 |
| scanned | 100.0% | 100.0% | +0.0 |
| photo | 100.0% | 75.0% | -25.0 |
