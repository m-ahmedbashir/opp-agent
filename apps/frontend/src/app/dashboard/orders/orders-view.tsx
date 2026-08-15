'use client';

import { useState } from 'react';
import { FileUploader } from '@/components/file-uploader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { IconUpload, IconX, IconTextCaption, IconCheck, IconBuildingFactory, IconInbox, IconHistory, IconSettings } from '@tabler/icons-react';
import {
    useExtractOrder,
    useOrders,
    useCatalog,
    useApproveOrder,
    useUpdateLineItemSku,
    type SavedPurchaseOrder,
    type SavedLineItem,
} from '@/features/orders/use-orders';
import { EmailAccountsForm } from '@/features/orders/email-accounts-form';
import { useModelOptions } from '@/features/extraction-settings/hooks/useModelOptions';
import { Label } from '@/components/ui/label';

function ConfidenceBadge({ score }: { score: number | null | undefined }) {
    if (score === null || score === undefined) return null;
    const pct = Math.round(score * 100);
    if (score >= 0.8) {
        return <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">{pct}% confidence</Badge>;
    }
    if (score >= 0.6) {
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400">{pct}% confidence</Badge>;
    }
    return <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">{pct}% confidence</Badge>;
}

function LineItemRow({
    order,
    item,
    catalog,
}: {
    order: SavedPurchaseOrder;
    item: SavedLineItem;
    catalog: { sku: string; name: string }[] | undefined;
}) {
    const { mutate: updateSku, isPending: updating } = useUpdateLineItemSku();
    const matched = item.skuMatchScore >= 0.8;

    return (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between">
                <span className="font-semibold">Line {item.lineNumber}</span>
                {item.skuMatchSource === 'manual' ? (
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 hover:bg-blue-100">Manually set</Badge>
                ) : matched ? (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 hover:bg-green-100">Auto-matched SKU</Badge>
                ) : (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 hover:bg-yellow-100">Review needed</Badge>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Description:</span>
                <span className="text-foreground font-medium text-right">{item.rawDescription}</span>
                <span>Quantity:</span>
                <span className="text-foreground font-medium text-right">{item.quantity}</span>
                <span>Unit price:</span>
                <span className="text-foreground font-medium text-right">{item.unitPrice ?? '—'}</span>
                <span>Line total:</span>
                <span className="text-foreground font-medium text-right">{item.totalAmount ?? '—'}</span>
                <span>Match score:</span>
                <span className="text-foreground font-medium text-right">{Math.round(item.skuMatchScore * 100)}%</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">System SKU:</span>
                {/* Always editable, even on a high-confidence match — auto-matching
                    can be confidently wrong, so the user needs a way to correct it,
                    not just accept it when the score happens to clear the threshold. */}
                <Select
                    disabled={updating || !catalog}
                    value={item.matchedSystemSku ?? ''}
                    onValueChange={(sku) => updateSku({ orderId: order.id, lineItemId: item.id, matchedSystemSku: sku })}
                >
                    <SelectTrigger className={`h-8 text-xs flex-1 ${item.skuMatchSource === 'manual' ? 'text-blue-700 dark:text-blue-400' : matched ? 'text-green-700 dark:text-green-400' : ''}`}>
                        <SelectValue placeholder="Select matching SKU..." />
                    </SelectTrigger>
                    <SelectContent>
                        {catalog?.map((product) => (
                            <SelectItem key={product.sku} value={product.sku} className="text-xs">
                                {product.sku} — {product.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

/** Detail view for a single order — opened in a Sheet when its table row is clicked. */
function OrderDetailSheet({
    order,
    catalog,
    onOpenChange,
}: {
    order: SavedPurchaseOrder | null;
    catalog: { sku: string; name: string }[] | undefined;
    onOpenChange: (open: boolean) => void;
}) {
    const { mutate: approve, isPending: approving } = useApproveOrder();

    return (
        <Sheet open={order !== null} onOpenChange={onOpenChange}>
            <SheetContent className="w-full gap-0 sm:max-w-xl">
                {order && (
                    <>
                        <SheetHeader>
                            <div className="flex items-center justify-between pr-8">
                                <SheetTitle>PO {order.poNumber ?? '—'}</SheetTitle>
                                <div className="flex items-center gap-2">
                                    <ConfidenceBadge score={order.avgConfidence} />
                                    <Badge
                                        variant={order.status === 'APPROVED' ? 'default' : 'outline'}
                                        className={order.status === 'APPROVED' ? 'bg-green-600' : ''}
                                    >
                                        {order.status}
                                    </Badge>
                                </div>
                            </div>
                            <SheetDescription>
                                {order.customerName ?? 'Unknown customer'} • {order.orderDate ?? 'No date'} • {order.currency} {order.totalAmount ?? '—'}
                            </SheetDescription>
                        </SheetHeader>
                        <div className="flex-1 space-y-3 overflow-y-auto px-4">
                            {order.lineItems.map((item) => (
                                <LineItemRow key={item.id} order={order} item={item} catalog={catalog} />
                            ))}
                        </div>
                        {order.status !== 'APPROVED' && (
                            <SheetFooter>
                                <Button onClick={() => approve(order.id)} disabled={approving}>
                                    <IconCheck className="mr-1.5 h-4 w-4" />
                                    {approving ? 'Pushing...' : 'Approve & Push to ERP'}
                                </Button>
                            </SheetFooter>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

function OrdersTable({
    orders,
    catalog,
    loading,
    emptyMessage,
}: {
    orders: SavedPurchaseOrder[] | undefined;
    catalog: { sku: string; name: string }[] | undefined;
    loading: boolean;
    emptyMessage: string;
}) {
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    // Look up by ID (not a stored object reference) so the sheet reflects
    // fresh data after a mutation (approve, SKU update) invalidates `orders`.
    const selectedOrder = orders?.find((order) => order.id === selectedOrderId) ?? null;

    if (loading) {
        return <p className="text-sm text-muted-foreground">Loading orders...</p>;
    }
    if (!orders || orders.length === 0) {
        return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
    }

    return (
        <>
            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>PO Number</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Confidence</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((order) => (
                            <TableRow key={order.id} className="cursor-pointer" onClick={() => setSelectedOrderId(order.id)}>
                                <TableCell className="font-medium">{order.poNumber ?? '—'}</TableCell>
                                <TableCell>{order.customerName ?? 'Unknown customer'}</TableCell>
                                <TableCell>{order.orderDate ?? '—'}</TableCell>
                                <TableCell>{order.currency} {order.totalAmount ?? '—'}</TableCell>
                                <TableCell><ConfidenceBadge score={order.avgConfidence} /></TableCell>
                                <TableCell>
                                    <Badge
                                        variant={order.status === 'APPROVED' ? 'default' : 'outline'}
                                        className={order.status === 'APPROVED' ? 'bg-green-600' : ''}
                                    >
                                        {order.status}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <OrderDetailSheet
                order={selectedOrder}
                catalog={catalog}
                onOpenChange={(open) => { if (!open) setSelectedOrderId(null); }}
            />
        </>
    );
}

export function OrdersView() {
    const [files, setFiles] = useState<File[]>([]);
    const [pastedText, setPastedText] = useState('');
    const [modelKey, setModelKey] = useState<string>('');
    const { mutateAsync: extractOrder, isPending: extracting } = useExtractOrder();
    const { data: orders, isLoading: ordersLoading } = useOrders();
    const { data: catalog, isLoading: catalogLoading } = useCatalog();
    const { models, loading: modelsLoading } = useModelOptions();

    const reviewOrders = orders?.filter((order) => order.status !== 'APPROVED');
    const historyOrders = orders?.filter((order) => order.status === 'APPROVED');

    const handleUploadFiles = async (filesToUpload: File[]) => {
        try {
            for (const file of filesToUpload) {
                await extractOrder({ file, modelKey: modelKey || undefined });
            }
            setFiles([]);
        } catch (error) {
            console.error(error);
        }
    };

    const handleTextExtract = async () => {
        if (!pastedText.trim()) return;
        try {
            await extractOrder({ text: pastedText, modelKey: modelKey || undefined });
            setPastedText('');
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="pb-10">
            <Tabs defaultValue="intake" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="intake">
                        <IconUpload className="mr-1.5 h-4 w-4" />
                        Intake
                    </TabsTrigger>
                    <TabsTrigger value="review">
                        <IconInbox className="mr-1.5 h-4 w-4" />
                        Review Queue
                        {reviewOrders && reviewOrders.length > 0 && (
                            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{reviewOrders.length}</Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="history">
                        <IconHistory className="mr-1.5 h-4 w-4" />
                        History
                    </TabsTrigger>
                    <TabsTrigger value="settings">
                        <IconSettings className="mr-1.5 h-4 w-4" />
                        Settings
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="intake" className="mt-6 space-y-6">
                    <div className="flex items-center gap-3">
                        <Label htmlFor="model-select" className="text-sm text-muted-foreground shrink-0">
                            Extraction model
                        </Label>
                        <Select value={modelKey || '__default__'} onValueChange={(value) => setModelKey(value === '__default__' ? '' : value)}>
                            <SelectTrigger id="model-select" className="h-8 w-auto min-w-[220px] text-xs" disabled={modelsLoading}>
                                <SelectValue placeholder="Use my default (Settings)" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__default__" className="text-xs">Use my default (Settings)</SelectItem>
                                {models.map((model) => (
                                    <SelectItem key={model.key} value={model.key} className="text-xs">
                                        {model.key} {model.supportsVision ? '' : '(text only)'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Tabs defaultValue="file" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="file">File Upload</TabsTrigger>
                            <TabsTrigger value="text">Paste Text</TabsTrigger>
                        </TabsList>
                        <TabsContent value="file" className="mt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Upload Purchase Order</CardTitle>
                                    <CardDescription>Drag and drop or select a PO file (PDF, image, CSV, text, JSON).</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <FileUploader
                                        value={files}
                                        onValueChange={setFiles}
                                        accept={{
                                            'application/pdf': ['.pdf'],
                                            'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
                                            'text/plain': ['.txt'],
                                            'text/csv': ['.csv'],
                                            'application/json': ['.json'],
                                        }}
                                        maxFiles={5}
                                        maxSize={10 * 1024 * 1024}
                                        disabled={extracting}
                                    />
                                    {files.length > 0 && (
                                        <div className="flex items-center justify-end gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => setFiles([])} disabled={extracting} className="h-8 gap-1 px-3 text-xs">
                                                <IconX className="h-3.5 w-3.5" />
                                                Clear files
                                            </Button>
                                            <Button size="sm" onClick={() => handleUploadFiles(files)} disabled={extracting} className="h-8 px-4 text-xs">
                                                {extracting ? 'Processing...' : (
                                                    <>
                                                        <IconUpload className="mr-1.5 h-3.5 w-3.5" />
                                                        Extract PO Data
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="text" className="mt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Paste Purchase Order Content</CardTitle>
                                    <CardDescription>Copy and paste raw PO text, JSON, or CSV blocks here.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <Textarea
                                        placeholder="Paste your purchase order text here..."
                                        className="min-h-[250px] resize-none font-mono text-sm shadow-sm"
                                        value={pastedText}
                                        onChange={(e) => setPastedText(e.target.value)}
                                        disabled={extracting}
                                    />
                                    {pastedText.trim().length > 0 && (
                                        <div className="flex items-center justify-end gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => setPastedText('')} disabled={extracting} className="h-8 gap-1 px-3 text-xs">
                                                <IconX className="h-3.5 w-3.5" />
                                                Clear text
                                            </Button>
                                            <Button size="sm" onClick={handleTextExtract} disabled={extracting} className="h-8 px-4 text-xs">
                                                {extracting ? 'Processing...' : (
                                                    <>
                                                        <IconTextCaption className="mr-1.5 h-3.5 w-3.5" />
                                                        Extract PO Data
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </TabsContent>

                <TabsContent value="review" className="mt-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <IconBuildingFactory className="h-5 w-5 text-muted-foreground" />
                        <h3 className="text-xl font-semibold tracking-tight">Purchase Orders for Review</h3>
                    </div>
                    <OrdersTable
                        orders={reviewOrders}
                        catalog={catalog}
                        loading={ordersLoading || catalogLoading}
                        emptyMessage="No purchase orders awaiting review. Upload or paste one to get started."
                    />
                </TabsContent>

                <TabsContent value="history" className="mt-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <IconHistory className="h-5 w-5 text-muted-foreground" />
                        <h3 className="text-xl font-semibold tracking-tight">Approved Orders</h3>
                    </div>
                    <OrdersTable
                        orders={historyOrders}
                        catalog={catalog}
                        loading={ordersLoading || catalogLoading}
                        emptyMessage="No approved orders yet."
                    />
                </TabsContent>

                <TabsContent value="settings" className="mt-6">
                    <EmailAccountsForm />
                </TabsContent>
            </Tabs>
        </div>
    );
}
