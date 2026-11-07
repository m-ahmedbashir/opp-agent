# Evaluation report: improved

Model: `google:gemini-3.1-flash-lite`. Mode: vision. Commit: `e391c6f`. Finished: 2026-11-07T16:14:32.373Z.

## Overall

| Group | Docs | Schema valid | Field accuracy | Accuracy when completed | Line precision | Line recall | Line F1 | Mean latency | p95 latency |
|---|---|---|---|---|---|---|---|---|---|
| all | 12 | 91.7% | 90.9% | 99.2% | 100.0% | 93.2% | 96.5% | 5.4s | 30.6s |

## Per field

| Field | Correct | Accuracy |
|---|---|---|
| invoiceNumber | 11/12 | 91.7% |
| vendorName | 11/12 | 91.7% |
| vendorAddress | 11/12 | 91.7% |
| customerName | 11/12 | 91.7% |
| customerAddress | 10/12 | 83.3% |
| currency | 11/12 | 91.7% |
| issueDate | 11/12 | 91.7% |
| dueDate | 11/12 | 91.7% |
| subtotal | 11/12 | 91.7% |
| taxAmount | 11/12 | 91.7% |
| totalAmount | 11/12 | 91.7% |

Line items: 41 matched, 0 wrong or extra, 3 missed.

## Per group

| Group | Docs | Schema valid | Field accuracy | Accuracy when completed | Line precision | Line recall | Line F1 | Mean latency | p95 latency |
|---|---|---|---|---|---|---|---|---|---|
| german | 6 | 83.3% | 81.8% | 98.2% | 100.0% | 87.5% | 93.3% | 7.7s | 30.6s |
| english | 6 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 3.0s | 4.6s |
| clean | 6 | 83.3% | 83.3% | 100.0% | 100.0% | 87.0% | 93.0% | 6.8s | 30.6s |
| scanned | 3 | 100.0% | 97.0% | 97.0% | 100.0% | 100.0% | 100.0% | 4.5s | 5.1s |
| photo | 3 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 3.2s | 3.8s |

## Field accuracy by group

| Field | german | english | clean | scanned | photo |
|---|---|---|---|---|---|
| invoiceNumber | 83.3% | 100.0% | 83.3% | 100.0% | 100.0% |
| vendorName | 83.3% | 100.0% | 83.3% | 100.0% | 100.0% |
| vendorAddress | 83.3% | 100.0% | 83.3% | 100.0% | 100.0% |
| customerName | 83.3% | 100.0% | 83.3% | 100.0% | 100.0% |
| customerAddress | 66.7% | 100.0% | 83.3% | 66.7% | 100.0% |
| currency | 83.3% | 100.0% | 83.3% | 100.0% | 100.0% |
| issueDate | 83.3% | 100.0% | 83.3% | 100.0% | 100.0% |
| dueDate | 83.3% | 100.0% | 83.3% | 100.0% | 100.0% |
| subtotal | 83.3% | 100.0% | 83.3% | 100.0% | 100.0% |
| taxAmount | 83.3% | 100.0% | 83.3% | 100.0% | 100.0% |
| totalAmount | 83.3% | 100.0% | 83.3% | 100.0% | 100.0% |
| lineItems (F1) | 93.3% | 100.0% | 93.0% | 100.0% | 100.0% |

## 5 worst fields

### customerAddress: 83.3%

| Invoice | Expected | Got |
|---|---|---|
| inv-01 | "Schillerplatz 61, 10115 Musterstadt" | "(extraction failed)" |
| inv-07 | "Am Sparrenberg 13, 50667 Beispielburg" | "Am Sparrenberg 13, 50667 Beispieburg" |

### invoiceNumber: 91.7%

| Invoice | Expected | Got |
|---|---|---|
| inv-01 | "RE-2026-0412" | "(extraction failed)" |

### vendorName: 91.7%

| Invoice | Expected | Got |
|---|---|---|
| inv-01 | "Nordlicht Bürotechnik GmbH" | "(extraction failed)" |

### vendorAddress: 91.7%

| Invoice | Expected | Got |
|---|---|---|
| inv-01 | "Herforder Allee 40, 33602 Testhausen" | "(extraction failed)" |

### customerName: 91.7%

| Invoice | Expected | Got |
|---|---|---|
| inv-01 | "Weserblick Handels AG" | "(extraction failed)" |

## Failed extractions

| Invoice | Error |
|---|---|
| inv-01 | "The operation was aborted due to timeout" |
