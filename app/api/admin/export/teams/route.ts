import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

function getString(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === 'string' ? v : undefined;
}

function getNumber(rec: Record<string, unknown>, key: string): number | undefined {
  const v = rec[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function escapeCsv(val: unknown): string {
  const s = val == null ? '' : String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function countCheckedIn(members: unknown): number {
  if (!Array.isArray(members)) return 0;
  let n = 0;
  for (const m of members) {
    const r = m && typeof m === 'object' ? (m as Record<string, unknown>) : null;
    const att = r?.attendance && typeof r.attendance === 'object' ? (r.attendance as Record<string, unknown>) : null;
    if (att?.checkedIn === true) n += 1;
  }
  return n;
}

export async function GET(req: NextRequest) {
  const rl = await rateLimitAdmin(req, 'export');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get('includeArchived') === '1';

    const db = getAdminFirestore();
    const teamsSnap = await db.collection('teams').orderBy('teamName', 'asc').get();

    let docs = teamsSnap.docs;
    if (!includeArchived) {
      docs = docs.filter((doc) => (doc.data() as Record<string, unknown>).isArchived !== true);
    }

    const headers = ['Team Name', 'Total Members', 'Checked In', 'Pass Id', 'Payment Status'];
    const rows: string[][] = [headers];

    for (const doc of docs) {
      const d = doc.data() as Record<string, unknown>;
      const members = d.members;
      const total = getNumber(d, 'totalMembers') ?? (Array.isArray(members) ? members.length : 0);
      const checkedIn = countCheckedIn(members);

      rows.push([
        getString(d, 'teamName') ?? '',
        String(total),
        String(checkedIn),
        getString(d, 'passId') ?? '',
        getString(d, 'paymentStatus') ?? getString(d, 'status') ?? '',
      ]);
    }

    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="teams.csv"',
      },
    });
  } catch (error) {
    console.error('Teams export API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
