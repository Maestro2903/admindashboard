'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminRole } from '@/types/admin';
import {
  IconSettings2,
  IconScan,
  IconTicket,
  IconUsersGroup,
  IconUsers,
  IconLogout,
  IconClipboardList,
} from '@tabler/icons-react';

export interface SidebarNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  superadminOnly?: boolean;
}

const NAV_ITEMS: SidebarNavItem[] = [
  { href: '/admin/operations', label: 'Operations', icon: IconSettings2 },
  { href: '/admin/live-checkin', label: 'Live Check-In', icon: IconScan },
  { href: '/admin/passes', label: 'Passes', icon: IconTicket },
  { href: '/admin/teams', label: 'Teams', icon: IconUsersGroup },
  { href: '/admin/users', label: 'Users', icon: IconUsers },
  // Registrations: visible only to editors (manager) and superadmins in the sidebar;
  // route itself is additionally protected in AdminPanelShell.
  { href: '/admin/registrations', label: 'Registrations', icon: IconClipboardList, superadminOnly: true },
];

const MAIN_SITE_URL = process.env.NEXT_PUBLIC_MAIN_SITE_URL || 'https://takshashila26.in';

export function AppSidebar({
  adminRole,
  onSignOut,
}: {
  adminRole?: AdminRole | string;
  onSignOut?: () => void;
}) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.superadminOnly) return true;
    // Treat "manager" as editor role; both manager and superadmin can see registrations.
    return adminRole === 'superadmin' || adminRole === 'manager';
  });

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-[220px] flex-col border-r border-zinc-800 bg-[#0a0a0c]">
      {/* Brand */}
      <div className="flex h-14 items-center border-b border-zinc-800 px-5">
        <Link href="/admin/operations" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-white flex items-center justify-center">
            <span className="text-xs font-bold text-zinc-900">T</span>
          </div>
          <span className="text-sm font-semibold text-white tracking-tight">Takshashila</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {visibleItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname?.startsWith(href) ?? false;

            return (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800 p-3 space-y-2">
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {adminRole === 'superadmin' ? 'Superadmin' : adminRole === 'viewer' ? 'Viewer' : 'Admin'}
          </span>
          <a
            href={MAIN_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Site
          </a>
        </div>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-all duration-150"
          >
            <IconLogout size={18} className="text-zinc-500" />
            Sign Out
          </button>
        )}
      </div>
    </aside>
  );
}
