'use client';

import { useState } from 'react';
import { FileUploader } from '@/components/file-uploader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { IconUpload, IconX, IconTextCaption, IconCheck, IconBuildingFactory } from '@tabler/icons-react';
import {
    useExtractOrder,
    useOrders,
    useCatalog,
    useApproveOrder,
    useUpdateLineItemSku,
    type SavedPurchaseOrder,
    type SavedLineItem,
} from '@/features/orders/use-orders';

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
                {matched ? (
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
                {matched ? (
                    <span className="font-medium text-green-700 dark:text-green-400">{item.matchedSystemSku}</span>
                ) : (
                    <Select
                        disabled={updating || !catalog}
                        value={item.matchedSystemSku ?? ''}
                        onValueChange={(sku) => updateSku({ orderId: order.id, lineItemId: item.id, matchedSystemSku: sku })}
                    >
                        <SelectTrigger className="h-8 text-xs flex-1">
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
                )}
            </div>
        </div>
    );
}

function OrderCard({ order, catalog }: { order: SavedPurchaseOrder; catalog: { sku: string; name: string }[] | undefined }) {
    const { mutate: approve, isPending: approving } = useApproveOrder();

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base">PO {order.poNumber ?? '—'}</CardTitle>
                        <CardDescription className="text-xs">
                            {order.customerName ?? 'Unknown customer'} • {order.orderDate ?? 'No date'} • {order.currency} {order.totalAmount ?? '—'}
                        </CardDescription>
                    </div>
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
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
                    {order.lineItems.map((item) => (
                        <LineItemRow key={item.id} order={order} item={item} catalog={catalog} />
                    ))}
                </div>
                {order.status !== 'APPROVED' && (
                    <div className="flex justify-end pt-2">
                        <Button size="sm" onClick={() => approve(order.id)} disabled={approving}>
                            <IconCheck className="mr-1.5 h-4 w-4" />
                            {approving ? 'Pushing...' : 'Approve & Push to ERP'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function OrdersView() {
    const [files, setFiles] = useState<File[]>([]);
    const [pastedText, setPastedText] = useState('');
    const { mutateAsync: extractOrder, isPending: extracting } = useExtractOrder();
    const { data: orders, isLoading: ordersLoading } = useOrders();
    const { data: catalog, isLoading: catalogLoading } = useCatalog();

    const handleUploadFiles = async (filesToUpload: File[]) => {
        try {
            for (const file of filesToUpload) {
                await extractOrder({ file });
            }
            setFiles([]);
        } catch (error) {
            console.error(error);
        }
    };

    const handleTextExtract = async () => {
        if (!pastedText.trim()) return;
        try {
            await extractOrder({ text: pastedText });
            setPastedText('');
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="space-y-6 pb-10">
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

            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <IconBuildingFactory className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-xl font-semibold tracking-tight">Purchase Orders for Review</h3>
                </div>
                {ordersLoading || catalogLoading ? (
                    <p className="text-sm text-muted-foreground">Loading orders...</p>
                ) : !orders || orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No purchase orders yet. Upload or paste one to get started.</p>
                ) : (
                    <div className="space-y-4">
                        {orders.map((order) => (
                            <OrderCard key={order.id} order={order} catalog={catalog} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
