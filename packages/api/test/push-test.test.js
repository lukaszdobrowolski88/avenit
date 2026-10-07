// Diagnoza testu powiadomień — zrozumiałe komunikaty zamiast surowych błędów Expo/web-push.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainPushError } from '../src/fn/push-test.js';

test('brak kluczy APNs → wyjaśnienie dla administratora', () => {
  assert.match(explainPushError('Could not find APNs credentials for pl.avenit.app.preview'), /Apple \(APNs\)/);
});
test('wygasła subskrypcja przeglądarki i niezarejestrowany telefon', () => {
  assert.match(explainPushError('Received unexpected response code 410'), /wygasła/);
  assert.match(explainPushError('DeviceNotRegistered'), /zaloguj się ponownie/);
});
