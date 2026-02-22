'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { useUsers } from '@/hooks/use-users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { IconSearch } from '@tabler/icons-react';

interface UserRecord {
  id: string;
  name: string | null;
  email: string | null;
  college: string | null;
  phone: string | null;
  isOrganizer: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  referralCode: string | null;
  inviteCount: number;
  dayPassUnlocked: boolean;
  isArchived?: boolean;
}

const SKELETON_ROWS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const SKELETON_CELLS = [1, 2, 3, 4, 5, 6, 7] as const;

const EMPTY_FORM = { name: '', phone: '', college: '', isOrganizer: false };

export default function UsersPage() {
  const { user } = useAuth();
  const { users, loading, error, refetch } = useUsers(user ?? null);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');

  const openEdit = (u: UserRecord) => {
    setEditUser(u);
    setForm({
      name: u.name ?? '',
      phone: u.phone ?? '',
      college: u.college ?? '',
      isOrganizer: u.isOrganizer ?? false,
    });
  };

  const saveUser = async () => {
    if (!editUser || !user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken(false);
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: editUser.id,
          name: form.name || undefined,
          phone: form.phone || undefined,
          college: form.college || undefined,
          isOrganizer: form.isOrganizer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      toast.success('User updated');
      setEditUser(null);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((u) =>
      (u.name?.toLowerCase().includes(q)) ||
      (u.email?.toLowerCase().includes(q)) ||
      (u.phone?.includes(q)) ||
      (u.college?.toLowerCase().includes(q))
    );
  }, [users, search]);

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Users</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{users.length} total users</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <Input
          placeholder="Search by name, email, phone, or college..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-zinc-700"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">College</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Phone</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Role</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Invites</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Created</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                SKELETON_ROWS.map((n) => (
                  <tr key={n}>
                    {SKELETON_CELLS.map((c) => (
                      <td key={c} className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-500">No users found</td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-white">{u.name || '—'}</div>
                      <div className="text-xs text-zinc-500 truncate max-w-[200px]">{u.email || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{u.college || '—'}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-400">{u.phone || '—'}</td>
                    <td className="px-4 py-3">
                      {u.isOrganizer ? (
                        <span className="inline-flex rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                          Organizer
                        </span>
                      ) : (
                        <span className="text-sm text-zinc-500">User</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-400">{u.inviteCount || 0}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-400 whitespace-nowrap">
                      {u.createdAt ? dateFmt.format(new Date(u.createdAt)) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                        onClick={() => openEdit(u)}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-zinc-800 px-4 py-3">
          <span className="text-xs text-zinc-500">{filteredUsers.length} of {users.length} users</span>
        </div>
      </div>

      {/* Edit Sheet */}
      <Sheet open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <SheetContent side="right" className="bg-zinc-900 border-zinc-800 text-white">
          <SheetHeader>
            <SheetTitle className="text-white">Edit User</SheetTitle>
          </SheetHeader>
          {editUser && (
            <div className="mt-6 space-y-4">
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Email</Label>
                <p className="mt-1 text-sm text-zinc-300">{editUser.email}</p>
              </div>
              <div>
                <Label htmlFor="edit-user-name" className="text-zinc-400 text-xs uppercase tracking-wider">Name</Label>
                <Input
                  id="edit-user-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1.5 bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div>
                <Label htmlFor="edit-user-phone" className="text-zinc-400 text-xs uppercase tracking-wider">Phone</Label>
                <Input
                  id="edit-user-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="mt-1.5 bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div>
                <Label htmlFor="edit-user-college" className="text-zinc-400 text-xs uppercase tracking-wider">College</Label>
                <Input
                  id="edit-user-college"
                  value={form.college}
                  onChange={(e) => setForm((f) => ({ ...f, college: e.target.value }))}
                  className="mt-1.5 bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isOrganizer}
                  onChange={(e) => setForm((f) => ({ ...f, isOrganizer: e.target.checked }))}
                  className="rounded border-zinc-600 bg-zinc-800"
                />
                <span className="text-sm text-zinc-300">Promote to Organizer</span>
              </label>
            </div>
          )}
          <SheetFooter className="mt-8">
            <Button
              variant="outline"
              onClick={() => setEditUser(null)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={saveUser}
              disabled={saving}
              className="bg-white text-zinc-900 hover:bg-zinc-200"
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
