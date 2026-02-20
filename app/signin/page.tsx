'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/AuthContext';

export default function SignInPage() {
  const { user, userData, loading, signIn } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || loading) return;
    if (user && userData?.isOrganizer) {
      router.replace('/');
      return;
    }
  }, [mounted, loading, user, userData, router]);

  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
          <p className="text-sm text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (user && !userData?.isOrganizer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#09090b] p-6">
        <div className="h-12 w-12 rounded-xl bg-red-500/10 flex items-center justify-center">
          <span className="text-red-400 text-xl">!</span>
        </div>
        <h1 className="text-xl font-semibold text-white">Access Denied</h1>
        <p className="text-center text-zinc-400 max-w-sm">
          You must be an organizer to access the control panel.
        </p>
        <a
          href={process.env.NEXT_PUBLIC_MAIN_SITE_URL || 'https://takshashila26.in'}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Back to main site
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#09090b] p-6">
      <div className="text-center space-y-3">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-white flex items-center justify-center mb-4">
          <span className="text-xl font-bold text-zinc-900">T</span>
        </div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Control Panel</h1>
        <p className="text-sm text-zinc-500">Sign in with your organizer account</p>
      </div>
      <button
        onClick={() => signIn()}
        className="rounded-xl bg-white px-8 py-3 text-sm font-medium text-zinc-900 transition-all hover:bg-zinc-200 active:scale-95"
      >
        Sign in with Google
      </button>
      <p className="text-xs text-zinc-600">CIT Takshashila Event Operations</p>
    </div>
  );
}
