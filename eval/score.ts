// Pure scoring functions: no file, network or model access, so every number can be unit tested.

export type Language = 'german' | 'english';
export type Quality = 'clean' | 'scanned' | 'photo';

export interface LineItem {
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
}

export interface InvoiceData {
    invoiceNumber: string | null;
    issueDate: string | null;
    dueDate: string | null;
    vendorName: string | null;
    vendorAddress: string | null;
    customerName: string | null;
    customerAddress: string | null;
    lineItems: LineItem[];
    subtotal: number | null;
    taxAmount: number | null;
    totalAmount: number | null;
    currency: string | null;
}

export interface TruthEntry {
    id: string;
    language: Language;
    quality: Quality;
    invoice: InvoiceData;
}

/** One saved extraction attempt. `extractedData` is null when the attempt failed. */
export interface RunRecord {
    id: string;
    language: Language;
    quality: Quality;
    extractedData: InvoiceData | null;
    schemaValid: boolean;
    latencyMs: number;
    error: string | null;
}

export const TEXT_FIELDS = ['invoiceNumber', 'vendorName', 'vendorAddress', 'customerName', 'customerAddress', 'currency'] as const;
export const DATE_FIELDS = ['issueDate', 'dueDate'] as const;
export const AMOUNT_FIELDS = ['subtotal', 'taxAmount', 'totalAmount'] as const;
export const SCALAR_FIELDS = [...TEXT_FIELDS, ...DATE_FIELDS, ...AMOUNT_FIELDS] as const;
export type ScalarField = (typeof SCALAR_FIELDS)[number];

// ── Normalisation: make equal values look equal before comparing them ─────────

const MONTHS: Record<string, number> = {
    jan: 1, januar: 1, january: 1,
    feb: 2, februar: 2, february: 2,
    mar: 3, mrz: 3, 'mär': 3, march: 3, 'märz': 3,
    apr: 4, april: 4,
    may: 5, mai: 5,
    jun: 6, juni: 6, june: 6,
    jul: 7, juli: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, okt: 10, october: 10, oktober: 10,
    nov: 11, november: 11,
    dec: 12, dez: 12, december: 12, dezember: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Turns any date format we print into YYYY-MM-DD. Unreadable or ambiguous dates (11/01/2026) stay as text and so won't match. */
export function normalizeDate(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim().toLowerCase();
    if (!text) return null;

    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:t.*)?$/);
    if (match) return isoDate(+match[1], +match[2], +match[3]) ?? text;

    match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (match) return isoDate(+match[3], +match[2], +match[1]) ?? text;

    match = text.match(/^(\d{1,2})\.?\s+([\p{L}]+)\.?,?\s+(\d{4})$/u);
    if (match && MONTHS[match[2]]) return isoDate(+match[3], MONTHS[match[2]], +match[1]) ?? text;

    match = text.match(/^([\p{L}]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/u);
    if (match && MONTHS[match[1]]) return isoDate(+match[3], MONTHS[match[1]], +match[2]) ?? text;

    return text;
}

/** Rounds to 2 decimals. Also reads strings written as 1.234,56 or 1,234.56, where the last separator is the decimal one. */
export function normalizeAmount(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;

    const text = String(value).replace(/[^\d.,-]/g, '');
    const lastSeparator = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
    const hasDecimals = lastSeparator >= 0 && text.length - lastSeparator - 1 <= 2;
    const whole = (hasDecimals ? text.slice(0, lastSeparator) : text).replace(/[.,]/g, '');
    const decimals = hasDecimals ? text.slice(lastSeparator + 1) : '';
    const parsed = Number(`${whole}.${decimals || '0'}`);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

/** Lowercase, no outer spaces. Line breaks and commas become single spaces, so address layout doesn't count as an error. */
export function normalizeText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/[,\s]+/g, ' ').trim().toLowerCase();
    return text || null;
}

/** IBANs are often printed in groups of four, so remove the spaces. InvoiceSchema has no IBAN field, so nothing scores this yet. */
export function normalizeIban(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return String(value).replace(/\s+/g, '').toUpperCase() || null;
}

// ── Comparing single values ───────────────────────────────────────────────────

/** Two amounts count as the same if they differ by at most one cent. The tiny extra absorbs floating-point rounding. */
export function amountsMatch(expected: unknown, actual: unknown): boolean {
    const a = normalizeAmount(expected);
    const b = normalizeAmount(actual);
    if (a === null || b === null) return a === b;
    return Math.abs(a - b) <= 0.01 + 1e-9;
}

export function fieldMatches(field: ScalarField, expected: unknown, actual: unknown): boolean {
    if ((AMOUNT_FIELDS as readonly string[]).includes(field)) return amountsMatch(expected, actual);
    if ((DATE_FIELDS as readonly string[]).includes(field)) return normalizeDate(expected) === normalizeDate(actual);
    return normalizeText(expected) === normalizeText(actual);
}

/** How alike two texts are, from 0 to 1: the share of two-letter pairs they have in common (the Dice coefficient). */
export function textSimilarity(a: string, b: string): number {
    const left = normalizeText(a) ?? '';
    const right = normalizeText(b) ?? '';
    if (left === right) return 1;
    if (left.length < 2 || right.length < 2) return 0;

    const pairs = new Map<string, number>();
    for (let i = 0; i < left.length - 1; i++) {
        const pair = left.slice(i, i + 2);
        pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
    }
    let shared = 0;
    for (let i = 0; i < right.length - 1; i++) {
        const pair = right.slice(i, i + 2);
        const left_count = pairs.get(pair) ?? 0;
        if (left_count > 0) {
            shared++;
            pairs.set(pair, left_count - 1);
        }
    }
    return (2 * shared) / (left.length + right.length - 2);
}

// ── Line items ────────────────────────────────────────────────────────────────

export const LINE_SIMILARITY_THRESHOLD = 0.6;

export interface LineCounts {
    /** Found by the model and really on the invoice. */
    truePositives: number;
    /** Returned by the model but not on the invoice (or with the wrong amount). */
    falsePositives: number;
    /** On the invoice but missed by the model. */
    falseNegatives: number;
}

/** Pairs lines one-to-one, best description match first. A pair needs a similar description AND the same line total. */
export function matchLineItems(expected: LineItem[], actual: LineItem[]): LineCounts {
    const candidates: Array<{ e: number; a: number; similarity: number }> = [];
    expected.forEach((expectedLine, e) => {
        actual.forEach((actualLine, a) => {
            const similarity = textSimilarity(expectedLine.description, actualLine.description);
            if (similarity >= LINE_SIMILARITY_THRESHOLD && amountsMatch(expectedLine.totalPrice, actualLine.totalPrice)) {
                candidates.push({ e, a, similarity });
            }
        });
    });
    candidates.sort((x, y) => y.similarity - x.similarity);

    const usedExpected = new Set<number>();
    const usedActual = new Set<number>();
    for (const { e, a } of candidates) {
        if (!usedExpected.has(e) && !usedActual.has(a)) {
            usedExpected.add(e);
            usedActual.add(a);
        }
    }
    return {
        truePositives: usedExpected.size,
        falsePositives: actual.length - usedActual.size,
        falseNegatives: expected.length - usedExpected.size,
    };
}

export interface PrfScores {
    precision: number;
    recall: number;
    f1: number;
}

export function precisionRecallF1({ truePositives: tp, falsePositives: fp, falseNegatives: fn }: LineCounts): PrfScores {
    // Precision: of the lines the model returned, how many were right?
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    // Recall: of the lines really on the invoice, how many did the model find?
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    // F1: one number balancing both. It is only high when precision and recall are both high.
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { precision, recall, f1 };
}

// ── Whole-run scoring ─────────────────────────────────────────────────────────

export interface FieldError {
    id: string;
    field: string;
    expected: unknown;
    got: unknown;
}

export interface FieldScore {
    correct: number;
    total: number;
    accuracy: number;
}

export interface LatencyStats {
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
}

export interface ScoreSummary {
    documents: number;
    /** Share of documents that produced output passing InvoiceSchema. Failed calls count as not valid. */
    schemaValidRate: number;
    /** All scalar fields over all documents, pooled: correct answers / questions asked. */
    fieldAccuracy: number;
    perField: Record<ScalarField, FieldScore>;
    lineCounts: LineCounts;
    lineItems: PrfScores;
    latency: LatencyStats;
    errors: FieldError[];
}

/** Nearest-rank percentile: the value at or below which p% of the sorted values fall. */
export function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function latencyStats(values: number[]): LatencyStats {
    return {
        meanMs: values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0,
        p50Ms: percentile(values, 50),
        p95Ms: percentile(values, 95),
    };
}

/**
 * Scores records against the truth. A failed extraction has no output, so it counts
 * as wrong on every field and misses every line; failures can't inflate accuracy.
 */
export function scoreRecords(records: RunRecord[], truth: TruthEntry[]): ScoreSummary {
    const truthById = new Map(truth.map((entry) => [entry.id, entry]));
    const perField = Object.fromEntries(
        SCALAR_FIELDS.map((field) => [field, { correct: 0, total: 0, accuracy: 0 }]),
    ) as Record<ScalarField, FieldScore>;
    const lineCounts: LineCounts = { truePositives: 0, falsePositives: 0, falseNegatives: 0 };
    const errors: FieldError[] = [];

    for (const record of records) {
        const entry = truthById.get(record.id);
        if (!entry) throw new Error(`No ground truth for "${record.id}"`);
        const output = record.extractedData;

        for (const field of SCALAR_FIELDS) {
            const expected = entry.invoice[field];
            const got = output ? output[field] : null;
            // A failed call is wrong even where the correct answer is null.
            const correct = output !== null && fieldMatches(field, expected, got);
            perField[field].total++;
            if (correct) perField[field].correct++;
            else errors.push({ id: record.id, field, expected, got: output ? got : `(extraction failed)` });
        }

        const counts = matchLineItems(entry.invoice.lineItems, output?.lineItems ?? []);
        lineCounts.truePositives += counts.truePositives;
        lineCounts.falsePositives += counts.falsePositives;
        lineCounts.falseNegatives += counts.falseNegatives;
        if (counts.falsePositives > 0 || counts.falseNegatives > 0) {
            errors.push({
                id: record.id,
                field: 'lineItems',
                expected: entry.invoice.lineItems,
                got: output ? output.lineItems : `(extraction failed)`,
            });
        }
    }

    let correct = 0;
    let total = 0;
    for (const field of SCALAR_FIELDS) {
        const score = perField[field];
        // Accuracy: how often this field was exactly right after normalising.
        score.accuracy = score.total ? score.correct / score.total : 0;
        correct += score.correct;
        total += score.total;
    }

    return {
        documents: records.length,
        schemaValidRate: records.length ? records.filter((r) => r.schemaValid).length / records.length : 0,
        fieldAccuracy: total ? correct / total : 0,
        perField,
        lineCounts,
        lineItems: precisionRecallF1(lineCounts),
        latency: latencyStats(records.map((r) => r.latencyMs)),
        errors,
    };
}

export interface GroupedScores {
    overall: ScoreSummary;
    groups: Record<string, ScoreSummary>;
}

/** The same scores, overall and split by language and by document quality. Empty groups are left out. */
export function scoreByGroup(records: RunRecord[], truth: TruthEntry[]): GroupedScores {
    const groups: Record<string, ScoreSummary> = {};
    for (const key of ['german', 'english', 'clean', 'scanned', 'photo']) {
        const subset = records.filter((r) => r.language === key || r.quality === key);
        if (subset.length) groups[key] = scoreRecords(subset, truth);
    }
    return { overall: scoreRecords(records, truth), groups };
}
