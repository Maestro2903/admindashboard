'use client';

import { useState } from 'react';
import type { RegistrationRow } from '@/types/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface RegistrationsConvertModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registration: RegistrationRow | null;
  onSubmit: (paymentType: 'upi' | 'cash', notes?: string) => Promise<void> | void;
  submitting: boolean;
  error: string | null;
}

export function RegistrationsConvertModal({
  open,
  onOpenChange,
  registration,
  onSubmit,
  submitting,
  error,
}: RegistrationsConvertModalProps) {
  const [notes, setNotes] = useState('');
  const [paymentType, setPaymentType] = useState<'upi' | 'cash'>('upi');

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setNotes('');
      setPaymentType('upi');
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    await onSubmit(paymentType, notes.trim() || undefined);
  };

  const amountLabel =
    registration && Number.isFinite(registration.calculatedAmount)
      ? `₹${registration.calculatedAmount.toLocaleString('en-IN')}`
      : '—';

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="bg-zinc-950 border-l border-zinc-800 text-white w-full sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="text-white text-base">
            Convert to Paid
          </SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-5">
          {registration && (
            <>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-3 text-sm">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                  Registration
                </div>
                <div className="font-medium text-white truncate">{registration.name || '—'}</div>
                <div className="text-xs text-zinc-500 truncate max-w-full">
                  {registration.email || '—'}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5">
                    {registration.passType}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5">
                    Amount: {amountLabel}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  className="text-xs uppercase tracking-wider text-zinc-500"
                >
                  Payment Type
                </Label>
                <Select
                  value={paymentType}
                  onValueChange={(val: 'upi' | 'cash') => setPaymentType(val)}
                  disabled={submitting}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-sm text-zinc-100 h-10">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                    <SelectItem value="upi">UPI (Cashfree Link)</SelectItem>
                    <SelectItem value="cash">Cash (Direct Approval)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="convert-notes"
                  className="text-xs uppercase tracking-wider text-zinc-500"
                >
                  Notes (optional)
                </Label>
                <Input
                  id="convert-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-sm text-zinc-100"
                  placeholder="Internal note, e.g. who initiated payment..."
                  disabled={submitting}
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>
        <SheetFooter className="mt-8 flex-row justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-white text-zinc-950 hover:bg-zinc-200"
            disabled={submitting || !registration}
            onClick={handleSubmit}
          >
            {submitting 
              ? (paymentType === 'cash' ? 'Processing…' : 'Creating link…')
              : (paymentType === 'cash' ? 'Confirm Cash Payment' : 'Create Cashfree link')
            }
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

