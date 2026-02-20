'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { CleanUnifiedRecordWithId, FinancialRecord } from '@/types/admin';
import {
  IconCheck,
  IconArrowBackUp,
  IconCurrencyRupee,
  IconDownload,
  IconArchive,
  IconTrash,
  IconX,
} from '@tabler/icons-react';

type RecordForCsv = CleanUnifiedRecordWithId | FinancialRecord | { passId: string; name: string; college: string; phone: string; email: string; eventName: string; passType: string; paymentStatus: string; createdAt: string };

function escapeCsv(val: unknown): string {
  const s = val == null ? '' : String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(records: RecordForCsv[], filename: string) {
  const headers = ['Name', 'College', 'Phone', 'Email', 'Event', 'Pass Type', 'Payment', 'Registered On'];
  const rows = records.map((r) =>
    [
      r.name,
      r.college,
      r.phone ?? '',
      r.email,
      r.eventName,
      r.passType,
      r.paymentStatus ?? (r as { payment?: string }).payment ?? '',
      r.createdAt,
    ].map(escapeCsv).join(',')
  );
  const csv = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv; charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function BulkActionBar({
  selectedCount,
  selectedPassIds,
  selectedRecords = [],
  onClearSelection,
  onSuccess,
  getToken,
  financialMode = false,
}: {
  selectedCount: number;
  selectedPassIds: string[];
  selectedRecords?: RecordForCsv[];
  onClearSelection: () => void;
  onSuccess: () => void;
  getToken: () => Promise<string>;
  /** When true, show Force verify payment and use paymentIds from selectedRecords (FinancialRecord[]) */
  financialMode?: boolean;
}) {
  const [loading, setLoading] = React.useState<string | null>(null);

  const runBulk = React.useCallback(
    async (action: string, body: { action: string; targetCollection: string; targetIds: string[] }) => {
      const ids = body.targetIds;
      if (ids.length === 0) return;
      setLoading(action);
      try {
        const token = await getToken();
        const res = await fetch('/api/admin/bulk-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data?.error ?? 'Action failed');
          return;
        }
        const count = data?.updated != null ? data.updated : 0;
        toast.success(
          body.action === 'delete'
            ? (count ? `${count} deleted` : 'Done')
            : count
              ? `${count} updated`
              : 'Done'
        );
        onClearSelection();
        onSuccess();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Request failed');
      } finally {
        setLoading(null);
      }
    },
    [getToken, onClearSelection, onSuccess]
  );

  const handleForceVerifyPayment = () => {
    if (!financialMode || selectedRecords.length === 0) return;
    const paymentIds = (selectedRecords as FinancialRecord[])
      .map((r) => ('paymentId' in r ? r.paymentId : ''))
      .filter(Boolean);
    if (paymentIds.length === 0) return;
    if (!window.confirm(`Force verify ${paymentIds.length} payment(s) as success?`)) return;
    runBulk('forceVerifyPayment', {
      action: 'forceVerifyPayment',
      targetCollection: 'payments',
      targetIds: paymentIds,
    });
  };

  const handleMarkUsed = () => {
    if (!window.confirm(`Mark ${selectedCount} pass(es) as used?`)) return;
    runBulk('markUsed', {
      action: 'markUsed',
      targetCollection: 'passes',
      targetIds: selectedPassIds,
    });
  };

  const handleRevertUsed = () => {
    if (!window.confirm(`Revert ${selectedCount} pass(es) to paid? This cannot be undone.`)) return;
    runBulk('revertUsed', {
      action: 'revertUsed',
      targetCollection: 'passes',
      targetIds: selectedPassIds,
    });
  };

  const handleSoftDelete = () => {
    if (!window.confirm(`Soft delete ${selectedCount} pass(es)? They will be archived.`)) return;
    runBulk('softDelete', {
      action: 'softDelete',
      targetCollection: 'passes',
      targetIds: selectedPassIds,
    });
  };

  const handleDeleteFromDb = () => {
    if (
      !window.confirm(
        `Permanently delete ${selectedCount} pass(es) from the database? This cannot be undone.`
      )
    )
      return;
    runBulk('delete', {
      action: 'delete',
      targetCollection: 'passes',
      targetIds: selectedPassIds,
    });
  };

  const handleExportSelected = () => {
    if (selectedRecords.length === 0) return;
    downloadCsv(selectedRecords, `selected-passes-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Exported');
  };

  if (selectedCount === 0) return null;

  return (
    <div className="mt-3 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-3 fade-in">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400 tabular-nums">
          {selectedCount}
        </span>
        <span className="text-sm text-zinc-400">selected</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 h-8 px-3 text-xs"
          onClick={handleMarkUsed}
          disabled={!!loading}
        >
          <IconCheck size={14} className="mr-1.5" />
          Mark used
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 h-8 px-3 text-xs"
          onClick={handleRevertUsed}
          disabled={!!loading}
        >
          <IconArrowBackUp size={14} className="mr-1.5" />
          Revert to paid
        </Button>
        {financialMode && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 h-8 px-3 text-xs"
            onClick={handleForceVerifyPayment}
            disabled={!!loading || selectedRecords.length === 0}
          >
            <IconCurrencyRupee size={14} className="mr-1.5" />
            Force verify
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 h-8 px-3 text-xs"
          onClick={handleExportSelected}
          disabled={selectedRecords.length === 0}
        >
          <IconDownload size={14} className="mr-1.5" />
          Export
        </Button>

        <div className="mx-1 h-4 w-px bg-zinc-800" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-red-400 hover:bg-red-500/10 hover:text-red-300 h-8 px-3 text-xs"
          onClick={handleSoftDelete}
          disabled={!!loading}
        >
          <IconArchive size={14} className="mr-1.5" />
          Archive
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-red-400 hover:bg-red-500/10 hover:text-red-300 h-8 px-3 text-xs"
          onClick={handleDeleteFromDb}
          disabled={!!loading}
        >
          <IconTrash size={14} className="mr-1.5" />
          Delete
        </Button>

        <div className="mx-1 h-4 w-px bg-zinc-800" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 h-8 px-3 text-xs"
          onClick={onClearSelection}
        >
          <IconX size={14} className="mr-1.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}
