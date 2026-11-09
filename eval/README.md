# Invoice extraction evaluation

This harness measures how well the real extraction pipeline reads invoices. It runs 12 synthetic invoices through `ExtractionService`, including PII masking and the real model call, and compares each output with a known correct answer. Only the database is stubbed, so a run writes nothing to it.

## Run it in 3 commands

```bash
pnpm eval:generate
pnpm eval:run --run-name my_run --model google:gemini-3.1-flash-lite
pnpm eval:report my_run
```

The first command is optional, because the invoices are committed and the fixed seed recreates them exactly. The API key comes from `apps/backend/.env`; for this model it is `GOOGLE_GENERATIVE_AI_API_KEY`. The report is written to `eval/results/my_run/report.md`.

- **Run options:** `--run-name`, `--model` (a key from `model-registry.ts`), `--limit`, `--only german|english|clean|scanned|photo`
- **Compare two runs:** `pnpm eval:report --compare run_a run_b`
- **Scorer tests:** `pnpm --filter eval test` (these make no model calls)

## What is tested

| | Clean PDF | Scanned PDF (no text layer) | Photo (JPEG) |
|---|---|---|---|
| German | 3 | 2 | 1 |
| English | 3 | 1 | 2 |

The invoices vary date formats, number formats (1.234,56 and 1,234.56), line counts (1-8) and VAT (19% and 7%). They include one discount, one negative line and two invoices with no due date. `InvoiceSchema` has no IBAN, VAT ID, discount or VAT rate field, so those are printed on the invoices but not scored.

## What the numbers mean

Values are normalised before comparing: dates to ISO, amounts to 2 decimals, text to trimmed lowercase with line breaks and commas ignored. Amounts within 0.01 count as correct.

- **Field accuracy:** how often a field was exactly right, across all documents. A failed call counts as wrong on every field.
- **Accuracy when completed:** the same, leaving out failed calls. This separates reading quality from reliability.
- **Precision (line items):** of the lines the model returned, how many were right? Low precision means invented or wrong lines.
- **Recall (line items):** of the lines on the invoice, how many did the model find? Low recall means missed lines.
- **F1 (line items):** one number balancing precision and recall. It is only high when both are high.
- **Schema-valid rate:** the share of documents that produced output passing `InvoiceSchema`. Failed calls count as not valid.
- **Latency:** time per document, as the mean and the 95th percentile (p95).

A line item counts as matched if its description is at least 0.6 similar and its total is within 0.01. Quantity and unit price are not scored.

## Results

All runs used `google:gemini-3.1-flash-lite` in vision mode on the same 12 invoices. Each version ran twice, because results vary between identical runs.

| Metric | Baseline 1 | Baseline 2 | Improved 1 | Improved 2 |
|---|---|---|---|---|
| `invoiceNumber`, completed calls only | 10/12 | 9/11 | 11/11 | 12/12 |
| Accuracy when completed | 97.7% | 97.5% | 99.2% | 99.2% |
| Field accuracy, all documents | 97.7% | 89.4% | 90.9% | 99.2% |
| Line item F1 | 100.0% | 95.2% | 96.5% | 100.0% |
| Line item precision | 100.0% | 100.0% | 100.0% | 100.0% |
| Line item recall | 100.0% | 90.9% | 93.2% | 100.0% |
| Schema valid | 100.0% | 91.7% | 91.7% | 100.0% |
| Failed calls (timeouts) | 0 | 1 | 1 | 0 |
| Mean latency | 5.6s | 5.7s | 5.4s | 6.2s |

### What the baseline found

`invoiceNumber` was the weakest field, and the model was not the cause. The PII masking treated compact invoice numbers such as `RE20260047` and `INV20261188` as VAT IDs, so the model received `[REDACTED:VAT]` and correctly answered `null`. No prompt change could recover text that had already been removed.

### What changed

The change is one fix to the masking in `compliance.service.ts`, not to the prompt:

- The VAT pattern now needs a real VAT country prefix and at least one digit.
- The phone pattern, which also matched inside those numbers, now skips digits attached to a leading letter.

Both invoices returned the right number in both improved runs, and tests confirm that VAT IDs and phone numbers are still masked.

### How to read these results

- **The all-documents score mostly tracks timeouts.** One timeout at the service's 30-second limit costs about 8 points, which is larger than the improvement. That's why Improved 1 scores below Baseline 1. Compare the "completed" row for reading quality.
- **The sample is small and synthetic.** With 12 invoices these numbers show direction, not production accuracy. The invoices are also tidy and were not held out from the fix.
- **German and English were close.** German was slightly lower in every run because of one scan typo (`Beispieburg` for `Beispielburg`), which appeared in all four runs.

### Open issues the eval exposed

- **Timeouts:** 2 of 48 calls hit the 30-second limit, on different invoices, on Gemini's free tier.
- **Partial masking:** spaced IBANs keep their first group (`DE91`), and long phone numbers keep their last digits. This is sent to the model in the PDF text path.
- **Masking trade-off:** VAT IDs with a prefix outside the list in `compliance.service.ts`, and phone numbers attached directly to a letter, are no longer masked.
