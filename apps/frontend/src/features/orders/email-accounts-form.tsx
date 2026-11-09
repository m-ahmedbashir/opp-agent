'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
    useEmailAccounts,
    useCreateEmailAccount,
    useUpdateEmailAccount,
    useDeleteEmailAccount,
    useSyncEmailAccount,
    type EmailAccount,
    type CreateEmailAccountDto,
} from '@/features/orders/use-email-accounts';
import { IconMailPlus, IconTrash, IconRefresh, IconMailCheck, IconMail } from '@tabler/icons-react';
import { Loader2 } from 'lucide-react';

const DEFAULT_IMAP_HOSTS: Record<string, string> = {
    gmail: 'imap.gmail.com',
    outlook: 'outlook.office365.com',
    yahoo: 'imap.mail.yahoo.com',
};

export function EmailAccountsForm() {
    const { data: accounts, isLoading } = useEmailAccounts();
    const { mutate: createAccount, isPending: isCreating } = useCreateEmailAccount();
    const { mutate: updateAccount, isPending: isUpdating } = useUpdateEmailAccount();
    const { mutate: deleteAccount, isPending: isDeleting } = useDeleteEmailAccount();
    const { mutate: syncAccount, isPending: isSyncing } = useSyncEmailAccount();

    const [isAdding, setIsAdding] = useState(false);
    const [form, setForm] = useState<CreateEmailAccountDto>({
        email: '',
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        imapSecure: true,
        username: '',
        password: '',
    });

    const handleEmailChange = (value: string) => {
        const lower = value.toLowerCase();
        const provider = lower.includes('@gmail.com')
            ? 'gmail'
            : lower.includes('@outlook.com') || lower.includes('@hotmail.com') || lower.includes('@live.com')
            ? 'outlook'
            : lower.includes('@yahoo.com')
            ? 'yahoo'
            : null;

        setForm((prev) => ({
            ...prev,
            email: value,
            imapHost: provider ? DEFAULT_IMAP_HOSTS[provider] : prev.imapHost,
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createAccount(form, {
            onSuccess: () => {
                setIsAdding(false);
                setForm({
                    email: '',
                    imapHost: 'imap.gmail.com',
                    imapPort: 993,
                    imapSecure: true,
                    username: '',
                    password: '',
                });
            },
        });
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Email Ingestion</CardTitle>
                        <CardDescription>
                            Connect an IMAP inbox to automatically import purchase order emails.
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setIsAdding(true)} disabled={isAdding}>
                        <IconMailPlus className="mr-1.5 h-4 w-4" />
                        Connect Email
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {isAdding && (
                    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="procurement@company.com"
                                value={form.email}
                                onChange={(e) => handleEmailChange(e.target.value)}
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="imapHost">IMAP Host</Label>
                                <Input
                                    id="imapHost"
                                    placeholder="imap.gmail.com"
                                    value={form.imapHost}
                                    onChange={(e) => setForm((prev) => ({ ...prev, imapHost: e.target.value }))}
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="imapPort">IMAP Port</Label>
                                <Input
                                    id="imapPort"
                                    type="number"
                                    value={form.imapPort}
                                    onChange={(e) => setForm((prev) => ({ ...prev, imapPort: parseInt(e.target.value, 10) || 0 }))}
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="username">IMAP Username</Label>
                                <Input
                                    id="username"
                                    placeholder="procurement@company.com"
                                    value={form.username}
                                    onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password">IMAP Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={form.password}
                                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Switch
                                id="imapSecure"
                                checked={form.imapSecure}
                                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, imapSecure: checked }))}
                            />
                            <Label htmlFor="imapSecure" className="cursor-pointer">
                                Use TLS/SSL
                            </Label>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setIsAdding(false)} disabled={isCreating}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isCreating}>
                                {isCreating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <IconMailCheck className="mr-1.5 h-4 w-4" />}
                                {isCreating ? 'Testing connection...' : 'Connect & Save'}
                            </Button>
                        </div>
                    </form>
                )}

                {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading email accounts...</p>
                ) : !accounts || accounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No email accounts connected. Add one to start importing orders.</p>
                ) : (
                    <div className="space-y-3">
                        {accounts.map((account) => (
                            <EmailAccountRow
                                key={account.id}
                                account={account}
                                onToggle={(enabled) => updateAccount({ id: account.id, dto: { enabled } })}
                                onDelete={() => deleteAccount(account.id)}
                                onSync={() => syncAccount(account.id)}
                                isUpdating={isUpdating}
                                isDeleting={isDeleting}
                                isSyncing={isSyncing}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function EmailAccountRow({
    account,
    onToggle,
    onDelete,
    onSync,
    isUpdating,
    isDeleting,
    isSyncing,
}: {
    account: EmailAccount;
    onToggle: (enabled: boolean) => void;
    onDelete: () => void;
    onSync: () => void;
    isUpdating: boolean;
    isDeleting: boolean;
    isSyncing: boolean;
}) {
    const statusColor =
        account.lastSyncStatus === 'OK'
            ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
            : account.lastSyncStatus === 'ERROR'
            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400';

    return (
        <div className="flex items-start justify-between rounded-lg border p-4">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <IconMail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{account.email}</span>
                    <Badge variant="outline" className={statusColor}>
                        {account.lastSyncStatus}
                    </Badge>
                    {!account.enabled && <Badge variant="secondary">Disabled</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                    {account.imapHost}:{account.imapPort} • {account.imapSecure ? 'TLS' : 'No TLS'} • User {account.username}
                </p>
                <p className="text-xs text-muted-foreground">
                    Last sync: {account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString() : 'Never'}
                    {account.lastSyncError ? ` • Error: ${account.lastSyncError}` : ''}
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Switch
                    checked={account.enabled}
                    onCheckedChange={onToggle}
                    disabled={isUpdating}
                />
                <Button variant="outline" size="icon" onClick={onSync} disabled={isSyncing || !account.enabled} title="Sync now">
                    {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <IconRefresh className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={onDelete} disabled={isDeleting} title="Disconnect">
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <IconTrash className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    );
}
