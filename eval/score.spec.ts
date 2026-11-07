import {
    amountsMatch,
    fieldMatches,
    matchLineItems,
    normalizeAmount,
    normalizeDate,
    normalizeIban,
    normalizeText,
    percentile,
    precisionRecallF1,
    scoreByGroup,
    scoreRecords,
    textSimilarity,
    type InvoiceData,
    type RunRecord,
    type TruthEntry,
} from './score';

const invoice: InvoiceData = {
    invoiceNumber: 'RE-1',
    issueDate: '2026-11-01',
    dueDate: null,
    vendorName: 'Acme GmbH',
    vendorAddress: 'Weg 1, 33602 Bielefeld',
    customerName: 'Beta AG',
    customerAddress: 'Allee 2, 10115 Berlin',
    lineItems: [
        { description: 'Widget Pro', quantity: 2, unitPrice: 50, totalPrice: 100 },
        { description: 'Setup fee', quantity: 1, unitPrice: 20, totalPrice: 20 },
    ],
    subtotal: 120,
    taxAmount: 22.8,
    totalAmount: 142.8,
    currency: 'EUR',
};

const truth: TruthEntry[] = [
    { id: 'a', language: 'german', quality: 'clean', invoice },
    { id: 'b', language: 'english', quality: 'photo', invoice },
];

function record(id: string, overrides: Partial<RunRecord> = {}): RunRecord {
    const entry = truth.find((t) => t.id === id)!;
    return {
        id,
        language: entry.language,
        quality: entry.quality,
        extractedData: invoice,
        schemaValid: true,
        latencyMs: 100,
        error: null,
        ...overrides,
    };
}

describe('normalizeDate', () => {
    it.each([
        ['01.11.2026', '2026-11-01'],
        ['1.11.2026', '2026-11-01'],
        ['2026-11-01', '2026-11-01'],
        ['2026-11-01T00:00:00Z', '2026-11-01'],
        ['1 Nov 2026', '2026-11-01'],
        ['1. November 2026', '2026-11-01'],
        ['3. März 2026', '2026-03-03'],
        ['November 1, 2026', '2026-11-01'],
    ])('reads %s', (input, expected) => {
        expect(normalizeDate(input)).toBe(expected);
    });

    it('keeps null and does not guess ambiguous or impossible dates', () => {
        expect(normalizeDate(null)).toBeNull();
        expect(normalizeDate('11/01/2026')).toBe('11/01/2026');
        expect(normalizeDate('32.13.2026')).toBe('32.13.2026');
    });
});

describe('normalizeAmount', () => {
    it.each([
        ['1.234,56', 1234.56],
        ['1,234.56', 1234.56],
        ['1.234', 1234],
        ['-19,90 €', -19.9],
        [12.345, 12.35],
    ])('reads %s', (input, expected) => {
        expect(normalizeAmount(input)).toBeCloseTo(expected as number, 2);
    });

    it('keeps missing values null', () => {
        expect(normalizeAmount(null)).toBeNull();
        expect(normalizeAmount('')).toBeNull();
    });
});

describe('text and IBAN normalisation', () => {
    it('ignores case, outer spaces, line breaks and commas', () => {
        expect(normalizeText('  Weg 1,\n33602  BIELEFELD ')).toBe('weg 1 33602 bielefeld');
    });

    it('removes spaces from an IBAN', () => {
        expect(normalizeIban('de89 3704 0044 0532 0130 00')).toBe('DE89370400440532013000');
    });
});

describe('amountsMatch', () => {
    it('allows one cent of difference, not two', () => {
        expect(amountsMatch(100, 100.01)).toBe(true);
        expect(amountsMatch(100, 100.02)).toBe(false);
    });

    it('treats null as matching only null', () => {
        expect(amountsMatch(null, null)).toBe(true);
        expect(amountsMatch(null, 0)).toBe(false);
    });
});

describe('fieldMatches', () => {
    it('compares each kind of field with its own rule', () => {
        expect(fieldMatches('issueDate', '2026-11-01', '01.11.2026')).toBe(true);
        expect(fieldMatches('totalAmount', 142.8, 142.81)).toBe(true);
        expect(fieldMatches('vendorName', 'Acme GmbH', 'ACME GMBH ')).toBe(true);
        expect(fieldMatches('vendorName', 'Acme GmbH', 'Acme')).toBe(false);
    });

    it('penalises an invented value where the document has none', () => {
        expect(fieldMatches('dueDate', null, '2026-12-01')).toBe(false);
        expect(fieldMatches('dueDate', null, null)).toBe(true);
    });
});

describe('textSimilarity', () => {
    it('is 1 for equal text, 0 for unrelated text', () => {
        expect(textSimilarity('Widget', ' widget ')).toBe(1);
        expect(textSimilarity('abcd', 'wxyz')).toBe(0);
    });
});

describe('matchLineItems', () => {
    const [widget, setup] = invoice.lineItems;

    it('counts a perfect match', () => {
        expect(matchLineItems([widget, setup], [setup, widget])).toEqual({ truePositives: 2, falsePositives: 0, falseNegatives: 0 });
    });

    it('rejects a similar description with the wrong amount', () => {
        expect(matchLineItems([widget], [{ ...widget, totalPrice: 99 }])).toEqual({ truePositives: 0, falsePositives: 1, falseNegatives: 1 });
    });

    it('rejects the right amount with an unrelated description', () => {
        expect(matchLineItems([widget], [{ ...widget, description: 'Consulting' }])).toEqual({ truePositives: 0, falsePositives: 1, falseNegatives: 1 });
    });

    it('does not match one returned line twice', () => {
        expect(matchLineItems([widget, widget], [widget])).toEqual({ truePositives: 1, falsePositives: 0, falseNegatives: 1 });
    });
});

describe('precisionRecallF1', () => {
    it('computes a known example', () => {
        const scores = precisionRecallF1({ truePositives: 3, falsePositives: 1, falseNegatives: 3 });
        expect(scores.precision).toBeCloseTo(0.75);
        expect(scores.recall).toBeCloseTo(0.5);
        expect(scores.f1).toBeCloseTo(0.6);
    });

    it('returns zeros rather than dividing by zero', () => {
        expect(precisionRecallF1({ truePositives: 0, falsePositives: 0, falseNegatives: 0 })).toEqual({ precision: 0, recall: 0, f1: 0 });
    });
});

describe('percentile', () => {
    it('uses the nearest rank', () => {
        expect(percentile([10, 20, 30, 40], 50)).toBe(20);
        expect(percentile([10, 20, 30, 40], 95)).toBe(40);
        expect(percentile([], 50)).toBe(0);
    });
});

describe('scoreRecords', () => {
    it('gives full marks to a perfect extraction', () => {
        const summary = scoreRecords([record('a')], truth);
        expect(summary.fieldAccuracy).toBe(1);
        expect(summary.lineItems.f1).toBe(1);
        expect(summary.schemaValidRate).toBe(1);
        expect(summary.errors).toEqual([]);
    });

    it('counts a failed extraction as wrong everywhere, even on null fields', () => {
        const summary = scoreRecords([record('a', { extractedData: null, schemaValid: false, error: 'timeout' })], truth);
        expect(summary.fieldAccuracy).toBe(0);
        expect(summary.perField.dueDate.correct).toBe(0);
        expect(summary.lineCounts).toEqual({ truePositives: 0, falsePositives: 0, falseNegatives: 2 });
        expect(summary.schemaValidRate).toBe(0);
    });

    it('leaves failed calls out of completed accuracy only', () => {
        const summary = scoreRecords([record('a'), record('b', { extractedData: null, schemaValid: false })], truth);
        expect(summary.fieldAccuracy).toBe(0.5);
        expect(summary.completedFieldAccuracy).toBe(1);
    });

    it('records expected and got for a wrong field', () => {
        const summary = scoreRecords([record('a', { extractedData: { ...invoice, totalAmount: 1 } })], truth);
        expect(summary.perField.totalAmount.accuracy).toBe(0);
        expect(summary.errors).toEqual([{ id: 'a', field: 'totalAmount', expected: 142.8, got: 1 }]);
    });

    it('rejects a record with no ground truth', () => {
        expect(() => scoreRecords([{ ...record('a'), id: 'missing' }], truth)).toThrow('No ground truth');
    });
});

describe('scoreByGroup', () => {
    it('splits by language and quality and skips empty groups', () => {
        const { overall, groups } = scoreByGroup(
            [record('a'), record('b', { extractedData: null, schemaValid: false })],
            truth,
        );
        expect(overall.documents).toBe(2);
        expect(Object.keys(groups).sort()).toEqual(['clean', 'english', 'german', 'photo']);
        expect(groups.german.fieldAccuracy).toBe(1);
        expect(groups.photo.fieldAccuracy).toBe(0);
    });
});
