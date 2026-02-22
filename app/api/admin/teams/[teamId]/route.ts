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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const rl = await rateLimitAdmin(req, 'dashboard');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { teamId } = await params;
    if (!teamId) {
      return Response.json({ error: 'Missing teamId' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const teamSnap = await db.collection('teams').doc(teamId).get();

    if (!teamSnap.exists) {
      return Response.json({ error: 'Team not found' }, { status: 404 });
    }

    const d = teamSnap.data() as Record<string, unknown>;
    const members = (d.members as Array<Record<string, unknown>>) ?? [];
    const totalMembers = getNumber(d, 'totalMembers') ?? members.length;

    const membersList = members.map((m) => ({
      memberId: getString(m, 'memberId'),
      name: getString(m, 'name'),
      phone: getString(m, 'phone'),
      isLeader: Boolean(m.isLeader),
      checkedIn: Boolean((m.attendance as Record<string, unknown>)?.checkedIn ?? m.checkedIn),
    }));

    return Response.json({
      teamId: teamSnap.id,
      teamName: getString(d, 'teamName'),
      totalMembers,
      passId: getString(d, 'passId'),
      paymentStatus: getString(d, 'paymentStatus') ?? getString(d, 'status') ?? 'pending',
      members: membersList,
    });
  } catch (error) {
    console.error('Team detail API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
