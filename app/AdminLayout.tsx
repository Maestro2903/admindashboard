'use client';

import { usePathname } from 'next/navigation';
import { AdminPanelShell } from './components/AdminPanelShell';

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/signin') {
    return <>{children}</>;
  }
  return <AdminPanelShell>{children}</AdminPanelShell>;
}
