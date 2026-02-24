import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import type { RegistrationRow, RegistrationsListResponse, RegistrationStatus } from '@/types/admin';

const querySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? parseInt(v, 10) : 1;
      return Number.isFinite(n) && n > 0 ? n : 1;
    }),
  pageSize: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? parseInt(v, 10) : 25;
      if (!Number.isFinite(n)) return 25;
      return Math.min(Math.max(n, 10), 100);
    }),
  q: z.string().optional(),
  passType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return 'all' as const;
      const allowed: Array<'pending' | 'converted' | 'cancelled'> = [
        'pending',
        'converted',
        'cancelled',
      ];
      return allowed.includes(v as RegistrationStatus) ? (v as RegistrationStatus) : 'all';
    }),
});

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe?.toDate === 'function') {
    const d = maybe.toDate();
    return d ? d.toISOString() : null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const rl = await rateLimitAdmin(req, 'dashboard');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const organizer = await requireOrganizer(req);
    if (organizer instanceof Response) return organizer;

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      q: searchParams.get('q') ?? undefined,
      passType: searchParams.get('passType') ?? undefined,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    });

    if (!parsed.success) {
      return Response.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { page, pageSize, q, passType, from, to } = parsed.data;
    const db = getAdminFirestore();

    // Pending registrations only – this page is a pending queue.
    let query = db
      .collection('registrations')
      .where('status', '==', 'pending' as RegistrationStatus)
      .orderBy('createdAt', 'desc');

    if (passType && passType.trim()) {
      query = query.where('passType', '==', passType.trim());
    }

    // Apply basic date bounds at query level when possible
    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    if (from && from.trim()) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) {
        fromDate = d;
        query = query.where('createdAt', '>=', d);
      }
    }
    if (to && to.trim()) {
      // To date is inclusive; we can add 1 day minus 1ms when user supplies a date-only string
      const raw = to.includes('T') ? new Date(to) : new Date(`${to}T23:59:59.999Z`);
      if (!Number.isNaN(raw.getTime())) {
        toDate = raw;
        query = query.where('createdAt', '<=', raw);
      }
    }

    // Offset-based pagination for moderate collection sizes
    const offset = (page - 1) * pageSize;
    const snapshot = await query.offset(offset).limit(pageSize).get();

    const records: RegistrationRow[] = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const createdAt = toIso(data.createdAt) ?? null;
      return {
        id: doc.id,
        userId: (data.userId as string) ?? '',
        name: (data.name as string) ?? '',
        email: (data.email as string) ?? '',
        college: (data.college as string) ?? null,
        phone: (data.phone as string) ?? null,
        passType: (data.passType as string) ?? '',
        selectedDays: Array.isArray(data.selectedDays)
          ? (data.selectedDays as unknown[]).filter((v): v is string => typeof v === 'string')
          : null,
        selectedEvents: Array.isArray(data.selectedEvents)
          ? (data.selectedEvents as unknown[]).filter((v): v is string => typeof v === 'string')
          : null,
        calculatedAmount:
          typeof data.calculatedAmount === 'number'
            ? data.calculatedAmount
            : Number(data.amount) || 0,
        status: ((data.status as string) ?? 'pending') as RegistrationStatus,
        createdAt: createdAt ?? new Date(0).toISOString(),
      };
    });

    // In-memory search across name/email/phone
    let filtered = records;
    if (q && q.trim()) {
      const needle = q.trim().toLowerCase();
      filtered = records.filter((r) => {
        const hay = `${r.name} ${r.email} ${r.phone ?? ''}`.toLowerCase();
        return hay.includes(needle);
      });
    }

    // Extra in-memory date filter safeguard if query-level parsing failed
    if (fromDate || toDate) {
      filtered = filtered.filter((r) => {
        const created = new Date(r.createdAt);
        if (Number.isNaN(created.getTime())) return false;
        if (fromDate && created < fromDate) return false;
        if (toDate && created > toDate) return false;
        return true;
      });
    }

    // Optional total count for UX; fall back gracefully if aggregation fails
    let total: number | undefined;
    try {
      let countQuery = db
        .collection('registrations')
        .where('status', '==', 'pending' as RegistrationStatus);
      if (passType && passType.trim()) {
        countQuery = countQuery.where('passType', '==', passType.trim());
      }
      const countSnap = await countQuery.count().get();
      const data = countSnap.data?.();
      if (data && typeof data.count === 'number') {
        total = data.count;
      }
    } catch {
      total = undefined;
    }

    const totalPages = total && total > 0 ? Math.ceil(total / pageSize) : undefined;

    const response: RegistrationsListResponse = {
      records: filtered,
      page,
      pageSize,
      total,
      totalPages,
    };

    return Response.json(response);
  } catch (error) {
    console.error('Admin registrations API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}

