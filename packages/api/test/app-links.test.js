// Universal Links (iOS) / App Links (Android): /.well-known/apple-app-site-association
// i /.well-known/assetlinks.json — 200, application/json, bez przekierowań, ta sama treść
// na każdym hoście (domena główna, subdomena kościoła, nieznany host), zakres ścieżek
// tłumaczenia (konsola/oryginał wykluczone, przed wpisami włączającymi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import appLinksRoutes, {
  APPLE_TEAM_ID,
  ANDROID_PACKAGE,
  ANDROID_SHA256_FINGERPRINTS,
  INTERP_TOKEN_LENGTH,
  appleAppSiteAssociation,
} from '../src/public/app-links.js';
import { newPublicToken } from '../src/interpretation/logic.js';

async function server() {
  const app = Fastify();
  await app.register(appLinksRoutes);
  return app;
}

const HOSTS = ['avenit.pl', 'schwro.avenit.pl', 'app.avenit.pl', 'api.avenit.pl', 'nieznany.avenit.pl'];

test('AASA: 200 + application/json na każdym hoście, bez przekierowania', async () => {
  const app = await server();
  for (const host of HOSTS) {
    const res = await app.inject({ method: 'GET', url: '/.well-known/apple-app-site-association', headers: { host } });
    assert.equal(res.statusCode, 200, host);
    assert.match(res.headers['content-type'], /^application\/json/, host);
    assert.equal(res.headers.location, undefined);
    const body = JSON.parse(res.body);
    assert.deepEqual(body, appleAppSiteAssociation());
  }
  await app.close();
});

test('AASA: aplikacja produkcyjna i zakres ścieżek (wykluczenia przed włączeniami)', () => {
  const d = appleAppSiteAssociation().applinks.details;
  assert.equal(d.length, 1);
  assert.ok(d[0].appIDs.includes(`${APPLE_TEAM_ID}.pl.avenit.app`));
  assert.ok(d[0].appIDs.every((id) => id.startsWith(`${APPLE_TEAM_ID}.pl.avenit.app`)));
  const c = d[0].components;
  const paths = c.map((x) => x['/']);
  const iKonsola = paths.indexOf('/tlumaczenie/konsola/*');
  const iOryginal = paths.indexOf('/tlumaczenie/oryginal/*');
  const iSluchaj = paths.indexOf('/tlumaczenie/sluchaj/*');
  const iToken = paths.findIndex((p) => /^\/tlumaczenie\/\?+$/.test(p));
  assert.ok(iKonsola >= 0 && c[iKonsola].exclude === true);
  assert.ok(iOryginal >= 0 && c[iOryginal].exclude === true);
  assert.ok(iSluchaj >= 0 && !c[iSluchaj].exclude);
  assert.ok(iToken >= 0 && !c[iToken].exclude);
  assert.ok(Math.max(iKonsola, iOryginal) < Math.min(iSluchaj, iToken));
  // Wzorzec tokenu = dokładnie tyle znaków, ile ma token z newPublicToken().
  assert.equal(paths[iToken].length - '/tlumaczenie/'.length, INTERP_TOKEN_LENGTH);
  assert.equal(newPublicToken().length, INTERP_TOKEN_LENGTH);
});

test('assetlinks.json: 200 + application/json, pakiet i odciski SHA-256', async () => {
  const app = await server();
  for (const host of HOSTS) {
    const res = await app.inject({ method: 'GET', url: '/.well-known/assetlinks.json', headers: { host } });
    assert.equal(res.statusCode, 200, host);
    assert.match(res.headers['content-type'], /^application\/json/, host);
    const body = JSON.parse(res.body);
    assert.equal(body.length, 1);
    assert.deepEqual(body[0].relation, ['delegate_permission/common.handle_all_urls']);
    assert.equal(body[0].target.namespace, 'android_app');
    assert.equal(body[0].target.package_name, ANDROID_PACKAGE);
    assert.deepEqual(body[0].target.sha256_cert_fingerprints, ANDROID_SHA256_FINGERPRINTS);
  }
  assert.ok(ANDROID_SHA256_FINGERPRINTS.length >= 2);
  for (const fp of ANDROID_SHA256_FINGERPRINTS) assert.match(fp, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  assert.equal(new Set(ANDROID_SHA256_FINGERPRINTS).size, ANDROID_SHA256_FINGERPRINTS.length);
  await app.close();
});

test('inne ścieżki /.well-known nie są obsługiwane (404, nie SPA)', async () => {
  const app = await server();
  const res = await app.inject({ method: 'GET', url: '/.well-known/apple-app-site-association.json', headers: { host: 'schwro.avenit.pl' } });
  assert.equal(res.statusCode, 404);
  await app.close();
});
