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
    async mintToken({ identity, name, room, canPublish = true, metadata = {} }) {
      const { AccessToken } = await getSdk();
      const at = new AccessToken(settings.apiKey, settings.apiSecret, {
        identity: String(identity).toLowerCase(),
        name: name || identity,
        ttl: TOKEN_TTL,
        metadata: JSON.stringify(metadata),
      });
      at.addGrant(videoGrant(room, { canPublish }));
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
