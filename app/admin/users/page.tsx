'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
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

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCollege, setFormCollege] = useState('');
  const [formIsOrganizer, setFormIsOrganizer] = useState(false);
  const [search, setSearch] = useState('');

  const refetch = useCallback(() => {
    if (!user) return;
    user.getIdToken().then((token) =>
      fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => res.json())
        .then((data) => setUsers(data.users || []))
    );
  }, [user]);

  const openEdit = (u: UserRecord) => {
    setEditUser(u);
    setFormName(u.name ?? '');
    setFormPhone(u.phone ?? '');
    setFormCollege(u.college ?? '');
    setFormIsOrganizer(u.isOrganizer ?? false);
  };

  const saveUser = async () => {
    if (!editUser || !user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: editUser.id,
          name: formName || undefined,
          phone: formPhone || undefined,
          college: formCollege || undefined,
          isOrganizer: formIsOrganizer,
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

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const token = await user.getIdToken();
        const res = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        setUsers(data.users || []);
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [user]);

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
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800" /></td>
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
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1.5 bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Phone</Label>
                <Input
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="mt-1.5 bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">College</Label>
                <Input
                  value={formCollege}
                  onChange={(e) => setFormCollege(e.target.value)}
                  className="mt-1.5 bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsOrganizer}
                  onChange={(e) => setFormIsOrganizer(e.target.checked)}
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
