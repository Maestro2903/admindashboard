'use client';

import { useCallback } from 'react';
import { redirect } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { AppSidebar } from '@/components/admin/AppSidebar';
import { useMeRole } from '@/hooks/use-me-role';

export function AdminPanelShell({ children }: { children: React.ReactNode }) {
  const { user, userData, loading, signOut } = useAuth();
  const router = useRouter();
  const hasAccess = !loading && Boolean(user) && Boolean(userData?.isOrganizer);

  // Redirect unauthenticated users during render (no useEffect needed)
  if (!loading && (!user || !userData?.isOrganizer)) {
    redirect('/signin');
  }

  const onUnauthorized = useCallback(() => {
    router.replace('/signin');
  }, [router]);

  // Fetch adminRole via custom hook (no fetch-in-useEffect in component body)
  const fetchedRole = useMeRole({ user, hasAccess, signOut, onUnauthorized });

  // Merge fetched role with userData role (userData is the fastest source on first render)
  const adminRole = fetchedRole ?? userData?.adminRole;

  if (!hasAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
          <p className="text-sm text-zinc-500">Checking access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <AppSidebar adminRole={adminRole} onSignOut={signOut} />
      <main className="min-h-screen min-w-0 flex-1 overflow-x-hidden px-6 py-6 lg:px-8 ml-[220px]">
        {children}
      </main>
    </div>
  );
}
