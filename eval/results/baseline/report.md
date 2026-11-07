# Evaluation report: baseline

Model: `google:gemini-3.1-flash-lite`. Mode: vision. Commit: `50d34d4`. Finished: 2026-11-07T15:39:32.774Z.

## Overall

| Group | Docs | Schema valid | Field accuracy | Line precision | Line recall | Line F1 | Mean latency | p95 latency |
|---|---|---|---|---|---|---|---|---|
| all | 12 | 100.0% | 97.7% | 100.0% | 100.0% | 100.0% | 5.6s | 20.4s |

## Per field

| Field | Correct | Accuracy |
|---|---|---|
| invoiceNumber | 10/12 | 83.3% |
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

| Group | Docs | Schema valid | Field accuracy | Line precision | Line recall | Line F1 | Mean latency | p95 latency |
|---|---|---|---|---|---|---|---|---|
| german | 6 | 100.0% | 97.0% | 100.0% | 100.0% | 100.0% | 3.4s | 4.6s |
| english | 6 | 100.0% | 98.5% | 100.0% | 100.0% | 100.0% | 7.7s | 20.4s |
| clean | 6 | 100.0% | 97.0% | 100.0% | 100.0% | 100.0% | 7.9s | 20.4s |
| scanned | 3 | 100.0% | 97.0% | 100.0% | 100.0% | 100.0% | 4.0s | 4.6s |
| photo | 3 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 2.4s | 2.6s |

## Field accuracy by group

| Field | german | english | clean | scanned | photo |
|---|---|---|---|---|---|
| invoiceNumber | 83.3% | 83.3% | 66.7% | 100.0% | 100.0% |
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

### invoiceNumber: 83.3%

| Invoice | Expected | Got |
|---|---|---|
| inv-02 | "RE20260047" | null |
| inv-05 | "INV20261188" | null |

### customerAddress: 91.7%

| Invoice | Expected | Got |
|---|---|---|
| inv-07 | "Am Sparrenberg 13, 50667 Beispielburg" | "Am Sparrenberg 13, 50667 Beispieburg" |
