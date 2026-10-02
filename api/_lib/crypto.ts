/**
 * Token Encryption & Decryption Helper
 * Uses industry-standard AES-256-GCM for authenticated encryption at rest.
 * Ensures social tokens are never stored in plaintext in PostgreSQL.
 */

import crypto from 'crypto';

// Standard 32-byte key derivation for AES-256
function getEncryptionKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('Server error: TOKEN_ENCRYPTION_KEY belum dikonfigurasi di environment variables.');
  }

  // If secret is already 64 hex characters (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }

  // Otherwise, deterministically hash with SHA-256 to ensure exact 32 bytes
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts plaintext token using AES-256-GCM
 * Output format: `iv.authTag.ciphertext` (all in hex)
 */
export function encryptToken(plainText: string): string {
  if (!plainText) return '';

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Recommended 12 bytes IV for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}.${authTag.toString('hex')}.${encrypted.toString('hex')}`;
}

/**
 * Decrypts AES-256-GCM encrypted token
 * Verifies authenticity tag; throws error if ciphertext has been tampered with.
 */
export function decryptToken(encryptedString: string): string {
  if (!encryptedString) return '';

  const parts = encryptedString.split('.');
  if (parts.length !== 3) {
    throw new Error('Format token terenkripsi tidak valid.');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}
