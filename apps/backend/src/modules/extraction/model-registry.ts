import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

// ── Types ────────────────────────────────────────────────────────────────────

export type ModelProviderName = 'openrouter' | 'groq' | 'openai' | 'anthropic' | 'google';

export interface ModelDescriptor {
    provider: ModelProviderName;
    modelId: string;
    /**
     * Whether this model accepts image content parts. Plenty of text-only
     * models exist — the extraction pipeline must check this before sending
     * an image, not assume every model can see.
     */
    supportsVision: boolean;
}

// ── Registry ─────────────────────────────────────────────────────────────────

/**
 * Every model the extraction pipeline can be pointed at. Swapping the default
 * model is a DEFAULT_MODEL_KEY env var (see getDefaultModelKey() below), not
 * a code change to ExtractionService — that's the entire point of this file.
 */
export const MODEL_REGISTRY = {
    'openrouter:nemotron-nano-12b-v2-vl-free': {
        provider: 'openrouter',
        modelId: 'nvidia/nemotron-nano-12b-v2-vl:free',
        supportsVision: true,
    },
    'openrouter:gemma-4-26b-a4b-it-free': {
        provider: 'openrouter',
        modelId: 'google/gemma-4-26b-a4b-it:free',
        supportsVision: true,
    },
    'groq:llama-4-scout': {
        provider: 'groq',
        modelId: 'meta-llama/llama-4-scout-17b-16e-instruct',
        supportsVision: true,
    },
    'groq:llama-3.3-70b': {
        provider: 'groq',
        modelId: 'llama-3.3-70b-versatile',
        supportsVision: false,
    },
    'groq:compound-mini': {
        provider: 'groq',
        modelId: 'groq/compound-mini',
        supportsVision: false,
    },
    'groq:compound': {
        provider: 'groq',
        modelId: 'groq/compound',
        supportsVision: false,
    },
    'groq:qwen3.6-27b': {
        provider: 'groq',
        modelId: 'qwen/qwen3.6-27b',
        supportsVision: true,
    },
    'openai:gpt-4o': {
        provider: 'openai',
        modelId: 'gpt-4o',
        supportsVision: true,
    },
    'anthropic:claude-3-5-sonnet': {
        provider: 'anthropic',
        modelId: 'claude-3-5-sonnet-20241022',
        supportsVision: true,
    },
    // Cheapest current Gemini tier ($0.10/$0.40 per M input/output tokens) —
    // multimodal, explicitly positioned by Google for high-volume/low-cost
    // structured extraction. Verified against ai.google.dev, not guessed.
    'google:gemini-3.1-flash-lite': {
        provider: 'google',
        modelId: 'gemini-3.1-flash-lite',
        supportsVision: true,
    },
} as const satisfies Record<string, ModelDescriptor>;

export type ModelKey = keyof typeof MODEL_REGISTRY;

/** Used only if DEFAULT_MODEL_KEY is unset or not a real registry key — see getDefaultModelKey(). */
const FALLBACK_MODEL_KEY: ModelKey = 'google:gemini-3.1-flash-lite';

/**
 * The model used when nothing else is configured. Reads DEFAULT_MODEL_KEY
 * from .env on every call rather than caching it in a module-level constant —
 * a top-level `export const X = process.env.Y` here would be evaluated at
 * import time, before ConfigModule.forRoot() has loaded .env in this app's
 * module order (same issue that bit EMAIL_SYNC_CRON_EXPRESSION), so it would
 * silently always read as undefined regardless of what .env actually says.
 * Every call site (ExtractionService's constructor default param,
 * UsersService's getSettings/updateSettings) must call this function, not
 * reference a cached constant.
 */
export function getDefaultModelKey(): ModelKey {
    const configured = process.env.DEFAULT_MODEL_KEY;
    if (configured && configured in MODEL_REGISTRY) {
        return configured as ModelKey;
    }
    return FALLBACK_MODEL_KEY;
}

export function getModelDescriptor(key: ModelKey): ModelDescriptor {
    return MODEL_REGISTRY[key];
}

/**
 * Resolves a registry key to an actual AI SDK LanguageModel instance.
 * Each provider reads its own API key from its own env var by default, so
 * adding a provider here never touches the other providers' configuration.
 *
 * @param apiKeyOverride - A user-supplied (BYOK) key, already decrypted by
 *   the caller, to use in place of the app's shared env-var key for this one
 *   call. Never logged, never persisted here — the caller owns that.
 */
export function resolveModel(key: ModelKey, apiKeyOverride?: string): LanguageModel {
    const descriptor = MODEL_REGISTRY[key];

    switch (descriptor.provider) {
        case 'openrouter':
            return createOpenRouter({ apiKey: apiKeyOverride ?? process.env.OPENROUTER_API_KEY })(descriptor.modelId);
        case 'groq':
            return createGroq({ apiKey: apiKeyOverride ?? process.env.GROQ_API_KEY })(descriptor.modelId);
        case 'openai':
            return createOpenAI({ apiKey: apiKeyOverride ?? process.env.OPENAI_API_KEY })(descriptor.modelId);
        case 'anthropic':
            return createAnthropic({ apiKey: apiKeyOverride ?? process.env.ANTHROPIC_API_KEY })(descriptor.modelId);
        case 'google':
            return createGoogleGenerativeAI({ apiKey: apiKeyOverride ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY })(descriptor.modelId);
    }
}

// ── Processing mode ──────────────────────────────────────────────────────────

/**
 * How images and scanned PDF pages get read:
 *  - 'vision': sent as image content parts to a vision-capable model (the
 *    original behavior). Better on messy/handwritten/angled scans.
 *  - 'local-ocr': read locally via Tesseract before anything leaves the
 *    server, so the resulting text goes through the same PII-masking
 *    pipeline that already protects typed/pasted text. More private, weaker
 *    on messy scans — see OcrService and roadmap/phase4.md.
 */
export type ProcessingMode = 'vision' | 'local-ocr';

export const PROCESSING_MODES: readonly ProcessingMode[] = ['vision', 'local-ocr'];

export const DEFAULT_PROCESSING_MODE: ProcessingMode = 'vision';

export function isProcessingMode(value: unknown): value is ProcessingMode {
    return typeof value === 'string' && (PROCESSING_MODES as readonly string[]).includes(value);
}
