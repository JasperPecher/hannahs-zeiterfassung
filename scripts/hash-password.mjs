import { readFileSync } from 'node:fs';
import { hashPassword } from '../lib/password.mjs';

try {
  if (process.stdin.isTTY) throw new Error('Bitte verwende den verdeckten Eingabebefehl aus der README.');
  console.log(await hashPassword(readFileSync(0, 'utf8')));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
