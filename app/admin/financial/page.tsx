import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FinancialViewClient } from './FinancialViewClient';

export const metadata: Metadata = {
  title: 'Financial View | CIT Takshashila',
  description: 'Superadmin financial dashboard',
};

export default function FinancialViewPage() {
  return (
    <Suspense fallback={<div className="h-8 w-full animate-pulse rounded bg-zinc-800" />}>
      <FinancialViewClient />
    </Suspense>
  );
}
