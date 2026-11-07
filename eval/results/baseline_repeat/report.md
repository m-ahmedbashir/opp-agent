# Evaluation report: baseline_repeat

Model: `google:gemini-3.1-flash-lite`. Mode: vision. Commit: `50d34d4`. Finished: 2026-11-07T15:41:16.813Z.

## Overall

| Group | Docs | Schema valid | Field accuracy | Line precision | Line recall | Line F1 | Mean latency | p95 latency |
|---|---|---|---|---|---|---|---|---|
| all | 12 | 91.7% | 89.4% | 100.0% | 90.9% | 95.2% | 5.7s | 30.0s |

## Per field

| Field | Correct | Accuracy |
|---|---|---|
| invoiceNumber | 9/12 | 75.0% |
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

Line items: 40 matched, 0 wrong or extra, 4 missed.

## Per group

| Group | Docs | Schema valid | Field accuracy | Line precision | Line recall | Line F1 | Mean latency | p95 latency |
|---|---|---|---|---|---|---|---|---|
| german | 6 | 83.3% | 80.3% | 100.0% | 83.3% | 90.9% | 9.2s | 30.0s |
| english | 6 | 100.0% | 98.5% | 100.0% | 100.0% | 100.0% | 2.2s | 3.3s |
| clean | 6 | 100.0% | 97.0% | 100.0% | 100.0% | 100.0% | 3.8s | 13.4s |
| scanned | 3 | 100.0% | 97.0% | 100.0% | 100.0% | 100.0% | 3.8s | 5.2s |
| photo | 3 | 66.7% | 66.7% | 100.0% | 60.0% | 75.0% | 11.3s | 30.0s |

## Field accuracy by group

| Field | german | english | clean | scanned | photo |
|---|---|---|---|---|---|
| invoiceNumber | 66.7% | 83.3% | 66.7% | 100.0% | 66.7% |
| vendorName | 83.3% | 100.0% | 100.0% | 100.0% | 66.7% |
| vendorAddress | 83.3% | 100.0% | 100.0% | 100.0% | 66.7% |
| customerName | 83.3% | 100.0% | 100.0% | 100.0% | 66.7% |
| customerAddress | 66.7% | 100.0% | 100.0% | 66.7% | 66.7% |
| currency | 83.3% | 100.0% | 100.0% | 100.0% | 66.7% |
| issueDate | 83.3% | 100.0% | 100.0% | 100.0% | 66.7% |
| dueDate | 83.3% | 100.0% | 100.0% | 100.0% | 66.7% |
| subtotal | 83.3% | 100.0% | 100.0% | 100.0% | 66.7% |
| taxAmount | 83.3% | 100.0% | 100.0% | 100.0% | 66.7% |
| totalAmount | 83.3% | 100.0% | 100.0% | 100.0% | 66.7% |
| lineItems (F1) | 90.9% | 100.0% | 100.0% | 100.0% | 75.0% |

## 5 worst fields

### invoiceNumber: 75.0%

| Invoice | Expected | Got |
|---|---|---|
| inv-02 | "RE20260047" | null |
| inv-05 | "INV20261188" | null |
| inv-10 | "RE-2026-0701" | "(extraction failed)" |

### customerAddress: 83.3%

| Invoice | Expected | Got |
|---|---|---|
| inv-07 | "Am Sparrenberg 13, 50667 Beispielburg" | "Am Sparrenberg 13, 50667 Beispieburg" |
| inv-10 | "Schillerplatz 19, 33602 Testhausen" | "(extraction failed)" |

### vendorName: 91.7%

| Invoice | Expected | Got |
|---|---|---|
| inv-10 | "Lindenhof Software GmbH" | "(extraction failed)" |

### vendorAddress: 91.7%

| Invoice | Expected | Got |
|---|---|---|
| inv-10 | "Lindenstraße 90, 10115 Musterstadt" | "(extraction failed)" |

### customerName: 91.7%

| Invoice | Expected | Got |
|---|---|---|
| inv-10 | "Teutoburger Druckhaus KG" | "(extraction failed)" |

## Failed extractions

| Invoice | Error |
|---|---|
| inv-10 | "The operation was aborted due to timeout" |
