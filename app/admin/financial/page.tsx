import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { FinancialViewClient } from './FinancialViewClient';

export const metadata: Metadata = {
  title: 'Financial View | CIT Takshashila',
  description: 'Superadmin financial dashboard',
};

export default function FinancialViewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-24 w-full" />}>
      <FinancialViewClient />
    </Suspense>
  );
}
