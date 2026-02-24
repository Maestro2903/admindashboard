import { NextRequest, NextResponse } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import type { DocumentData } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

function getString(rec: Record<string, unknown>, key: string): string | undefined {
    const v = rec[key];
    return typeof v === 'string' ? v : undefined;
}

function getNumber(rec: Record<string, unknown>, key: string): number | undefined {
    const v = rec[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export async function GET(req: NextRequest) {
    try {
        const rl = await rateLimitAdmin(req, 'dashboard');
        if (rl.limited) return rateLimitResponse(rl);

        const result = await requireOrganizer(req);
        if (result instanceof Response) return result;

        const db = getAdminFirestore();

        // The user explicitly requested to only include teams that have a "Group Pass"
        // We achieve this by fetching only 'success' passes with passType === 'group_events'
        const passesSnap = await db.collection('passes')
            .where('passType', '==', 'group_events')
            .limit(1000)
            .get();

        const teamIdsRaw = passesSnap.docs.map(doc => getString(doc.data() as Record<string, unknown>, 'teamId'));
        const validTeamIds = [...new Set(teamIdsRaw.filter(Boolean))] as string[];

        const teamMap = new Map<string, Record<string, unknown>>();
        const teamEventMap = new Map<string, string>(); // Maps teamId to eventName from passes

        // Process in batches of 10 for Firestore 'in' query limitations or just Promise.all
        if (validTeamIds.length > 0) {
            const BATCH = 100;
            for (let i = 0; i < validTeamIds.length; i += BATCH) {
                const batch = validTeamIds.slice(i, i + BATCH);
                const docs = await Promise.all(batch.map(id => db.collection('teams').doc(id).get()));

                for (const doc of docs) {
                    if (doc.exists) {
                        teamMap.set(doc.id, doc.data() as Record<string, unknown>);
                    }
                }
            }
        }

        // Map teamId to event details from the passes collection
        passesSnap.docs.forEach(doc => {
            const data = doc.data();
            const teamId = getString(data, 'teamId');

            let eventName = getString(data, 'eventLabel') || getString(data, 'eventName');

            if (!eventName && Array.isArray(data.selectedEvents) && data.selectedEvents.length > 0) {
                // Map array of slugs like "film-finatics" to "Film Finatics"
                eventName = data.selectedEvents
                    .filter((slug): slug is string => typeof slug === 'string')
                    .map(slug => slug
                        .replace(/[-_]+/g, ' ')
                        .split(' ')
                        .filter(Boolean)
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ')
                    )
                    .join(', ');
            }

            if (teamId && eventName) {
                teamEventMap.set(teamId, eventName);
            }
        });

        // 2nd Pass Event Mapping Fallback: Check 'payments' collection for missing teams
        // Older teams (e.g. Fushion Duo) only stored selectedEvents inside payments, not passes
        const missingEventTeams = Array.from(teamMap.values()).filter(t => {
            const tId = getString(t, 'teamId');
            return tId && !teamEventMap.has(tId);
        });

        if (missingEventTeams.length > 0) {
            const paymentDocs = await Promise.all(
                missingEventTeams.map(async (t) => {
                    const orderId = getString(t as Record<string, unknown>, 'orderId');
                    if (!orderId) return null;
                    const pDoc = await db.collection('payments').doc(orderId).get();
                    if (!pDoc.exists) return null;
                    const data = pDoc.data() as { selectedEvents?: string[] } | undefined;
                    return {
                        teamId: getString(t as Record<string, unknown>, 'teamId'),
                        selectedEvents: data?.selectedEvents
                    };
                })
            );

            for (const pData of paymentDocs) {
                if (pData && pData.teamId && Array.isArray(pData.selectedEvents) && pData.selectedEvents.length > 0) {
                    const fallbackName = pData.selectedEvents
                        .filter((slug): slug is string => typeof slug === 'string')
                        .map((slug: string) => slug
                            .replace(/[-_]+/g, ' ')
                            .split(' ')
                            .filter(Boolean)
                            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(' ')
                        )
                        .join(', ');
                    if (fallbackName) {
                        teamEventMap.set(pData.teamId, fallbackName);
                    }
                }
            }
        }

        const records = [];

        // Attach team info mimicking the old data.records[].team structure that page.tsx expects
        for (const [teamId, teamData] of teamMap.entries()) {
            const membersRaw = teamData.members as Array<Record<string, unknown>> ?? [];
            const paymentStatus = getString(teamData, 'paymentStatus') ?? getString(teamData, 'status') ?? 'success';

            records.push({
                eventName: teamEventMap.get(teamId) || getString(teamData, 'eventName') || 'Team Event',
                passId: getString(teamData, 'passId') || '',
                team: {
                    teamId: teamId,
                    teamName: getString(teamData, 'teamName') || '',
                    leaderName: getString(teamData, 'leaderName') || '',
                    leaderPhone: getString(teamData, 'leaderPhone') || '',
                    totalMembers: getNumber(teamData, 'totalMembers') ?? membersRaw.length,
                    paymentStatus: paymentStatus,
                    isArchived: Boolean(teamData.isArchived),
                    members: membersRaw.map(m => ({
                        memberId: getString(m, 'memberId'),
                        name: getString(m, 'name') || '',
                        phone: getString(m, 'phone') || '',
                        isLeader: Boolean(m.isLeader),
                        checkedIn: Boolean((m.attendance as Record<string, unknown>)?.checkedIn ?? m.checkedIn),
                        checkInTime: getString((m.attendance as Record<string, unknown>) ?? m, 'checkInTime'),
                        checkedInBy: getString((m.attendance as Record<string, unknown>) ?? m, 'checkedInBy'),
                    }))
                }
            });
        }

        return NextResponse.json({ records });
    } catch (error) {
        console.error('Teams API error:', error);
        const message = error instanceof Error ? error.message : 'Server error';
        return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 });
    }
}
