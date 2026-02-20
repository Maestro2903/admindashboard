'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { AppSidebar } from '@/components/admin/AppSidebar';

export function AdminPanelShell({ children }: { children: React.ReactNode }) {
  const { user, userData, loading, signOut } = useAuth();
  const router = useRouter();
  const hasAccess = !loading && Boolean(user) && Boolean(userData?.isOrganizer);
  const [adminRole, setAdminRole] = useState<string | undefined>(userData?.adminRole);

  useEffect(() => {
    if (loading) return;
    if (!user || !userData?.isOrganizer) {
      router.replace('/signin');
    }
  }, [loading, user, userData, router]);

  useEffect(() => {
    if (!hasAccess || !user) return;
    let cancelled = false;
    user.getIdToken().then((idToken) => {
      if (cancelled) return;
      fetch('/api/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      })
        .then((res) => {
          if (!cancelled && !res.ok) {
            router.replace('/signin');
            return;
          }
          return res.json();
        })
        .then((data) => {
          if (!cancelled && data?.adminRole) {
            setAdminRole(data.adminRole);
          }
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [hasAccess, user, router]);

  useEffect(() => {
    if (userData?.adminRole) {
      setAdminRole(userData.adminRole);
    }
  }, [userData?.adminRole]);

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
