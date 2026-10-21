// LiveKit — konfiguracja i cienka warstwa nad livekit-server-sdk (token, webhook, RoomService).
// SDK ładowane leniwie: brak kluczy (połączenia wyłączone) nie wymaga nawet modułu.
import { config } from '../config.js';
import { TOKEN_TTL, videoGrant } from './logic.js';

export const CALLS_DISABLED = { error: 'Połączenia audio i wideo nie są włączone na tym serwerze.', code: 'calls_disabled' };

// env → { enabled, url, host, apiKey, apiSecret }. env wstrzykiwany w testach.
export function livekitSettings(env = config) {
  const apiKey = String(env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(env.LIVEKIT_API_SECRET || '').trim();
  const domain = String(env.APP_DOMAIN || 'localhost').trim();
  const url = String(env.LIVEKIT_URL || '').trim() || `wss://rtc.${domain}`;
  const host = String(env.LIVEKIT_HOST || '').trim() || 'http://livekit:7880';
  return { enabled: !!(apiKey && apiSecret), url, host, apiKey, apiSecret };
}

let sdkPromise = null;
export function loadSdk() {
  if (!sdkPromise) sdkPromise = import('livekit-server-sdk').catch((err) => { sdkPromise = null; throw err; });
  return sdkPromise;
}

// Klient LiveKit dla serwisu połączeń. sdk/settings wstrzykiwane w testach.
export function createLivekit({ settings = livekitSettings(), sdk = null } = {}) {
  const getSdk = async () => sdk || loadSdk();
  let rooms = null;
  const roomService = async () => {
    if (!rooms) {
      const { RoomServiceClient } = await getSdk();
      rooms = new RoomServiceClient(settings.host, settings.apiKey, settings.apiSecret);
    }
    return rooms;
  };

  return {
    settings,
    get enabled() { return settings.enabled; },

    // Token dostępu: tożsamość = e-mail (małymi literami), tylko ten pokój, ważny 2 h.
    // Gość (guests.js): tożsamość guest:<hex>, krótszy ttl, bez kanału danych.
    // Tłumaczenie (src/interpretation): hidden — słuchacz niewidoczny; canPublishSources — np. tylko
    // mikrofon (nazwy jak w kliencie: 'microphone', 'camera'… → enum TrackSource SDK).
    async mintToken({ identity, name, room, canPublish = true, canPublishData, hidden, canPublishSources, ttl = TOKEN_TTL, metadata = {} }) {
      const lk = await getSdk();
      const at = new lk.AccessToken(settings.apiKey, settings.apiSecret, {
        identity: String(identity).toLowerCase(),
        name: name || identity,
        ttl,
        metadata: JSON.stringify(metadata),
      });
      const grant = videoGrant(room, { canPublish, canPublishData, hidden, canPublishSources });
      if (grant.canPublishSources) {
        const TS = lk.TrackSource || {};
        grant.canPublishSources = grant.canPublishSources.map((s) => TS[String(s).toUpperCase()]).filter((v) => v !== undefined);
      }
      at.addGrant(grant);
      return at.toJwt();
    },

    // Weryfikacja webhooka (podpis JWT z sha256 surowego body) → zdarzenie albo wyjątek.
    async receiveWebhook(rawBody, authHeader) {
      const { WebhookReceiver } = await getSdk();
      const receiver = new WebhookReceiver(settings.apiKey, settings.apiSecret);
      return receiver.receive(String(rawBody ?? ''), authHeader || undefined);
    },

    // Zamknięcie pokoju (rozłącza wszystkich). Brak pokoju / LiveKit niedostępny — bez błędu.
    async deleteRoom(room) {
      try {
        await (await roomService()).deleteRoom(room);
        return true;
      } catch {
        return false;
      }
    },

    // Usunięcie jednej osoby z pokoju (np. gość po wyłączeniu linku). Bez błędu, gdy jej nie ma.
    async removeParticipant(room, identity) {
      try {
        await (await roomService()).removeParticipant(room, identity);
        return true;
      } catch {
        return false;
      }
    },

    // Jawne założenie pokoju z własnym limitem osób (tłumaczenie: setki słuchaczy — globalny
    // max_participants z konfiguracji LiveKit dotyczy pokoi zakładanych przez wejście uczestnika).
    // Istniejący pokój LiveKit zwraca bez błędu. → true | false (LiveKit niedostępny).
    async createRoom({ name, maxParticipants, emptyTimeout, departureTimeout, metadata } = {}) {
      try {
        await (await roomService()).createRoom({
          name,
          ...(maxParticipants ? { maxParticipants } : {}),
          ...(emptyTimeout ? { emptyTimeout } : {}),
          ...(departureTimeout ? { departureTimeout } : {}),
          ...(metadata !== undefined ? { metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata) } : {}),
        });
        return true;
      } catch {
        return false;
      }
    },

    // Uczestnicy pokoju (także ukryci) w prostym kształcie:
    //   [{ identity, name, hidden, tracks: [{ sid, kind: 'audio'|'video', source, muted }] }]
    // [] — pokoju nie ma; null — LiveKit nie odpowiada.
    async listParticipants(room) {
      let lk;
      try { lk = await getSdk(); } catch { return null; }
      const TT = lk.TrackType || {};
      const TS = lk.TrackSource || {};
      const kindOf = (t) => (t === TT.AUDIO ? 'audio' : t === TT.VIDEO ? 'video' : String(t ?? '').toLowerCase());
      const sourceOf = (s) => (typeof s === 'number' ? String(TS[s] || '').toLowerCase() : String(s ?? '').toLowerCase());
      try {
        const list = await (await roomService()).listParticipants(room);
        return (list || []).map((p) => ({
          identity: String(p.identity || '').toLowerCase(),
          name: p.name || '',
          hidden: !!p.permission?.hidden,
          tracks: (p.tracks || []).map((t) => ({ sid: t.sid, kind: kindOf(t.type), source: sourceOf(t.source), muted: !!t.muted })),
        }));
      } catch (err) {
        // Pokój nie istnieje (nikt nie wszedł / zamknięty) — to nie awaria.
        if (err?.status === 404 || err?.code === 'not_found' || /not.?found|does not exist/i.test(String(err?.message || ''))) return [];
        return null;
      }
    },

    // Wyciszenie opublikowanej ścieżki (zmiana tłumacza). Wyciszać może serwer zawsze; odciszyć —
    // tylko sam uczestnik (bez enable_remote_unmute). → true | false.
    async mutePublishedTrack(room, identity, trackSid, muted = true) {
      try {
        await (await roomService()).mutePublishedTrack(room, identity, trackSid, !!muted);
        return true;
      } catch {
        return false;
      }
    },

    // Metadane pokoju (np. { active: e-mail tłumacza }) — klienci dostają RoomMetadataChanged.
    async updateRoomMetadata(room, metadata) {
      try {
        await (await roomService()).updateRoomMetadata(room, typeof metadata === 'string' ? metadata : JSON.stringify(metadata ?? {}));
        return true;
      } catch {
        return false;
      }
    },

    // Liczba osób w pokojach: Map(nazwa → liczba) albo null, gdy LiveKit nie odpowiada.
    async roomOccupancy(names) {
      try {
        const list = await (await roomService()).listRooms(names?.length ? names : undefined);
        return new Map((list || []).map((r) => [r.name, Number(r.numParticipants ?? 0)]));
      } catch {
        return null;
      }
    },
  };
}

let shared = null;
export function getLivekit() {
  if (!shared) shared = createLivekit();
  return shared;
}
