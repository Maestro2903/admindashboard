import * as admin from 'firebase-admin';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import type { AdminDashboardDoc } from '@/lib/db/firestoreTypes';
import {
  getEventIdsFromPass,
  getEventIdsFromPayment,
  getEventIdsFromTeam,
  resolveEventCategoryType,
  type EventInfo,
} from '@/lib/events/eventResolution';

function getString(d: Record<string, unknown>, key: string): string | undefined {
  const v = d[key];
  return typeof v === 'string' ? v : undefined;
}

export async function rebuildAdminDashboardForUser(userId: string): Promise<void> {
  try {
    const db = getAdminFirestore();

    const [userSnap, paymentsSnap, passesSnap, teamsSnap] = await Promise.all([
      db.collection('users').doc(userId).get(),
      db.collection('payments').where('userId', '==', userId).get(),
      db.collection('passes').where('userId', '==', userId).get(),
      db.collection('teams').where('leaderId', '==', userId).get(),
    ]);

    const userData = userSnap.exists ? userSnap.data() : null;
    const profile = {
      name: userData?.name ?? '',
      email: userData?.email ?? '',
      phone: userData?.phone ?? '',
      college: userData?.college ?? '',
      isOrganizer: userData?.isOrganizer ?? false,
      createdAt: userData?.createdAt ?? null,
    };

    const allEventIds = new Set<string>();
    const payments = paymentsSnap.docs.map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      const eventIds = getEventIdsFromPayment(d);
      eventIds.forEach((id) => allEventIds.add(id));
      const item: AdminDashboardDoc['payments'][number] = {
        paymentId: doc.id,
        amount: Number(d.amount) ?? 0,
        passType: String(d.passType ?? ''),
        status: (d.status === 'success' || d.status === 'failed' ? d.status : 'pending') as 'pending' | 'success' | 'failed',
        createdAt: (d.createdAt ?? null) as AdminDashboardDoc['payments'][number]['createdAt'],
      };
      if (eventIds.length > 0) item.eventIds = eventIds;
      if (getString(d, 'eventCategory')) item.eventCategory = getString(d, 'eventCategory');
      if (getString(d, 'eventType')) item.eventType = getString(d, 'eventType');
      return item;
    });

    const passes = passesSnap.docs.map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      const eventIds = getEventIdsFromPass(d);
      eventIds.forEach((id) => allEventIds.add(id));
      const usedAt = d.usedAt ?? null;
      const p: AdminDashboardDoc['passes'][number] = {
        passId: doc.id,
        passType: String(d.passType ?? ''),
        status: (usedAt ? 'used' : 'paid') as 'paid' | 'used',
        amount: Number(d.amount) ?? 0,
        createdAt: (d.createdAt ?? null) as AdminDashboardDoc['passes'][number]['createdAt'],
      };
      if (usedAt) p.usedAt = usedAt as AdminDashboardDoc['passes'][number]['usedAt'];
      if (d.teamId) p.teamId = d.teamId as string;
      if (eventIds.length > 0) p.eventIds = eventIds;
      if (getString(d, 'eventCategory')) p.eventCategory = getString(d, 'eventCategory');
      if (getString(d, 'eventType')) p.eventType = getString(d, 'eventType');
      return p;
    });

    const eventsById = new Map<string, EventInfo>();
    if (allEventIds.size > 0) {
      const eventDocs = await Promise.all(
        [...allEventIds].map((id) => db.collection('events').doc(id).get())
      );
      eventDocs.forEach((snap) => {
        if (!snap.exists) return;
        const d = snap.data() as Record<string, unknown>;
        eventsById.set(snap.id, {
          id: snap.id,
          name: getString(d, 'name') ?? getString(d, 'title'),
          category: getString(d, 'category'),
          type: getString(d, 'type'),
        });
      });
    }

    const filterEventCategories = new Set<string>();
    const filterEventTypes = new Set<string>();
    for (const p of passes) {
      const d = passesSnap.docs.find((doc) => doc.id === p.passId)?.data() as Record<string, unknown> | undefined;
      if (d) {
        const eventIds = p.eventIds ?? getEventIdsFromPass(d);
        const { eventCategory, eventType } = resolveEventCategoryType(d, eventIds, eventsById);
        if (eventCategory) filterEventCategories.add(eventCategory);
        if (eventType) filterEventTypes.add(eventType);
      }
    }
    for (const pay of payments) {
      if (pay.eventCategory) filterEventCategories.add(pay.eventCategory);
      if (pay.eventType) filterEventTypes.add(pay.eventType);
    }

    const teams = teamsSnap.docs.map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      const eventIds = getEventIdsFromTeam(d);
      const t: AdminDashboardDoc['teams'][number] = {
        teamId: doc.id,
        teamName: String(d.teamName ?? ''),
        totalMembers: Number(d.totalMembers ?? (Array.isArray(d.members) ? d.members.length : 0)),
        paymentStatus: String(d.paymentStatus ?? d.status ?? 'pending'),
      };
      if (d.passId) t.passId = d.passId as string;
      if (eventIds.length > 0) t.eventIds = eventIds;
      return t;
    });

    const totalAmountPaid = payments
      .filter((p) => p.status === 'success')
      .reduce((sum, p) => sum + p.amount, 0);

    const filterPassTypes = [...new Set(passes.map((p) => p.passType).filter(Boolean))];
    const filterPaymentStatuses = [...new Set(payments.map((p) => p.status).filter(Boolean))];
    const filterEventIds = [...allEventIds];
    const docData = {
      userId,
      profile,
      payments,
      passes,
      teams,
      summary: {
        totalPayments: payments.length,
        totalAmountPaid,
        totalPasses: passes.length,
        totalTeams: teams.length,
      },
      filterPassTypes,
      filterPaymentStatuses,
      filterEventIds: filterEventIds.length > 0 ? filterEventIds : undefined,
      filterEventCategories: filterEventCategories.size > 0 ? [...filterEventCategories] : undefined,
      filterEventTypes: filterEventTypes.size > 0 ? [...filterEventTypes] : undefined,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    } as Omit<AdminDashboardDoc, 'updatedAt'> & { updatedAt: admin.firestore.FieldValue };

    await db.collection('admin_dashboard').doc(userId).set(docData);
  } catch (err) {
    console.error(`[buildAdminDashboard] Error rebuilding for user ${userId}:`, err);
  }
}
