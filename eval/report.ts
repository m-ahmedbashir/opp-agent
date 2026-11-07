// Turns saved runs into markdown reports. It only reads results and never calls a model.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreByGroup, SCALAR_FIELDS, type FieldError, type GroupedScores, type RunRecord, type ScoreSummary, type TruthEntry } from './score';

const RESULTS_DIR = join(__dirname, 'results');
const truth: TruthEntry[] = JSON.parse(readFileSync(join(__dirname, 'data', 'ground_truth.json'), 'utf8'));

interface LoadedRun {
    name: string;
    meta: Record<string, any>;
    records: RunRecord[];
    scores: GroupedScores;
}

function loadRun(name: string): LoadedRun {
    const dir = join(RESULTS_DIR, name);
    if (!existsSync(join(dir, 'meta.json'))) throw new Error(`No finished run "${name}" in ${RESULTS_DIR}`);
    const records: RunRecord[] = readdirSync(dir)
        .filter((file) => /^inv-\d+\.json$/.test(file))
        .sort()
        .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')));
    return { name, meta: JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')), records, scores: scoreByGroup(records, truth) };
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const points = (after: number, before: number) => `${after >= before ? '+' : ''}${((after - before) * 100).toFixed(1)}`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const table = (header: string[], rows: string[][]) =>
    [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const cell = (value: unknown) => {
    const text = JSON.stringify(value) ?? 'null';
    const short = text.length > 400 ? `${text.slice(0, 400)}...` : text;
    return short.replace(/\|/g, '\\|');
};

function summaryRow(label: string, summary: ScoreSummary): string[] {
    return [
        label,
        String(summary.documents),
        pct(summary.schemaValidRate),
        pct(summary.fieldAccuracy),
        pct(summary.lineItems.precision),
        pct(summary.lineItems.recall),
        pct(summary.lineItems.f1),
        seconds(summary.latency.meanMs),
        seconds(summary.latency.p95Ms),
    ];
}
const SUMMARY_HEADER = ['Group', 'Docs', 'Schema valid', 'Field accuracy', 'Line precision', 'Line recall', 'Line F1', 'Mean latency', 'p95 latency'];

/** Every scored field with a single comparable value: accuracy, or F1 for line items. */
function fieldValues(summary: ScoreSummary): Array<{ field: string; value: number }> {
    return [
        ...SCALAR_FIELDS.map((field) => ({ field, value: summary.perField[field].accuracy })),
        { field: 'lineItems (F1)', value: summary.lineItems.f1 },
    ];
}

function worstFields(summary: ScoreSummary) {
    return fieldValues(summary)
        .filter(({ value }) => value < 1)
        .sort((a, b) => a.value - b.value)
        .slice(0, 5);
}

function writeRunReport(run: LoadedRun): string {
    const { overall, groups } = run.scores;
    const failures = run.records.filter((record) => record.error);
    const errorsFor = (field: string): FieldError[] => overall.errors.filter((e) => e.field === field.replace(' (F1)', ''));

    const sections = [
        `# Evaluation report: ${run.name}`,
        `Model: \`${run.meta.modelKey}\`. Mode: ${run.meta.processingMode}. Commit: \`${String(run.meta.gitCommit).slice(0, 7)}\`${run.meta.gitDirty ? ' plus uncommitted changes' : ''}. Finished: ${run.meta.finishedAt}.`,
        '## Overall',
        table(SUMMARY_HEADER, [summaryRow('all', overall)]),
        '## Per field',
        table(
            ['Field', 'Correct', 'Accuracy'],
            SCALAR_FIELDS.map((field) => [field, `${overall.perField[field].correct}/${overall.perField[field].total}`, pct(overall.perField[field].accuracy)]),
        ),
        `Line items: ${overall.lineCounts.truePositives} matched, ${overall.lineCounts.falsePositives} wrong or extra, ${overall.lineCounts.falseNegatives} missed.`,
        '## Per group',
        table(SUMMARY_HEADER, Object.entries(groups).map(([name, summary]) => summaryRow(name, summary))),
        '## Field accuracy by group',
        table(
            ['Field', ...Object.keys(groups)],
            fieldValues(overall).map(({ field }) => [
                field,
                ...Object.values(groups).map((summary) => pct(fieldValues(summary).find((f) => f.field === field)!.value)),
            ]),
        ),
        '## 5 worst fields',
        ...worstFields(overall).flatMap(({ field, value }) => [
            `### ${field}: ${pct(value)}`,
            table(['Invoice', 'Expected', 'Got'], errorsFor(field).slice(0, 3).map((e) => [e.id, cell(e.expected), cell(e.got)])),
        ]),
    ];
    if (failures.length) {
        sections.push('## Failed extractions', table(['Invoice', 'Error'], failures.map((r) => [r.id, cell(r.error)])));
    }
    const path = join(RESULTS_DIR, run.name, 'report.md');
    writeFileSync(path, `${sections.join('\n\n')}\n`);
    return path;
}

function writeCompareReport(before: LoadedRun, after: LoadedRun): string {
    const row = (label: string, b: number, a: number) => [label, pct(b), pct(a), points(a, b)];
    const beforeFields = fieldValues(before.scores.overall);
    const afterFields = fieldValues(after.scores.overall);
    const groupNames = Object.keys(before.scores.groups).filter((name) => after.scores.groups[name]);

    const warnings: string[] = [];
    if (before.meta.modelKey !== after.meta.modelKey) warnings.push(`Different models: ${before.meta.modelKey} vs ${after.meta.modelKey}.`);
    if (before.records.map((r) => r.id).join() !== after.records.map((r) => r.id).join()) warnings.push('The runs cover different invoices, so these numbers are not directly comparable.');

    const sections = [
        `# Compare: ${before.name} vs ${after.name}`,
        `Models: \`${before.meta.modelKey}\` vs \`${after.meta.modelKey}\`. Documents: ${before.records.length} vs ${after.records.length}. Change is in percentage points.`,
        ...warnings.map((warning) => `**Warning:** ${warning}`),
        '## Overall',
        table(['Metric', before.name, after.name, 'Change'], [
            row('Schema valid', before.scores.overall.schemaValidRate, after.scores.overall.schemaValidRate),
            row('Field accuracy', before.scores.overall.fieldAccuracy, after.scores.overall.fieldAccuracy),
            row('Line precision', before.scores.overall.lineItems.precision, after.scores.overall.lineItems.precision),
            row('Line recall', before.scores.overall.lineItems.recall, after.scores.overall.lineItems.recall),
            row('Line F1', before.scores.overall.lineItems.f1, after.scores.overall.lineItems.f1),
        ]),
        `Mean latency: ${seconds(before.scores.overall.latency.meanMs)} vs ${seconds(after.scores.overall.latency.meanMs)}.`,
        '## Per field',
        table(['Field', before.name, after.name, 'Change'], beforeFields.map(({ field, value }, i) => row(field, value, afterFields[i].value))),
        '## Field accuracy per group',
        table(['Group', before.name, after.name, 'Change'], groupNames.map((name) => row(name, before.scores.groups[name].fieldAccuracy, after.scores.groups[name].fieldAccuracy))),
        '## Line F1 per group',
        table(['Group', before.name, after.name, 'Change'], groupNames.map((name) => row(name, before.scores.groups[name].lineItems.f1, after.scores.groups[name].lineItems.f1))),
    ];
    const dir = join(RESULTS_DIR, `compare_${before.name}_vs_${after.name}`);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'report.md');
    writeFileSync(path, `${sections.join('\n\n')}\n`);
    return path;
}

function main() {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    let path: string;
    if (args[0] === '--compare') {
        if (args.length !== 3) throw new Error('Usage: pnpm eval:report --compare <run_a> <run_b>');
        path = writeCompareReport(loadRun(args[1]), loadRun(args[2]));
    } else {
        const name = args[0] === '--run-name' ? args[1] : args[0];
        if (!name) throw new Error('Usage: pnpm eval:report <run_name>  or  pnpm eval:report --compare <run_a> <run_b>');
        path = writeRunReport(loadRun(name));
    }
    console.log(`Wrote ${path}`);
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
