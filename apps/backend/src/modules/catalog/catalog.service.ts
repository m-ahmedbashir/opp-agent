import { Injectable } from '@nestjs/common';

export interface CatalogProduct {
    sku: string;
    name: string;
    keywords: string[];
}

export interface SkuMatchResult {
    matchedSku: string | null;
    score: number;
}

/**
 * In-memory mock product catalog for industrial supply items.
 *
 * Provides SKU matching via keyword overlap + cosine similarity over
 * term-frequency vectors built from the catalog item name and keywords.
 */
@Injectable()
export class ProductCatalogService {
    private readonly catalog: CatalogProduct[] = [
        { sku: 'PIPE-CS-4IN', name: 'Carbon Steel Pipe 4 Inch Sch 40', keywords: ['pipe', 'carbon', 'steel', '4 inch', 'schedule 40', 'cs'] },
        { sku: 'PIPE-SS-2IN', name: 'Stainless Steel Pipe 2 Inch Sch 10', keywords: ['pipe', 'stainless', 'steel', '2 inch', 'schedule 10', 'ss'] },
        { sku: 'VALVE-BV-6IN', name: 'Ball Valve 6 Inch Flanged', keywords: ['valve', 'ball', 'flanged', '6 inch', 'bv'] },
        { sku: 'VALVE-GV-3IN', name: 'Gate Valve 3 Inch Threaded', keywords: ['valve', 'gate', 'threaded', '3 inch', 'gv'] },
        { sku: 'PUMP-CENT-5HP', name: 'Centrifugal Pump 5 HP', keywords: ['pump', 'centrifugal', '5 hp', 'motor', 'water'] },
        { sku: 'PUMP-SUB-2HP', name: 'Submersible Pump 2 HP', keywords: ['pump', 'submersible', '2 hp', 'well', 'water'] },
        { sku: 'FAST-BOLT-M12', name: 'Hex Bolt M12 Zinc Plated', keywords: ['bolt', 'fastener', 'm12', 'hex', 'zinc'] },
        { sku: 'FAST-NUT-M12', name: 'Hex Nut M12 Zinc Plated', keywords: ['nut', 'fastener', 'm12', 'hex', 'zinc'] },
        { sku: 'FLANGE-CS-4IN', name: 'Carbon Steel Weld Neck Flange 4 Inch', keywords: ['flange', 'weld neck', 'carbon', 'steel', '4 inch'] },
        { sku: 'GASKET-4IN-150', name: '4 Inch 150 LB Gasket', keywords: ['gasket', '4 inch', '150 lb', 'seal', 'flange'] },
    ];

    /** Returns the full catalog — used by the frontend SKU override dropdown. */
    getCatalog(): CatalogProduct[] {
        return this.catalog;
    }

    /**
     * Matches a raw line-item description to the best catalog SKU.
     *
     * Combines cosine similarity over term-frequency vectors with a small boost
     * for exact SKU mentions. Returns null SKU and score 0 when no meaningful
     * overlap is found.
     */
    matchSku(rawDescription: string): SkuMatchResult {
        if (!rawDescription || typeof rawDescription !== 'string') {
            return { matchedSku: null, score: 0 };
        }

        const inputTokens = this.tokenize(rawDescription);
        if (inputTokens.length === 0) {
            return { matchedSku: null, score: 0 };
        }

        const inputVector = this.termFrequencyVector(inputTokens);
        const inputNorm = this.vectorNorm(inputVector);

        if (inputNorm === 0) {
            return { matchedSku: null, score: 0 };
        }

        let bestMatch: SkuMatchResult = { matchedSku: null, score: 0 };

        for (const product of this.catalog) {
            const candidateText = `${product.name} ${product.keywords.join(' ')} ${product.sku}`;
            const candidateTokens = this.tokenize(candidateText);
            const candidateVector = this.termFrequencyVector(candidateTokens);
            const candidateNorm = this.vectorNorm(candidateVector);

            if (candidateNorm === 0) continue;

            const cosine = this.dotProduct(inputVector, candidateVector) / (inputNorm * candidateNorm);
            // Clamp to [0, 1] and round to avoid tiny floating-point noise.
            let score = Math.max(0, Math.min(1, cosine));

            // Boost exact SKU mentions (e.g. "PIPE-CS-4IN") so customer SKUs align.
            if (this.descriptionIncludesSku(rawDescription, product.sku)) {
                score = Math.max(score, 0.95);
            }

            if (score > bestMatch.score) {
                bestMatch = { matchedSku: product.sku, score };
            }
        }

        return bestMatch;
    }

    private descriptionIncludesSku(text: string, sku: string): boolean {
        const normalizedText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedSku = sku.toLowerCase().replace(/[^a-z0-9]/g, '');
        return text.toLowerCase().includes(sku.toLowerCase()) || normalizedText.includes(normalizedSku);
    }

    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((token) => token.length > 1);
    }

    private termFrequencyVector(tokens: string[]): Record<string, number> {
        const vector: Record<string, number> = {};
        for (const token of tokens) {
            vector[token] = (vector[token] ?? 0) + 1;
        }
        return vector;
    }

    private dotProduct(a: Record<string, number>, b: Record<string, number>): number {
        let sum = 0;
        for (const term of Object.keys(a)) {
            if (b[term]) {
                sum += a[term] * b[term];
            }
        }
        return sum;
    }

    private vectorNorm(vector: Record<string, number>): number {
        let sum = 0;
        for (const value of Object.values(vector)) {
            sum += value * value;
        }
        return Math.sqrt(sum);
    }

}
