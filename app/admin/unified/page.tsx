import type { Metadata } from 'next';
import { Suspense } from 'react';
import { UnifiedViewClient } from './UnifiedViewClient';

export const metadata: Metadata = {
  title: 'Unified View | CIT Takshashila',
  description: 'Unified operations and pass management view',
};

export default function UnifiedAdminPage() {
  return (
    <Suspense fallback={<div className="h-8 w-full animate-pulse rounded bg-zinc-800" />}>
      <UnifiedViewClient />
    </Suspense>
  );
}
