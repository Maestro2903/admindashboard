'use client';

import Link from 'next/link';

export type AdminNavItem = { href: string; label: string };

export function AdminSidebar({
  items,
  activePath,
  footer,
}: {
  items: readonly AdminNavItem[];
  activePath: string | null;
  footer?: React.ReactNode;
}) {
  return (
    <aside
      className="fixed left-0 top-0 z-10 flex h-full w-60 flex-col border-r border-slate-200 bg-white"
      aria-label="Admin navigation"
    >
      <div className="flex h-[var(--admin-header-height)] items-center border-b border-slate-200 px-4">
        <Link href="/" className="font-semibold text-slate-900">
          Admin
        </Link>
      </div>
      <nav className="flex-1 space-y-2 p-4">
        {items.map(({ href, label }) => {
          const isActive = href === '/' ? activePath === '/' : Boolean(activePath?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`block rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {footer ? <div className="border-t border-slate-200 p-4">{footer}</div> : null}
    </aside>
  );
}

