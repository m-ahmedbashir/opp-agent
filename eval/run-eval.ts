// Runs the real ExtractionService over the synthetic invoices and saves every output.
// It imports the service rather than calling the API because the API can't choose a model
// per request and would write log rows to the real database. Only Prisma is stubbed below.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { InvoiceSchema } from '@opp/shared';
import { ComplianceService } from '../apps/backend/src/modules/compliance/compliance.service';
import { ExtractionService } from '../apps/backend/src/modules/extraction/extraction.service';
import { getDefaultModelKey, MODEL_REGISTRY, type ModelKey } from '../apps/backend/src/modules/extraction/model-registry';
import { OcrService } from '../apps/backend/src/modules/extraction/ocr.service';
import type { Language, Quality, RunRecord, TruthEntry } from './score';

const DATA_DIR = join(__dirname, 'data');
const RESULTS_DIR = join(__dirname, 'results');
const PAUSE_BETWEEN_CALLS_MS = 3_000;
const RATE_LIMIT_WAIT_MS = 60_000;
const MAX_RATE_LIMIT_RETRIES = 3;
const ONLY_VALUES = ['german', 'english', 'clean', 'scanned', 'photo'];

type GroundTruthEntry = TruthEntry & { file: string; mimeType: string; language: Language; quality: Quality };

function parseArgs(argv: string[]) {
    const options: Record<string, string> = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--') continue;
        if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`Bad argument: ${argv[i]}`);
        options[argv[i].slice(2)] = argv[++i];
    }
    return options;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    process.loadEnvFile(join(__dirname, '..', 'apps', 'backend', '.env'));

    const args = parseArgs(process.argv.slice(2));
    const runName = args['run-name'];
    if (!runName || !/^[\w.-]+$/.test(runName)) throw new Error('--run-name is required (letters, digits, "_", "-", ".")');

    // The service silently swaps an unknown model for the default, which would mislabel the whole run.
    const modelKey = (args.model ?? getDefaultModelKey()) as ModelKey;
    if (!(modelKey in MODEL_REGISTRY)) throw new Error(`Unknown model "${modelKey}". Options: ${Object.keys(MODEL_REGISTRY).join(', ')}`);
    if (args.only && !ONLY_VALUES.includes(args.only)) throw new Error(`--only must be one of: ${ONLY_VALUES.join(', ')}`);

    const runDir = join(RESULTS_DIR, runName);
    // Results are evidence, so never overwrite them.
    if (existsSync(runDir)) throw new Error(`Run "${runName}" already exists. Choose another name.`);

    const truth: GroundTruthEntry[] = JSON.parse(readFileSync(join(DATA_DIR, 'ground_truth.json'), 'utf8'));
    let selected = args.only ? truth.filter((t) => t.language === args.only || t.quality === args.only) : truth;
    if (args.limit) selected = selected.slice(0, Number(args.limit));

    // Everything below is the production pipeline. The stub keeps the service's error
    // text, which it otherwise reduces to a generic message, and writes nothing.
    let lastLoggedError: string | null = null;
    const prismaStub = {
        extractionLog: {
            create: async ({ data }: { data: { errorMessage?: string } }) => {
                lastLoggedError = data.errorMessage ?? null;
                return { id: 'eval-no-db' };
            },
        },
    };
    const service = new ExtractionService(new ComplianceService(), prismaStub as any, modelKey, new OcrService(), 'vision');

    mkdirSync(runDir, { recursive: true });
    const records: RunRecord[] = [];

    for (const [index, entry] of selected.entries()) {
        if (index > 0) await sleep(PAUSE_BETWEEN_CALLS_MS);
        const buffer = readFileSync(join(DATA_DIR, 'invoices', entry.file));
        const file = { originalname: entry.file, mimetype: entry.mimeType, size: buffer.length, buffer } as Express.Multer.File;

        let saved: Record<string, unknown> = {};
        let record: RunRecord | undefined;
        let rateLimitRetries = 0;

        for (;;) {
            lastLoggedError = null;
            const started = Date.now();
            try {
                // documentType is pinned so classification mistakes don't count against extraction.
                const result = await service.processFile(file, undefined, modelKey, undefined, 'vision', 'invoice');
                record = {
                    id: entry.id,
                    language: entry.language,
                    quality: entry.quality,
                    extractedData: result.extractedData as RunRecord['extractedData'],
                    schemaValid: InvoiceSchema.safeParse(result.extractedData).success,
                    latencyMs: Date.now() - started,
                    error: null,
                };
                saved = { confidence: result.confidence, avgConfidence: result.avgConfidence, maskedText: result.maskedText, piiDetected: result.piiDetected, imagePiiDetected: result.imagePiiDetected, sourceType: result.sourceType };
            } catch (error) {
                const message = lastLoggedError ?? (error instanceof Error ? error.message : String(error));
                const status = (error as { getStatus?: () => number }).getStatus?.();
                // Some providers report rate limits only in the error text, behind a generic 500 from the service.
                const rateLimited = status === 429 || /rate.?limit|\b429\b/i.test(message);
                if (rateLimited && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
                    rateLimitRetries++;
                    console.log(`${entry.id}: rate limited, waiting ${RATE_LIMIT_WAIT_MS / 1000}s (retry ${rateLimitRetries})`);
                    await sleep(RATE_LIMIT_WAIT_MS);
                    continue;
                }
                record = {
                    id: entry.id,
                    language: entry.language,
                    quality: entry.quality,
                    extractedData: null,
                    schemaValid: false,
                    latencyMs: Date.now() - started,
                    error: message,
                };
            }
            break;
        }

        records.push(record);
        writeFileSync(join(runDir, `${entry.id}.json`), `${JSON.stringify({ ...record, rateLimitRetries, ...saved }, null, 2)}\n`);
        console.log(`[${index + 1}/${selected.length}] ${entry.id}: ${record.error ? `FAILED ${record.error}` : 'ok'} (${record.latencyMs} ms)`);
    }

    const git = (command: string) => execSync(`git ${command}`, { encoding: 'utf8' }).trim();
    writeFileSync(
        join(runDir, 'meta.json'),
        `${JSON.stringify(
            {
                runName,
                modelKey,
                modelId: MODEL_REGISTRY[modelKey].modelId,
                processingMode: 'vision',
                only: args.only ?? null,
                limit: args.limit ? Number(args.limit) : null,
                documents: records.length,
                failures: records.filter((r) => r.error).length,
                gitCommit: git('rev-parse HEAD'),
                gitDirty: git('status --porcelain -- apps packages') !== '',
                finishedAt: new Date().toISOString(),
            },
            null,
            2,
        )}\n`,
    );
    console.log(`Saved ${records.length} results to ${runDir}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
