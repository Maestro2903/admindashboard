/**
 * Cashfree Payment Gateway API config.
 * Required: x-api-version 2025-01-01 (2023-08-01 returns "transactions are not enabled").
 */
export const CASHFREE_API_VERSION = '2025-01-01' as const;

export const CASHFREE_BASE_URL =
    process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';

export function getCashfreeOrderHeaders(appId: string, secret: string) {
    return {
        'x-client-id': appId,
        'x-client-secret': secret,
        'x-api-version': CASHFREE_API_VERSION,
        'Content-Type': 'application/json',
    };
}
