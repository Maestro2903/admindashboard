import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { RegistrationRow, RegistrationsListResponse } from '@/types/admin';
import { getCache, setCache, invalidateCache } from '@/lib/clientCache';

const CACHE_KEY = 'registrations_list';

export interface RegistrationsFilters {
  q?: string;
  passType?: string;
  from?: string;
  to?: string;
}

interface UseRegistrationsResult {
  registrations: RegistrationRow[];
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  total?: number;
  totalPages?: number;
  filters: RegistrationsFilters;
  setSearch: (q: string) => void;
  setPassType: (passType: string | undefined) => void;
  setDateRange: (from?: string, to?: string) => void;
  setPage: (page: number) => void;
  refetch: () => void;
}

export function useRegistrations(user: User | null): UseRegistrationsResult {
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPageState] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [filters, setFilters] = useState<RegistrationsFilters>({});
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Initial load: serve from cache when filters are empty and first page
    if (version === 0 && page === 1 && !filters.q && !filters.passType && !filters.from && !filters.to) {
      const cached = getCache<RegistrationsListResponse>(CACHE_KEY);
      if (cached) {
        setRegistrations(cached.records);
        setLoading(false);
        setError(null);
        setTotal(cached.total);
        setTotalPages(cached.totalPages);
        return;
      }
    }

    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const token = await user.getIdToken(false);

        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('pageSize', String(pageSize));
        if (filters.q) params.set('q', filters.q);
        if (filters.passType) params.set('passType', filters.passType);
        if (filters.from) params.set('from', filters.from);
        if (filters.to) params.set('to', filters.to);

        const res = await fetch(`/api/admin/registrations?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `Failed: ${res.status}`);
        }
        const data = (await res.json()) as RegistrationsListResponse;
        setRegistrations(data.records ?? []);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError(null);

        // Cache only the simplest view: first page, no filters
        if (page === 1 && !filters.q && !filters.passType && !filters.from && !filters.to) {
          setCache(CACHE_KEY, data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [user, page, pageSize, filters.q, filters.passType, filters.from, filters.to, version]);

  const setSearch = (q: string) => {
    setPageState(1);
    setFilters((prev) => ({ ...prev, q: q.trim() || undefined }));
  };

  const setPassType = (passType: string | undefined) => {
    setPageState(1);
    setFilters((prev) => ({ ...prev, passType }));
  };

  const setDateRange = (from?: string, to?: string) => {
    setPageState(1);
    setFilters((prev) => ({ ...prev, from: from || undefined, to: to || undefined }));
  };


  const setPage = (next: number) => {
    setPageState(next <= 0 ? 1 : next);
  };

  const refetch = () => {
    invalidateCache(CACHE_KEY);
    setVersion((v) => v + 1);
  };

  return {
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
  };
}

