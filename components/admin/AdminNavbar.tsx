'use client';

import Link from 'next/link';
import type { AdminNavItem } from './AdminSidebar';

const MAIN_SITE_URL = process.env.NEXT_PUBLIC_MAIN_SITE_URL || 'https://takshashila26.in';

export function AdminNavbar({
  items,
  activePath,
  adminRole,
}: {
  items: readonly AdminNavItem[];
  activePath: string | null;
  adminRole?: string;
}) {
  return (
    <nav className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-8">
        <Link href="/" className="font-semibold text-slate-900">
          Admin
        </Link>
        <div className="flex items-center gap-6 text-sm h-full">
          {items.map(({ href, label }) => {
            const isActive = href === '/' ? activePath === '/' : Boolean(activePath?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`relative h-full flex items-center transition-colors ${
                  isActive
                    ? 'text-slate-900 font-medium'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="relative">
                  {label}
                  {isActive && (
                    <span className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-slate-900" />
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-500">
          {adminRole === 'superadmin' ? 'Superadmin' : 'Admin'}
        </span>
        <a
          href={MAIN_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          Back to site
        </a>
      </div>
    </nav>
  );
}
