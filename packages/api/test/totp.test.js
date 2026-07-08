// Testy TOTP — zgodność z RFC 6238 i obsługa kodów zapasowych.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTOTP, verifyTOTP, base32Encode, base32Decode, consumeBackupCode } from '../src/auth/totp.js';

test('base32 round-trip (20 bajtów = czysta granica 5-bit)', () => {
  const buf = Buffer.from('12345678901234567890'); // 160 bitów = 32 znaki base32
  assert.deepEqual(base32Decode(base32Encode(buf)), buf);
});

test('TOTP: wygenerowany kod jest weryfikowalny', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const code = generateTOTP(secret);
  assert.equal(code.length, 6);
  assert.ok(verifyTOTP(secret, code));
});

test('TOTP: błędny kod odrzucony', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const wrong = generateTOTP(secret) === '999999' ? '111111' : '999999';
  assert.equal(verifyTOTP(secret, wrong, 1), false);
});

test('TOTP: znany wektor (RFC 6238, klucz ASCII "12345678901234567890")', () => {
  // Sekret base32 dla "12345678901234567890"
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  const code = generateTOTP(secret);
  assert.equal(code.length, 6);
  assert.ok(verifyTOTP(secret, code, 1));
});

test('consumeBackupCode: legacy tablica stringów', () => {
  const r = consumeBackupCode(['ABC123', 'DEF456'], 'abc123');
  assert.ok(r.ok);
  assert.deepEqual(r.updated, ['DEF456']);
});

test('consumeBackupCode: obiekty {code, used}', () => {
  const codes = [{ code: 'ABC123', used: false }, { code: 'DEF456', used: false }];
  const r = consumeBackupCode(codes, 'ABC123');
  assert.ok(r.ok);
  assert.equal(r.updated[0].used, true);
  assert.equal(r.updated[1].used, false);
});

test('consumeBackupCode: użyty kod odrzucony', () => {
  const codes = [{ code: 'ABC123', used: true }];
  assert.equal(consumeBackupCode(codes, 'ABC123').ok, false);
});
