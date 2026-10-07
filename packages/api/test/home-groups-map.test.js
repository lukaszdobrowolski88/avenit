// Mapa grup domowych: geokodowanie zawężone do Polski, pomyłki geokodera odrzucane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPoland, geocodeUrl, viewboxFor } from '../src/fn/home-groups-map.js';

test('punkty spoza Polski są odrzucane', () => {
  assert.equal(inPoland(51.11, 17.03), true);   // Wrocław
  assert.equal(inPoland(36.78, -119.42), false); // Kalifornia
  assert.equal(inPoland(null, null), false);
  assert.equal(inPoland('51.1', '17.0'), true);
});

test('adres wyszukiwania ma countrycodes=pl i opcjonalny viewbox', () => {
  const u = new URL(geocodeUrl('Leśnica', '16.4,51.7,17.6,50.5'));
  assert.equal(u.searchParams.get('countrycodes'), 'pl');
  assert.equal(u.searchParams.get('q'), 'Leśnica');
  assert.equal(u.searchParams.get('viewbox'), '16.4,51.7,17.6,50.5');
  assert.equal(new URL(geocodeUrl('Brochów')).searchParams.get('viewbox'), null);
});

test('viewbox wokół mediany znanych grup (pomyłki spoza Polski pomijane)', () => {
  const vb = viewboxFor([{ lat: 51.1, lon: 17.0 }, { lat: 51.2, lon: 17.1 }, { lat: 51.15, lon: 17.05 }, { lat: 36.7, lon: -119.4 }]);
  assert.equal(vb, '16.4500,51.7500,17.6500,50.5500');
  assert.equal(viewboxFor([]), null);
});
