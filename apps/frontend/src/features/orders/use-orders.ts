'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';

export interface ExtractOrderVariables {
    file?: File;
    text?: string;
    /** Per-request override of the user's saved model preference — omit to use their Settings default. */
    modelKey?: string;
}

export interface ExtractOrderResult {
    extraction: {
        originalFileName: string;
        mimeType: string;
        avgConfidence: number;
        documentType: string;
    };
    savedOrder: SavedPurchaseOrder;
}

export interface SavedPurchaseOrder {
    id: string;
    poNumber: string | null;
    orderDate: string | null;
    customerName: string | null;
    customerEmail: string | null;
    shippingAddress: string | null;
    currency: string | null;
    totalAmount: number | null;
    status: string;
    avgConfidence: number | null;
    lineItems: SavedLineItem[];
    createdAt: string;
    updatedAt: string;
}

export interface SavedLineItem {
    id: string;
    lineNumber: number;
    rawDescription: string;
    customerSku: string | null;
    matchedSystemSku: string | null;
    skuMatchScore: number;
    /** "auto" = catalog algorithm matched it, "manual" = the user picked it via the override dropdown. */
    skuMatchSource: 'auto' | 'manual';
    quantity: number;
    unitPrice: number | null;
    totalAmount: number | null;
}

function resolveUserId(userId: string | null | undefined) {
    return userId || (typeof window !== 'undefined' ? localStorage.getItem('userId') : null) || 'default-user';
}

async function extractOrderRequest(variables: ExtractOrderVariables, userId: string): Promise<ExtractOrderResult> {
    const { file, text, modelKey } = variables;
    const formData = new FormData();
    if (file) formData.append('file', file);
    if (text) formData.append('text', text);
    if (modelKey) formData.append('modelKey', modelKey);
    formData.append('userId', userId);

    const response = await fetch('http://localhost:3001/orders/extract', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        let message = `Server responded with ${response.status}`;
        try {
            const data = await response.json();
            if (data && data.message) message = data.message;
        } catch (_) {
            // ignore
        }
        throw new Error(message);
    }

    return response.json();
}

export function useExtractOrder() {
    const { userId } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (variables: ExtractOrderVariables) => {
            const currentUserId = resolveUserId(userId);
            return extractOrderRequest(variables, currentUserId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders', userId] });
            toast.success('Purchase order extracted and saved for review.');
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to extract purchase order.');
        },
    });
}

export function useOrders() {
    const { userId } = useAuth();

    return useQuery<SavedPurchaseOrder[]>({
        queryKey: ['orders', userId],
        queryFn: async () => {
            const currentUserId = resolveUserId(userId);
            const response = await fetch(`http://localhost:3001/orders/user/${currentUserId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch orders: ${response.statusText}`);
            }
            return response.json();
        },
    });
}

export function useCatalog() {
    return useQuery<{ sku: string; name: string }[]>({
        queryKey: ['catalog'],
        queryFn: async () => {
            const response = await fetch('http://localhost:3001/catalog');
            if (!response.ok) {
                throw new Error(`Failed to fetch catalog: ${response.statusText}`);
            }
            return response.json();
        },
    });
}

export function useApproveOrder() {
    const { userId } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (orderId: string) => {
            const response = await fetch(`http://localhost:3001/orders/${orderId}/approve`, {
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error(`Failed to approve order: ${response.statusText}`);
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders', userId] });
            toast.success('Purchase order approved and pushed to ERP.');
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to approve purchase order.');
        },
    });
}

export function useUpdateLineItemSku() {
    const { userId } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ orderId, lineItemId, matchedSystemSku }: { orderId: string; lineItemId: string; matchedSystemSku: string }) => {
            const response = await fetch(`http://localhost:3001/orders/${orderId}/line-items/${lineItemId}/sku`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matchedSystemSku }),
            });
            if (!response.ok) {
                throw new Error(`Failed to update line item SKU: ${response.statusText}`);
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders', userId] });
            toast.success('Line item SKU updated.');
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to update line item SKU.');
        },
    });
}
