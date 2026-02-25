import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import {
  requireAdminRole,
  requireSuperAdmin,
  forbiddenRole,
} from '@/lib/admin/requireAdminRole';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

const bodySchema = z.object({
    orderId: z.string().min(1),
});

export async function POST(req: NextRequest) {
    const rl = await rateLimitAdmin(req, 'mutation');
    if (rl.limited) return rateLimitResponse(rl);

    try {
        const result = await requireAdminRole(req);
        if (result instanceof Response) return result;
        if (!requireSuperAdmin(result.adminRole)) return forbiddenRole();

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
            return Response.json({ error: 'Validation failed' }, { status: 400 });
        }
        const { orderId } = parsed.data;

        // Call centralized fix-stuck-payment
        const host = req.headers.get('host') || 'localhost:3000';
        const isLocalhost = host.includes('localhost') || host.startsWith('127.0.0.1');
        const protocol = isLocalhost ? 'http' : 'https';

        let baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
        if (!baseUrl) {
            baseUrl = `${protocol}://${host}`;
        }
        baseUrl = baseUrl.replace(/\/$/, '');

        // Enforce HTTPS in prod to avoid redirects losing Auth header
        if (!isLocalhost && baseUrl.startsWith('http://')) {
            baseUrl = baseUrl.replace('http://', 'https://');
        }

        const authHeader = req.headers.get('Authorization') || '';

        const verifyRes = await fetch(`${baseUrl}/api/fix-stuck-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader,
            },
            body: JSON.stringify({ orderId }),
        });

        const verifyData = await verifyRes.json();

        if (!verifyRes.ok) {
            return Response.json({
                error: verifyData.error || 'Verification failed',
                details: verifyData
            }, { status: verifyRes.status });
        }

        // Successfully verified, now update the status in onspot_student_registrations
        const db = getAdminFirestore();
        await db.collection('onspot_student_registrations').doc(orderId).update({
            status: 'success',
            updatedAt: new Date()
        });

        return Response.json({
            success: true,
            message: 'On-spot registration verified and pass issued',
            details: verifyData
        });

    } catch (error) {
        console.error('On-spot verify error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Server error' },
            { status: 500 }
        );
    }
}
