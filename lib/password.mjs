import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const format = /^scrypt-v1:([0-9a-f]{32}):([0-9a-f]{64})$/;

export function isPasswordHash(hash) {
  return typeof hash === 'string' && format.test(hash);
}

export async function hashPassword(password) {
  const length = Buffer.byteLength(password);
  if (length < 16 || length > 1024) {
    throw new Error('Das Passwort muss zwischen 16 und 1024 UTF-8-Bytes lang sein.');
  }
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 32, options);
  return 'scrypt-v1:' + salt.toString('hex') + ':' + hash.toString('hex');
}

export async function verifyPassword(password, hash) {
  const fields = typeof hash === 'string' ? format.exec(hash) : null;
  if (!fields || typeof password !== 'string' || Buffer.byteLength(password) > 1024) return false;
  const actual = await derive(password, Buffer.from(fields[1], 'hex'), 32, options);
  return timingSafeEqual(actual, Buffer.from(fields[2], 'hex'));
}
