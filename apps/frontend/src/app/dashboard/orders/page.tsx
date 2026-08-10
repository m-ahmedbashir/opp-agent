import PageContainer from '@/components/layout/page-container';
import { OrdersView } from './orders-view';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Dashboard: Purchase Orders'
};

export default function OrdersPage() {
    return (
        <PageContainer
            scrollable
            pageTitle="Purchase Orders"
            pageDescription="Upload, review, and approve purchase orders with automatic SKU matching."
        >
            <div className="mx-auto w-full max-w-5xl py-4">
                <OrdersView />
            </div>
        </PageContainer>
    );
}
