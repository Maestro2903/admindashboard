/**
 * QR Code signing utilities.
 */

import crypto from 'crypto';

function getQrSecret(): string {
  const rawQrSecret = process.env.QR_SECRET_KEY;
  if (!rawQrSecret) {
    throw new Error('FATAL: QR_SECRET_KEY environment variable is not set. QR generation is disabled.');
  }
  return rawQrSecret;
}

export function createSignedQR(passId: string, expiryDays: number = 30): string {
  const QR_SECRET = getQrSecret();
  const expiry = Date.now() + expiryDays * 24 * 60 * 60 * 1000;
  const payload = `${passId}:${expiry}`;

  const signature = crypto
    .createHmac('sha256', QR_SECRET)
    .update(payload)
    .digest('hex')
    .substring(0, 16);

  return `${payload}.${signature}`;
}

/**
 * Verifies a signed QR token. Returns { valid: true, passId } if signature is valid and not expired.
 */
export function verifySignedQR(token: string): { valid: true; passId: string } | { valid: false } {
  try {
    const rawQrSecret = process.env.QR_SECRET_KEY;
    if (!rawQrSecret) return { valid: false };

    const lastDot = token.lastIndexOf('.');
    if (lastDot === -1) return { valid: false };
    const payload = token.substring(0, lastDot);
    const signature = token.substring(lastDot + 1);

    const expected = crypto
      .createHmac('sha256', rawQrSecret)
      .update(payload)
      .digest('hex')
      .substring(0, 16);
    if (signature !== expected) return { valid: false };

    const colon = payload.indexOf(':');
    if (colon === -1) return { valid: false };
    const passId = payload.substring(0, colon);
    const expiry = parseInt(payload.substring(colon + 1), 10);
    if (!passId || !Number.isFinite(expiry) || Date.now() > expiry) return { valid: false };

    return { valid: true, passId };
  } catch {
    return { valid: false };
  }
}

export function createQRPayload(passId: string, userId: string, passType: string): string {
  const signedToken = createSignedQR(passId);

  return JSON.stringify({
    passId,
    userId,
    passType,
    token: signedToken,
  });
}
