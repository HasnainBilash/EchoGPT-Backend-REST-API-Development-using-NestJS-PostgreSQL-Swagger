import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppConfig } from '../../config/configuration';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

/**
 * AES-256-GCM encryption for secrets stored in the database (AI provider API keys).
 * Stored format: `v1:<iv>:<authTag>:<ciphertext>` (base64). GCM's auth tag means a tampered
 * value fails to decrypt instead of producing garbage.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService<AppConfig, true>) {
    this.key = Buffer.from(config.get('crypto', { infer: true }).encryptionKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv, tag, ciphertext]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
      .join(':');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split(':');
    if (version !== VERSION || !iv || !tag || !ciphertext) {
      throw new InternalServerErrorException('Stored secret has an unknown format');
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Stored secret could not be decrypted (was ENCRYPTION_KEY changed?)',
      );
    }
  }
}
