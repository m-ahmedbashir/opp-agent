'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';

export interface EmailAccount {
    id: string;
    email: string;
    provider: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    username: string;
    enabled: boolean;
    lastProcessedUid: number;
    lastSyncAt: string;
    lastSyncStatus: string;
    lastSyncError: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateEmailAccountDto {
    email: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    username: string;
    password: string;
}

export interface UpdateEmailAccountDto {
    email?: string;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
    username?: string;
    password?: string;
    enabled?: boolean;
}

function resolveUserId(userId: string | null | undefined) {
    return userId || (typeof window !== 'undefined' ? localStorage.getItem('userId') : null) || 'default-user';
}

export function useEmailAccounts() {
    const { userId } = useAuth();

    return useQuery<EmailAccount[]>({
        queryKey: ['emailAccounts', userId],
        queryFn: async () => {
            const currentUserId = resolveUserId(userId);
            const response = await fetch(`http://localhost:3001/email/accounts/${currentUserId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch email accounts: ${response.statusText}`);
            }
            return response.json();
        },
    });
}

export function useCreateEmailAccount() {
    const { userId } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (dto: CreateEmailAccountDto) => {
            const currentUserId = resolveUserId(userId);
            const response = await fetch(`http://localhost:3001/email/accounts/${currentUserId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dto),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || `Failed to connect email account: ${response.statusText}`);
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['emailAccounts', userId] });
            toast.success('Email account connected successfully.');
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to connect email account.');
        },
    });
}

export function useUpdateEmailAccount() {
    const { userId } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, dto }: { id: string; dto: UpdateEmailAccountDto }) => {
            const currentUserId = resolveUserId(userId);
            const response = await fetch(`http://localhost:3001/email/accounts/${currentUserId}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dto),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || `Failed to update email account: ${response.statusText}`);
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['emailAccounts', userId] });
            toast.success('Email account updated.');
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to update email account.');
        },
    });
}

export function useDeleteEmailAccount() {
    const { userId } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const currentUserId = resolveUserId(userId);
            const response = await fetch(`http://localhost:3001/email/accounts/${currentUserId}/${id}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                throw new Error(`Failed to delete email account: ${response.statusText}`);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['emailAccounts', userId] });
            toast.success('Email account disconnected.');
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to delete email account.');
        },
    });
}

export function useSyncEmailAccount() {
    const { userId } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const currentUserId = resolveUserId(userId);
            const response = await fetch(`http://localhost:3001/email/accounts/${currentUserId}/${id}/sync`, {
                method: 'POST',
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || `Failed to sync email account: ${response.statusText}`);
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['emailAccounts', userId] });
            queryClient.invalidateQueries({ queryKey: ['orders', userId] });
            toast.success('Email account synced. New orders will appear shortly.');
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to sync email account.');
        },
    });
}
