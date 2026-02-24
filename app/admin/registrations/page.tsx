'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import type { RegistrationRow, RegistrationStatus } from '@/types/admin';
import { useRegistrations } from '@/hooks/use-registrations';
import { RegistrationsFiltersBar } from '@/components/admin/RegistrationsFiltersBar';
import { RegistrationsTable } from '@/components/admin/RegistrationsTable';
import { RegistrationsConvertModal } from '@/components/admin/RegistrationsConvertModal';
import { toast } from 'sonner';

export default function AdminRegistrationsPage() {
  const { user } = useAuth();
  const {
    registrations,
    loading,
    error,
    page,
    pageSize,
    total,
    totalPages,
    filters,
    setSearch,
    setPassType,
    setDateRange,
    setPage,
    refetch,
  } = useRegistrations(user ?? null);

  const [convertOpen, setConvertOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<RegistrationRow | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const passTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          registrations
            .map((r) => r.passType)
            .filter((v): v is string => Boolean(v))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [registrations]
  );

  const handleConvertClick = (row: RegistrationRow) => {
    setConvertTarget(row);
    setConvertError(null);
    setConvertOpen(true);
  };

  const handleConvertSubmit = async (notes?: string) => {
    if (!user || !convertTarget) return;
    setConvertLoading(true);
    setConvertError(null);
    try {
      const token = await user.getIdToken(false);

      // 1. Create the Order
      const res = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          registrationId: convertTarget.id,
          notes,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Order creation failed: ${res.status}`);
      }

      const { paymentSessionId, orderId } = data;

      // 2. Open Cashfree Checkout Modal
      const { openCashfreeCheckout } = await import('@/features/payments/cashfreeClient.js');
      const checkoutResult = await openCashfreeCheckout(paymentSessionId);

      if (checkoutResult.error) {
        throw new Error(checkoutResult.error.message || 'Payment modal failed');
      }

      // 3. Verify Payment
      toast.info('Verifying payment...');
      const verifyRes = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Verification failed');
      }

      toast.success('Payment successful and pass issued!');
      setConvertOpen(false);
      setConvertTarget(null);
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment process failed';
      setConvertError(message);
      toast.error(message);
    } finally {
      setConvertLoading(false);
    }
  };

  const handleStatusChange = async (row: RegistrationRow, status: RegistrationStatus) => {
    if (!user) return;

    // If the user selects "converted", trigger the on-spot payment flow
    if (status === 'converted') {
      handleConvertClick(row);
      return;
    }

    try {
      const token = await user.getIdToken(false);
      const res = await fetch('/api/admin/update-registration-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          registrationId: row.id,
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = (data as { error?: string }).error ?? `Failed: ${res.status}`;
        throw new Error(message);
      }
      toast.success(`Status updated to ${status}`);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleViewDetails = (row: RegistrationRow) => {
    // Minimal implementation: simple alert-like toast; can be replaced with a proper detail modal.
    toast.info(`${row.name || 'Unknown'} • ${row.passType} • ${row.email || 'no email'}`);
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Registrations</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Manage on-spot registrations and generate Cashfree payment links.
          </p>
        </div>
        {typeof total === 'number' && (
          <div className="rounded-full bg-zinc-900 border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
            {total.toLocaleString('en-IN')} total
          </div>
        )}
      </div>

      <RegistrationsFiltersBar
        search={filters.q ?? ''}
        onSearchChange={setSearch}
        passType={filters.passType}
        onPassTypeChange={setPassType}
        dateFrom={filters.from}
        dateTo={filters.to}
        onDateRangeChange={setDateRange}
        passTypeOptions={passTypeOptions}
      />

      <RegistrationsTable
        rows={registrations}
        loading={loading}
        error={error}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => {
          // Guard against over-advancing when totalPages is known
          if (totalPages && next > totalPages) return;
          setPage(next);
        }}
        onViewDetails={handleViewDetails}
        onStatusChange={handleStatusChange}
      />

      <RegistrationsConvertModal
        open={convertOpen}
        onOpenChange={setConvertOpen}
        registration={convertTarget}
        onSubmit={handleConvertSubmit}
        submitting={convertLoading}
        error={convertError}
      />
    </div>
  );
}

