import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { UnifiedViewClient } from './UnifiedViewClient';

export const metadata: Metadata = {
  title: 'Unified View | CIT Takshashila',
  description: 'Unified operations and pass management view',
};

export default function UnifiedAdminPage() {
  return (
    <Suspense fallback={<Skeleton className="h-24 w-full" />}>
      <UnifiedViewClient />
    </Suspense>
  );
}
