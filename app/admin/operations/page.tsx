import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OperationsClient } from './OperationsClient';

export const metadata: Metadata = {
  title: 'Operations | CIT Takshashila',
  description: 'Core event operations view',
};

export default function OperationsPage() {
  return (
    <Suspense fallback={<div className="h-8 w-full animate-pulse rounded bg-zinc-800" />}>
      <OperationsClient />
    </Suspense>
  );
}
