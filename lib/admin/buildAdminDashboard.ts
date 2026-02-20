import * as admin from 'firebase-admin';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import type { AdminDashboardDoc } from '@/lib/db/firestoreTypes';

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

    const payments = paymentsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        paymentId: doc.id,
        amount: Number(d.amount) ?? 0,
        passType: String(d.passType ?? ''),
        status: (d.status === 'success' || d.status === 'failed' ? d.status : 'pending') as 'pending' | 'success' | 'failed',
        createdAt: d.createdAt ?? null,
      };
    });

    const passes = passesSnap.docs.map((doc) => {
      const d = doc.data();
      const usedAt = d.usedAt ?? null;
      const p: {
        passId: string;
        passType: string;
        status: 'paid' | 'used';
        amount: number;
        createdAt: admin.firestore.Timestamp | Date | null;
        usedAt?: admin.firestore.Timestamp | Date | null;
        teamId?: string;
      } = {
        passId: doc.id,
        passType: String(d.passType ?? ''),
        status: (usedAt ? 'used' : 'paid') as 'paid' | 'used',
        amount: Number(d.amount) ?? 0,
        createdAt: d.createdAt ?? null,
      };
      if (usedAt) p.usedAt = usedAt;
      if (d.teamId) p.teamId = d.teamId;
      return p;
    });

    const teams = teamsSnap.docs.map((doc) => {
      const d = doc.data();
      const t: {
        teamId: string;
        teamName: string;
        totalMembers: number;
        paymentStatus: string;
        passId?: string;
      } = {
        teamId: doc.id,
        teamName: String(d.teamName ?? ''),
        totalMembers: Number(d.totalMembers ?? d.members?.length ?? 0),
        paymentStatus: String(d.paymentStatus ?? 'pending'),
      };
      if (d.passId) t.passId = d.passId;
      return t;
    });

    const totalAmountPaid = payments
      .filter((p) => p.status === 'success')
      .reduce((sum, p) => sum + p.amount, 0);

    const filterPassTypes = [...new Set(passes.map((p) => p.passType).filter(Boolean))];
    const filterPaymentStatuses = [...new Set(payments.map((p) => p.status).filter(Boolean))];

    const docData = {
      userId,
      profile,
      payments,
      passes: passes as AdminDashboardDoc['passes'],
      teams,
      summary: {
        totalPayments: payments.length,
        totalAmountPaid,
        totalPasses: passes.length,
        totalTeams: teams.length,
      },
      filterPassTypes,
      filterPaymentStatuses,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    } as Omit<AdminDashboardDoc, 'updatedAt'> & { updatedAt: admin.firestore.FieldValue };

    await db.collection('admin_dashboard').doc(userId).set(docData);
  } catch (err) {
    console.error(`[buildAdminDashboard] Error rebuilding for user ${userId}:`, err);
  }
}
