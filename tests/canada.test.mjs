import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANADIAN_PROVINCES, formatCanadianPostal } from '../src/canada.js';

test('Canadian province/territory list covers 13 jurisdictions with Ontario', () => {
  assert.equal(CANADIAN_PROVINCES.length, 13);
  assert.equal(new Set(CANADIAN_PROVINCES.map(p => p.code)).size, 13);
  assert.equal(CANADIAN_PROVINCES.find(p => p.code === 'ON')?.name, 'Ontario');
});

test('formats Canadian postal code consistently', () => {
  assert.equal(formatCanadianPostal('k1a0b1'), 'K1A 0B1');
  assert.equal(formatCanadianPostal('m5v 2t6'), 'M5V 2T6');
  assert.equal(formatCanadianPostal('h2x-1y4'), 'H2X 1Y4');
});
