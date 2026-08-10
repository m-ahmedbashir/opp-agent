import { ProductCatalogService } from '../../catalog/catalog.service';

describe('ProductCatalogService', () => {
    let service: ProductCatalogService;

    beforeEach(() => {
        service = new ProductCatalogService();
    });

    it('returns the full catalog of 10 industrial products', () => {
        const catalog = service.getCatalog();
        expect(catalog).toHaveLength(10);
        expect(catalog.map((p) => p.sku)).toContain('PIPE-CS-4IN');
        expect(catalog.map((p) => p.sku)).toContain('PUMP-CENT-5HP');
    });

    it('matches an exact SKU mention with a very high score', () => {
        const result = service.matchSku('Customer requires PIPE-CS-4IN schedule 40');
        expect(result.matchedSku).toBe('PIPE-CS-4IN');
        expect(result.score).toBeGreaterThanOrEqual(0.95);
    });

    it('matches a description with strong keyword overlap', () => {
        const result = service.matchSku('Centrifugal pump 5 HP water system');
        expect(result.matchedSku).toBe('PUMP-CENT-5HP');
        expect(result.score).toBeGreaterThan(0.5);
    });

    it('matches a stainless steel pipe description to the SS pipe SKU', () => {
        const result = service.matchSku('Stainless steel pipe 2 inch schedule 10');
        expect(result.matchedSku).toBe('PIPE-SS-2IN');
    });

    it('returns a null SKU and zero score for unrelated text', () => {
        const result = service.matchSku('random unrelated description with no catalog terms');
        expect(result.matchedSku).toBeNull();
        expect(result.score).toBe(0);
    });

    it('handles empty input gracefully', () => {
        expect(service.matchSku('')).toEqual({ matchedSku: null, score: 0 });
        expect(service.matchSku(null as any)).toEqual({ matchedSku: null, score: 0 });
    });

    it('returns different scores for strong vs weak matches', () => {
        const strong = service.matchSku('Ball valve flanged 6 inch');
        const weak = service.matchSku('valve');
        expect(strong.matchedSku).toBe('VALVE-BV-6IN');
        expect(weak.matchedSku).toBeTruthy();
        expect(strong.score).toBeGreaterThan(weak.score);
    });
});
