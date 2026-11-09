# Evaluation report: improved_repeat

Model: `google:gemini-3.1-flash-lite`. Mode: vision. Commit: `e726760`. Finished: 2026-11-07T16:17:07.103Z.

## Overall

| Group | Docs | Schema valid | Field accuracy | Accuracy when completed | Line precision | Line recall | Line F1 | Mean latency | p95 latency |
|---|---|---|---|---|---|---|---|---|---|
| all | 12 | 100.0% | 99.2% | 99.2% | 100.0% | 100.0% | 100.0% | 6.2s | 19.0s |

## Per field

| Field | Correct | Accuracy |
|---|---|---|
| invoiceNumber | 12/12 | 100.0% |
| vendorName | 12/12 | 100.0% |
| vendorAddress | 12/12 | 100.0% |
| customerName | 12/12 | 100.0% |
| customerAddress | 11/12 | 91.7% |
| currency | 12/12 | 100.0% |
| issueDate | 12/12 | 100.0% |
| dueDate | 12/12 | 100.0% |
| subtotal | 12/12 | 100.0% |
| taxAmount | 12/12 | 100.0% |
| totalAmount | 12/12 | 100.0% |

Line items: 44 matched, 0 wrong or extra, 0 missed.

## Per group

| Group | Docs | Schema valid | Field accuracy | Accuracy when completed | Line precision | Line recall | Line F1 | Mean latency | p95 latency |
|---|---|---|---|---|---|---|---|---|---|
| german | 6 | 100.0% | 98.5% | 98.5% | 100.0% | 100.0% | 100.0% | 10.0s | 19.0s |
| english | 6 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 2.5s | 4.3s |
| clean | 6 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 6.7s | 19.0s |
| scanned | 3 | 100.0% | 97.0% | 97.0% | 100.0% | 100.0% | 100.0% | 9.2s | 18.9s |
| photo | 3 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 2.3s | 2.9s |

## Field accuracy by group

| Field | german | english | clean | scanned | photo |
|---|---|---|---|---|---|
| invoiceNumber | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| vendorName | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| vendorAddress | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| customerName | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| customerAddress | 83.3% | 100.0% | 100.0% | 66.7% | 100.0% |
| currency | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| issueDate | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| dueDate | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| subtotal | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| taxAmount | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| totalAmount | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| lineItems (F1) | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |

## 5 worst fields

### customerAddress: 91.7%

| Invoice | Expected | Got |
|---|---|---|
| inv-07 | "Am Sparrenberg 13, 50667 Beispielburg" | "Am Sparrenberg 13, 50667 Beispieburg" |
