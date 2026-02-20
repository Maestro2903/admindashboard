import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireAdminRole, canMutateTeams, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { logAdminAction } from '@/lib/admin/adminLogger';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

const memberSchema = z.object({
  memberId: z.string(),
  name: z.string(),
  phone: z.string().optional(),
  isLeader: z.boolean().optional(),
  attendance: z.record(z.string(), z.unknown()).optional(),
});

const bodySchema = z.object({
  teamId: z.string().min(1),
  teamName: z.string().optional(),
  members: z.array(memberSchema).optional(),
  resetAttendance: z.boolean().optional(),
  removeMemberId: z.string().optional(),
  isArchived: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const rl = await rateLimitAdmin(req, 'mutation');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireAdminRole(req);
    if (result instanceof Response) return result;
    if (!canMutateTeams(result.adminRole)) return forbiddenRole();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parse = bodySchema.safeParse(body);
    if (!parse.success) {
      return Response.json({ error: 'Validation failed', issues: parse.error.issues }, { status: 400 });
    }
    const { teamId, teamName, members, resetAttendance, removeMemberId, isArchived } = parse.data;

    const db = getAdminFirestore();
    const teamRef = db.collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    if (!teamSnap.exists) {
      return Response.json({ error: 'Team not found' }, { status: 404 });
    }

    const previousData = teamSnap.data() as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (teamName !== undefined) updates.teamName = teamName;
    if (members !== undefined) {
      updates.members = members;
      updates.totalMembers = members.length;
    }
    if (resetAttendance === true && Array.isArray(previousData.members)) {
      const membersList = previousData.members as Array<Record<string, unknown>>;
      updates.members = membersList.map((m) => {
        const { attendance, ...rest } = m;
        return { ...rest, attendance: {} };
      });
    }
    if (removeMemberId !== undefined && Array.isArray(previousData.members)) {
      const membersList = (previousData.members as Array<Record<string, unknown>>).filter(
        (m) => m.memberId !== removeMemberId
      );
      updates.members = membersList;
      updates.totalMembers = membersList.length;
    }
    if (typeof isArchived === 'boolean') {
      updates.isArchived = isArchived;
      updates.archivedAt = isArchived ? new Date() : null;
      updates.archivedBy = isArchived ? result.uid : null;
    }

    await teamRef.update(updates);
    const newSnap = await teamRef.get();
    const newData = newSnap.data() as Record<string, unknown>;

    const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
    const ip = typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined;
    await logAdminAction(db, {
      adminId: result.uid,
      action: 'update-team',
      targetCollection: 'teams',
      targetId: teamId,
      previousData,
      newData,
      ipAddress: ip,
    });

    return Response.json({
      success: true,
      teamId,
      teamName: newData.teamName,
      totalMembers: newData.totalMembers,
      isArchived: newData.isArchived ?? false,
    });
  } catch (error) {
    console.error('Update team API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
