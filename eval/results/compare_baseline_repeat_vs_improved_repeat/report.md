# Compare: baseline_repeat vs improved_repeat

Models: `google:gemini-3.1-flash-lite` vs `google:gemini-3.1-flash-lite`. Documents: 12 vs 12. Change is in percentage points.

## Overall

| Metric | baseline_repeat | improved_repeat | Change |
|---|---|---|---|
| Schema valid | 91.7% | 100.0% | +8.3 |
| Field accuracy | 89.4% | 99.2% | +9.8 |
| Accuracy when completed | 97.5% | 99.2% | +1.7 |
| Line precision | 100.0% | 100.0% | +0.0 |
| Line recall | 90.9% | 100.0% | +9.1 |
| Line F1 | 95.2% | 100.0% | +4.8 |

Mean latency: 5.7s vs 6.2s.

## Per field

| Field | baseline_repeat | improved_repeat | Change |
|---|---|---|---|
| invoiceNumber | 75.0% | 100.0% | +25.0 |
| vendorName | 91.7% | 100.0% | +8.3 |
| vendorAddress | 91.7% | 100.0% | +8.3 |
| customerName | 91.7% | 100.0% | +8.3 |
| customerAddress | 83.3% | 91.7% | +8.3 |
| currency | 91.7% | 100.0% | +8.3 |
| issueDate | 91.7% | 100.0% | +8.3 |
| dueDate | 91.7% | 100.0% | +8.3 |
| subtotal | 91.7% | 100.0% | +8.3 |
| taxAmount | 91.7% | 100.0% | +8.3 |
| totalAmount | 91.7% | 100.0% | +8.3 |
| lineItems (F1) | 95.2% | 100.0% | +4.8 |

## Field accuracy per group

| Group | baseline_repeat | improved_repeat | Change |
|---|---|---|---|
| german | 80.3% | 98.5% | +18.2 |
| english | 98.5% | 100.0% | +1.5 |
| clean | 97.0% | 100.0% | +3.0 |
| scanned | 97.0% | 97.0% | +0.0 |
| photo | 66.7% | 100.0% | +33.3 |

## Line F1 per group

| Group | baseline_repeat | improved_repeat | Change |
|---|---|---|---|
| german | 90.9% | 100.0% | +9.1 |
| english | 100.0% | 100.0% | +0.0 |
| clean | 100.0% | 100.0% | +0.0 |
| scanned | 100.0% | 100.0% | +0.0 |
| photo | 75.0% | 100.0% | +25.0 |
