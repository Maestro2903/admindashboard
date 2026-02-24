import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireAdminRole, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { logAdminAction } from '@/lib/admin/adminLogger';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import * as admin from 'firebase-admin';

const bodySchema = z.object({
    email: z.string().email(),
    role: z.enum(['viewer', 'manager', 'superadmin']),
});

export async function POST(req: NextRequest) {
    const rl = await rateLimitAdmin(req, 'mutation');
    if (rl.limited) return rateLimitResponse(rl);

    try {
        const result = await requireAdminRole(req);
        if (result instanceof Response) return result;
        if (result.adminRole !== 'superadmin') return forbiddenRole();

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
        const { email, role } = parse.data;

        // First try to resolve user by email via Auth to map to the correct user document
        let uidToUpdate = null;
        let authName = '';

        try {
            const authUser = await admin.auth().getUserByEmail(email);
            uidToUpdate = authUser.uid;
            authName = authUser.displayName || '';
        } catch (e: any) {
            // Firebase auth user might not exist, but let's query the `users` collection specifically 
            // in case it's a test user or auth lookup failed
            const valErr = e as { code?: string };
            if (valErr.code !== 'auth/user-not-found') {
                throw e;
            }
        }

        const db = getAdminFirestore();

        // If Auth lookup failed, do a Firestore lookup to resolve the document ID
        if (!uidToUpdate) {
            const usersQ = await db.collection('users').where('email', '==', email).limit(1).get();
            if (usersQ.empty) {
                return Response.json({ error: 'User with that email not found' }, { status: 404 });
            }
            uidToUpdate = usersQ.docs[0].id;
        }

        // Now we have a specific UID, let's verify if the `users` document actually exists
        const userRef = db.collection('users').doc(uidToUpdate);
        const userSnap = await userRef.get();

        let previousData = {};
        if (userSnap.exists) {
            previousData = userSnap.data() as Record<string, unknown>;
        }

        const updates = {
            adminRole: role,
            isOrganizer: true,
            updatedAt: new Date(),
        };

        // Use set with merge in case the user didn't register completely on firestore yet
        await userRef.set(updates, { merge: true });

        const newSnap = await userRef.get();
        const newData = newSnap.data() as Record<string, unknown>;

        const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
        const ip = typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined;

        await logAdminAction(db, {
            adminId: result.uid,
            action: 'assign-role',
            targetCollection: 'users',
            targetId: uidToUpdate,
            previousData,
            newData,
            ipAddress: ip,
        });

        return Response.json({
            success: true,
            email,
            role: newData.adminRole,
        });
    } catch (error) {
        console.error('Assign role API error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Server error' },
            { status: 500 }
        );
    }
}
