import type * as admin from 'firebase-admin';

const SENSITIVE_KEYS = new Set([
  'amount',
  'qrCode',
  'token',
  'signature',
  'secret',
  'password',
  'cashfreeOrderId',
  'paymentId',
]);

function sanitizeForLog(data: unknown): Record<string, unknown> {
  if (data == null || typeof data !== 'object') {
    return { _value: data };
  }
  const obj = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      const sub = value as Record<string, unknown>;
      if (typeof sub.toDate === 'function') {
        out[key] = (sub.toDate as () => Date)().toISOString();
      } else {
        out[key] = sanitizeForLog(value);
      }
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) => (item != null && typeof item === 'object' ? sanitizeForLog(item) : item));
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface AdminLogEntry {
  adminId: string;
  action: string;
  targetCollection: string;
  targetId: string;
  previousData: Record<string, unknown>;
  newData: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAdminAction(
  db: admin.firestore.Firestore,
  entry: AdminLogEntry
): Promise<void> {
  const doc = {
    ...entry,
    previousData: sanitizeForLog(entry.previousData),
    newData: sanitizeForLog(entry.newData),
    timestamp: new Date(),
  };
  await db.collection('admin_logs').add(doc);
}
