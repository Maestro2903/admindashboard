'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import type { AdminEvent } from '@/types/admin';

export default function AdminEventsPage() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = React.useState<AdminEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editEvent, setEditEvent] = React.useState<AdminEvent | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [formName, setFormName] = React.useState('');
  const [formActive, setFormActive] = React.useState(true);

  const refetch = React.useCallback(() => {
    if (!user) return;
    user.getIdToken(false).then((token) =>
      fetch('/api/admin/events?activeOnly=0', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => res.json())
        .then((data) => setEvents((data as { events: AdminEvent[] }).events ?? []))
    );
  }, [user]);

  const openEdit = (ev: AdminEvent) => {
    setEditEvent(ev);
    setFormName(ev.name ?? '');
    setFormActive(ev.isActive ?? true);
  };

  const saveEvent = async () => {
    if (!editEvent || !user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken(false);
      const res = await fetch('/api/admin/update-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          eventId: editEvent.id,
          name: formName,
          isActive: formActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      toast.success('Event updated');
      setEditEvent(null);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  React.useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      setError('Please sign in to access events');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await user.getIdToken(false);
        const res = await fetch('/api/admin/events?activeOnly=0', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`);
        }
        const data = (await res.json()) as { events: AdminEvent[] };
        if (!cancelled) setEvents(data.events ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Events</h1>
        <p className="mt-1 text-sm text-slate-500">Event catalog (organizer-only)</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-sm font-medium text-red-800">Failed to load events</div>
          <div className="mt-1 text-sm text-red-600">{error}</div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="max-h-[calc(100vh-16rem)] overflow-auto">
          <Table className="w-full table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-slate-100">
              <TableRow className="border-slate-200">
                <TableHead className="text-slate-500">Name</TableHead>
                <TableHead className="text-slate-500">ID</TableHead>
                <TableHead className="text-slate-500">Date</TableHead>
                <TableHead className="text-slate-500">Type</TableHead>
                <TableHead className="text-slate-500">Category</TableHead>
                <TableHead className="text-slate-500">Venue</TableHead>
                <TableHead className="text-slate-500">Active</TableHead>
                <TableHead className="text-slate-500">Allowed Pass Types</TableHead>
                <TableHead className="text-slate-500">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="border-slate-200">
                  <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : events.length ? (
                events.map((ev) => (
                  <TableRow key={ev.id} className="border-slate-200 hover:bg-slate-50">
                    <TableCell className="whitespace-normal text-slate-900">
                      <Link
                        href={`/admin/events/${ev.id}`}
                        className="text-slate-900 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-300 rounded"
                      >
                        {ev.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-600">{ev.id}</TableCell>
                    <TableCell className="text-slate-600">{ev.date ?? '—'}</TableCell>
                    <TableCell className="text-slate-600">{ev.type ?? '—'}</TableCell>
                    <TableCell className="text-slate-600">{ev.category ?? '—'}</TableCell>
                    <TableCell className="text-slate-600">{ev.venue ?? '—'}</TableCell>
                    <TableCell className="text-slate-600">{ev.isActive ? 'Yes' : 'No'}</TableCell>
                    <TableCell className="whitespace-normal text-slate-600">
                      {(ev.allowedPassTypes ?? []).join(', ') || '—'}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => openEdit(ev)} className="border-slate-300 text-slate-700 hover:bg-slate-100">
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-slate-200">
                  <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                    No events found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={!!editEvent} onOpenChange={(open) => !open && setEditEvent(null)}>
        <SheetContent side="right" className="bg-white border-slate-200 text-slate-900">
          <SheetHeader>
            <SheetTitle className="text-slate-900">Edit event</SheetTitle>
          </SheetHeader>
          {editEvent && (
            <div className="mt-6 space-y-4">
              <div>
                <Label className="text-slate-600">Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 border-slate-200 bg-white text-slate-900"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span className="text-slate-700">Active</span>
              </label>
            </div>
          )}
          <SheetFooter className="mt-8">
            <Button variant="outline" onClick={() => setEditEvent(null)} className="border-slate-300 text-slate-700 hover:bg-slate-100">
              Cancel
            </Button>
            <Button onClick={saveEvent} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

