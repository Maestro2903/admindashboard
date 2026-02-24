import crypto from 'crypto';

function getEncryptionKey(): Buffer {
    const key = process.env.QR_ENCRYPTION_KEY;
    if (!key || key.length !== 32) {
        throw new Error('FATAL: QR_ENCRYPTION_KEY must be a 32-character string.');
    }
    return Buffer.from(key, 'utf8');
}

/**
 * Encrypts a string using AES-256-CBC.
 * Returns the format `iv:encryptedData` in hex.
 */
export function encrypt(text: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string in the format `iv:encryptedData`.
 */
export function decrypt(encryptedText: string): string {
    const key = getEncryptionKey();
    const [ivHex, dataHex] = encryptedText.split(':');

    if (!ivHex || !dataHex) {
        throw new Error('Invalid encrypted text format. Expected iv:data');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(dataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
