import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateEnv } from './env.validation';

describe('Environment validation (smoke)', () => {
  const example = parse(readFileSync(join(__dirname, '../../.env.example')));

  it('accepts .env.example as-is, so a fresh clone boots after `cp .env.example .env`', () => {
    expect(() => validateEnv(example)).not.toThrow();
  });

  it('refuses to boot with a missing secret or a malformed encryption key', () => {
    const withoutSecret = { ...example };
    delete withoutSecret.JWT_ACCESS_SECRET;
    expect(() => validateEnv(withoutSecret)).toThrow('JWT_ACCESS_SECRET');
    expect(() => validateEnv({ ...example, ENCRYPTION_KEY: 'too-short' })).toThrow(
      'ENCRYPTION_KEY',
    );
  });
});
