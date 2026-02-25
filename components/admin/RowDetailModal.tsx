'use client';

import * as React from 'react';
import Image from 'next/image';
import type { CleanUnifiedRecordWithId, FinancialRecord } from '@/types/admin';
import { IconX, IconCircleCheckFilled, IconQrcode, IconTrash, IconRotate, IconShieldCheck, IconAlertTriangle } from '@tabler/icons-react';
import { formatPhone } from '@/lib/utils';

/** Minimal record for detail modal (e.g. from operations view without userId). */
export type RowDetailRecord = CleanUnifiedRecordWithId | FinancialRecord | {
  passId: string;
  name: string;
  email: string;
  college: string;
  phone: string;
  eventName: string;
  passType: string;
  paymentStatus: string;
  createdAt: string;
};

export interface TeamMemberRow {
  memberId?: string;
  name?: string;
  phone?: string;
  isLeader?: boolean;
  checkedIn?: boolean;
}

const IST = 'Asia/Kolkata';

function formatDate(iso: unknown): string {
  if (!iso) return '\u2014';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '\u2014';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function safeStr(val: unknown): string {
  if (val == null) return '\u2014';
  const s = String(val).trim();
  return s === '' || s === 'undefined' ? '\u2014' : s;
}

const PASS_TYPE_STYLES: Record<string, string> = {
  day_pass: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  group_events: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  proshow: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  sana_concert: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

const PASS_TYPE_LABELS: Record<string, string> = {
  day_pass: 'Day Pass',
  group_events: 'Group Events',
  proshow: 'Proshow',
  sana_concert: 'Sana Concert',
};

const PAYMENT_STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  success: { dot: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400' },
  pending: { dot: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-400' },
  failed: { dot: 'bg-red-500', badge: 'bg-red-500/10 text-red-400' },
};

// --- Subcomponents for RowDetailModal ---
function ModalHeader({
  record,
  onClose,
}: {
  record: RowDetailRecord;
  onClose: () => void;
}) {
  const statusStyle = PAYMENT_STATUS_STYLES[record.paymentStatus] ?? PAYMENT_STATUS_STYLES.success;
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
      <div className="flex items-center gap-3">
        <div className={`h-2.5 w-2.5 rounded-full ${statusStyle.dot}`} />
        <div>
          <h2 className="text-sm font-semibold text-white">Pass Overview</h2>
          <p className="text-[11px] font-mono text-zinc-600 mt-0.5">{record.passId}</p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
      >
        <IconX size={18} />
      </button>
    </div>
  );
}

function UserSection({ record }: { record: RowDetailRecord }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">User</h3>
      <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
        <div>
          <div className="text-[11px] text-zinc-500 mb-0.5">Name</div>
          <div className="text-white font-medium">{safeStr(record.name)}</div>
        </div>
        <div>
          <div className="text-[11px] text-zinc-500 mb-0.5">Phone</div>
          {record.phone ? (
            <a href={`tel:${record.phone}`} className="text-white tabular-nums hover:text-emerald-400 transition-colors">
              {formatPhone(record.phone)}
            </a>
          ) : (
            <div className="text-zinc-500">—</div>
          )}
        </div>
        <div className="col-span-2">
          <div className="text-[11px] text-zinc-500 mb-0.5">Email</div>
          <div className="text-zinc-300 text-xs break-all">{safeStr(record.email)}</div>
        </div>
        <div className="col-span-2">
          <div className="text-[11px] text-zinc-500 mb-0.5">College</div>
          <div className="text-zinc-300">{safeStr(record.college)}</div>
        </div>
      </div>
    </div>
  );
}

function PassSection({ record }: { record: RowDetailRecord }) {
  const statusStyle = PAYMENT_STATUS_STYLES[record.paymentStatus] ?? PAYMENT_STATUS_STYLES.success;
  const ptStyle = PASS_TYPE_STYLES[record.passType] ?? 'bg-zinc-800 text-zinc-300 border-zinc-700';
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Pass</h3>
      <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
        <div>
          <div className="text-[11px] text-zinc-500 mb-1">Type</div>
          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${ptStyle}`}>
            {PASS_TYPE_LABELS[record.passType] ?? record.passType}
          </span>
        </div>
        <div>
          <div className="text-[11px] text-zinc-500 mb-1">Payment</div>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.badge}`}>
            {record.paymentStatus}
          </span>
        </div>
        <div className="col-span-2">
          <div className="text-[11px] text-zinc-500 mb-0.5">Event</div>
          <div className="text-zinc-300">{safeStr(record.eventName)}</div>
        </div>
        <div className="col-span-2">
          <div className="text-[11px] text-zinc-500 mb-0.5">Registered On</div>
          <div className="text-zinc-300 tabular-nums">{formatDate(record.createdAt)}</div>
        </div>
      </div>
    </div>
  );
}

function FinancialSection({ record }: { record: FinancialRecord }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Financial</h3>
      <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
        <div>
          <div className="text-[11px] text-zinc-500 mb-0.5">Amount</div>
          <div className="text-white font-semibold tabular-nums">
            ₹{Number(record.amount).toLocaleString('en-IN')}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-zinc-500 mb-0.5">Order ID</div>
          <div className="font-mono text-xs text-zinc-400 break-all">{safeStr(record.orderId)}</div>
        </div>
      </div>
    </div>
  );
}

function ModalActions({
  record,
  actionLoading,
  qrLoading,
  onMarkUsed,
  onRevertUsed,
  onForceVerify,
  onViewQr,
  onDeleteClick,
  canMutatePass,
  canForceVerify,
  canDelete,
}: {
  record: RowDetailRecord;
  actionLoading: string | null;
  qrLoading: boolean;
  onMarkUsed: () => void;
  onRevertUsed: () => void;
  onForceVerify: () => void;
  onViewQr: () => void;
  onDeleteClick: () => void;
  canMutatePass: boolean;
  canForceVerify: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="border-t border-zinc-800 px-6 py-4 space-y-3">
      <div className="flex gap-2">
        <button
          onClick={onMarkUsed}
          disabled={!!actionLoading || !canMutatePass}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2.5 text-sm font-medium text-emerald-400 transition-all duration-150 hover:bg-emerald-500/25 disabled:opacity-40"
        >
          <IconCircleCheckFilled size={16} />
          {actionLoading === 'markUsed' ? 'Marking...' : 'Mark as Used'}
        </button>
        <button
          onClick={onRevertUsed}
          disabled={!!actionLoading || !canMutatePass}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm font-medium text-zinc-300 transition-all duration-150 hover:bg-zinc-700 disabled:opacity-40"
        >
          <IconRotate size={16} />
          {actionLoading === 'revertUsed' ? 'Reverting...' : 'Revert Used'}
        </button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onForceVerify}
          disabled={!!actionLoading || !canForceVerify}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 transition-all duration-150 hover:bg-amber-500/20 disabled:opacity-40"
        >
          <IconShieldCheck size={15} />
          {actionLoading === 'fixPayment' ? 'Verifying...' : 'Force Verify'}
        </button>
        <button
          onClick={onViewQr}
          disabled={qrLoading}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-400 transition-all duration-150 hover:bg-blue-500/20 disabled:opacity-40"
        >
          <IconQrcode size={15} />
          {qrLoading ? 'Loading...' : 'View QR'}
        </button>
        <button
          onClick={onDeleteClick}
          disabled={!!actionLoading || !canDelete}
          className="flex items-center justify-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 transition-all duration-150 hover:bg-red-500/20 disabled:opacity-40"
        >
          <IconTrash size={15} />
        </button>
      </div>
    </div>
  );
}

// --- Delete confirmation modal ---
function DeleteConfirmModal({
  open,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        role="button"
        tabIndex={0}
        aria-label="Close dialog"
        onClick={onCancel}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCancel(); } }}
      />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
            <IconAlertTriangle size={20} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Delete Pass</h3>
            <p className="text-xs text-zinc-500">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          This will permanently remove the pass from the database. All associated data will be lost.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50"
          >
            {loading ? 'Deleting...' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RowDetailModal({
  record,
  open,
  onClose,
  onUpdated,
  getToken,
  adminRole,
}: {
  record: RowDetailRecord | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  teamMembers?: TeamMemberRow[] | null;
  loadingTeam?: boolean;
  getToken: () => Promise<string>;
  /** Viewer / manager / superadmin string from server */
  adminRole?: string | null;
}) {
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = React.useState<string | null>(null);
  const [qrLoading, setQrLoading] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const drawerRef = React.useRef<HTMLDivElement>(null);

  const effectiveRole = (adminRole as string | undefined) ?? 'viewer';
  const canMutatePass = effectiveRole === 'manager' || effectiveRole === 'superadmin';
  const canForceVerify = effectiveRole === 'superadmin';
  const canDelete = canMutatePass;

  // ---- Actions ----
  const handleMarkUsed = React.useCallback(async () => {
    if (!record?.passId) return;
    if (!canMutatePass) return;
    setActionLoading('markUsed');
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/passes/${record.passId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'markUsed' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed');
      onUpdated?.();
      onClose();
    } catch (e) { console.error(e); }
    finally { setActionLoading(null); }
  }, [record, getToken, onUpdated, onClose]);

  const handleRevertUsed = React.useCallback(async () => {
    if (!record?.passId) return;
    if (!canMutatePass) return;
    setActionLoading('revertUsed');
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/passes/${record.passId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'revertUsed' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed');
      onUpdated?.();
      onClose();
    } catch (e) { console.error(e); }
    finally { setActionLoading(null); }
  }, [record, getToken, onUpdated, onClose]);

  const handleForceVerify = React.useCallback(async () => {
    if (!record?.passId) return;
    if (!canForceVerify) return;
    setActionLoading('fixPayment');
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/passes/${record.passId}/fix-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed');
      onUpdated?.();
    } catch (e) { console.error(e); }
    finally { setActionLoading(null); }
  }, [record, getToken, onUpdated]);

  const handleViewQr = React.useCallback(async () => {
    if (!record?.passId) return;
    setQrLoading(true);
    setQrImageUrl(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/passes/${record.passId}/qr`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { qrCodeUrl?: string };
      if (!res.ok) throw new Error('Failed to load QR');
      if (data.qrCodeUrl) setQrImageUrl(data.qrCodeUrl);
    } catch (e) { console.error(e); }
    finally { setQrLoading(false); }
  }, [record, getToken]);

  const handleDeletePass = React.useCallback(async () => {
    if (!record?.passId) return;
    if (!canDelete) return;
    setActionLoading('delete');
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/passes/${record.passId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed');
      setShowDeleteConfirm(false);
      onUpdated?.();
      onClose();
    } catch (e) { console.error(e); }
    finally { setActionLoading(null); }
  }, [record, getToken, onUpdated, onClose]);

  // Reset state on close
  React.useEffect(() => {
    if (!open) {
      setQrImageUrl(null);
      setShowDeleteConfirm(false);
    }
  }, [open]);

  // ESC to close
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!record) return null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
        role="button"
        tabIndex={0}
        aria-label="Close panel"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClose(); } }}
      />
      <div
        ref={drawerRef}
        className={`fixed right-0 top-0 z-50 flex h-full w-[420px] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <ModalHeader record={record} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-0">
          <UserSection record={record} />
          <div className="mt-6 pt-6 border-t border-zinc-800" />
          <PassSection record={record} />
          {'amount' in record && (
            <>
              <div className="mt-6 pt-6 border-t border-zinc-800" />
              <FinancialSection record={record as FinancialRecord} />
            </>
          )}
          {qrImageUrl && (
            <>
              <div className="mt-6 pt-6 border-t border-zinc-800" />
              <div className="flex justify-center">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                  <Image src={qrImageUrl} alt="QR Code" width={176} height={176} className="rounded-lg" />
                </div>
              </div>
            </>
          )}
        </div>
        <ModalActions
          record={record}
          actionLoading={actionLoading}
          qrLoading={qrLoading}
          onMarkUsed={handleMarkUsed}
          onRevertUsed={handleRevertUsed}
          onForceVerify={handleForceVerify}
          onViewQr={handleViewQr}
          onDeleteClick={() => setShowDeleteConfirm(true)}
          canMutatePass={canMutatePass}
          canForceVerify={canForceVerify}
          canDelete={canDelete}
        />
      </div>
      <DeleteConfirmModal
        open={showDeleteConfirm}
        onConfirm={handleDeletePass}
        onCancel={() => setShowDeleteConfirm(false)}
        loading={actionLoading === 'delete'}
      />
    </>
  );
}
