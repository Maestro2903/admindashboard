import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { OperationsClient } from './OperationsClient';

export const metadata: Metadata = {
  title: 'Operations | CIT Takshashila',
  description: 'Core event operations view',
};

export default function OperationsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-24 w-full" />}>
      <OperationsClient />
    </Suspense>
  );
}
