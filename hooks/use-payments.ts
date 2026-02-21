import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

interface Payment {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  amount: number;
  status: string;
  passType: string | null;
  cashfreeOrderId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface UsePaymentsResult {
  payments: Payment[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePayments(user: User | null): UsePaymentsResult {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const token = await user.getIdToken();
        const res = await fetch('/api/payments', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        setPayments(data.payments || []);
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
  }, [user, version]);

  const refetch = () => setVersion((v) => v + 1);

  return { payments, loading, error, refetch };
}
