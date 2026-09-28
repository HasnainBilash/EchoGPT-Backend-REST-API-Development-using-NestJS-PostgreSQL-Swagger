import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../common/crypto/encryption.service';
import { AppConfig } from '../config/configuration';
import { ProviderRequestError, requestJson } from './adapters/provider-http';

const configWithKey = (hex: string) =>
  ({ get: () => ({ encryptionKey: hex }) }) as unknown as ConfigService<AppConfig, true>;

describe('Provider secrets & vendor calls (smoke)', () => {
  const encryption = new EncryptionService(configWithKey('a'.repeat(64)));

  it('encrypts API keys so the stored value never contains the key, and decrypts them back', () => {
    const stored = encryption.encrypt('sk-secret-123456');

    expect(stored).not.toContain('sk-secret');
    expect(stored.startsWith('v1:')).toBe(true);
    expect(encryption.decrypt(stored)).toBe('sk-secret-123456');
    // A fresh random IV each time: same key, different ciphertext.
    expect(encryption.encrypt('sk-secret-123456')).not.toBe(stored);
  });

  it('refuses tampered values and values encrypted with another key', () => {
    const stored = encryption.encrypt('sk-secret-123456');
    const [v, iv, tag, data] = stored.split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 0xff;

    expect(() => encryption.decrypt([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow(
      InternalServerErrorException,
    );
    const otherKey = new EncryptionService(configWithKey('b'.repeat(64)));
    expect(() => otherKey.decrypt(stored)).toThrow(InternalServerErrorException);
  });

  it('turns a vendor 401 into a readable "invalid API key" error', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), {
        status: 401,
      }),
    );

    const call = requestJson('https://api.example.com/models', {});
    await expect(call).rejects.toBeInstanceOf(ProviderRequestError);
    await expect(call).rejects.toMatchObject({
      status: 401,
      message: 'Invalid or unauthorized API key (HTTP 401): Incorrect API key provided',
    });
    fetchMock.mockRestore();
  });
});
