# Komunikator – rozbudowa „WhatsApp dla kościoła"

Backend + web zrobione w sesji `feat/komunikator-whatsapp`. Ten dokument to **kontrakt dla apki mobilnej** (`packages/mobile/src/features/messenger/`) — co doszło w schemacie i jak to konsumować, by osiągnąć parytet z webem.

> ✅ **Schemat jest już na VPS** (tenant-migracje, zastosowane na schwro):
> - `packages/api/db/tenant-migrations/064_komunikator_whatsapp.sql` — SAMO DDL pod czysty Postgres (bez RLS `auth.jwt()`, bez `ALTER PUBLICATION`, bez DB-triggerów).
> - `packages/api/db/tenant-migrations/065_komunikator_member_grants.sql` — granty członka na `res:poll_votes:*` / `res:prayer_responses:*`.
> - `poll_votes` i `prayer_responses` zarejestrowane w `packages/api/src/dataapi/registry.js` (fail-closed allowlist) — inaczej `.from()` zwraca 403.
>
> Dostęp, realtime i push obsługuje **warstwa API** (nie Supabase RLS/triggery). Oryginalne pliki `migrations/komunikator_whatsapp_*.sql` (Supabase) zostały usunięte jako nieaktualne.

---

## 1. Zmiany w schemacie

### `conversations`
| Kolumna | Typ | Znaczenie |
|---|---|---|
| `description` | TEXT | opis grupy/kanału |
| `posting_policy` | TEXT `'everyone'`\|`'admins'` | kto może pisać |
| `type` | rozszerzony CHECK | doszło `'announcement'` obok `direct/group/ministry` |

### `conversation_participants`
| Kolumna | Typ | Znaczenie |
|---|---|---|
| `pinned` | BOOLEAN | rozmowa przypięta na górze listy (per użytkownik) |

(`starred`, `archived`, `muted`, `last_read_at`, `role` – bez zmian)

### `messages`
| Kolumna | Typ | Znaczenie |
|---|---|---|
| `message_type` | TEXT `'text'`(domyślnie)`\|'poll'\|'prayer'\|'event'\|'system'` | typ wiadomości |
| `metadata` | JSONB `{}` | dane ankiety/modlitwy/wydarzenia |
| `mentions` | JSONB `[]` | lista e-maili wspomnianych (@) |

### `message_read_receipts`
| Kolumna | Typ | Znaczenie |
|---|---|---|
| `delivered_at` | TIMESTAMPTZ | znacznik doręczenia (ptaszki) |

### Nowe tabele
```
poll_votes(id, message_id→messages, option_id TEXT, user_email, created_at)
           UNIQUE(message_id, option_id, user_email)
prayer_responses(id, message_id→messages, user_email, created_at)
           UNIQUE(message_id, user_email)
```
Dodatkowo migracja tworzy kanoniczne (email-owe) `message_reactions` i `pinned_messages`, jeśli na tenancie ich brak.

Realtime włączone dla: `poll_votes`, `prayer_responses`, `message_reactions`, `pinned_messages`.

---

## 2. Kontrakt typów wiadomości (`metadata`)

**Ankieta** (`message_type='poll'`), `content` = pytanie (dla podglądu/powiadomień):
```json
{ "question": "Kto przyjdzie?", "options": [{"id":"o1","text":"Będę"},{"id":"o2","text":"Nie mogę"}],
  "multiple": false, "closes_at": null }
```
Głos: insert do `poll_votes` `{message_id, option_id, user_email}`. Jednokrotny wybór → usuń wcześniejsze głosy usera w tej ankiecie. Ponowny klik w wybraną opcję = wycofanie. Wyniki = agregacja `poll_votes` po `option_id`.

**Prośba o modlitwę** (`message_type='prayer'`), `content` = treść:
```json
{ "title": "Módlcie się za Anię" }
```
„🙏 Modlę się" = toggle wiersza w `prayer_responses` `{message_id, user_email}`. Licznik = liczba wierszy.

**Wydarzenie** (`message_type='event'`), `content` = tytuł:
```json
{ "event_id":"<uuid>", "title":"...", "date":"YYYY-MM-DD", "time":"HH:MM",
  "location":"...", "max_participants": 50, "description":"..." }
```
To migawka. RSVP działa na istniejącej tabeli `event_registrations` (`event_id, user_email, full_name, guests_count`) — web osadza wspólny komponent `EventRSVP`. Na mobile: zapis/odczyt `event_registrations` po `event_id`.

**System** (`message_type='system'`): `content` = tekst, render jako wyśrodkowana pastylka.

---

## 3. Wzmianki (@)

- Przy wysyłaniu: wykryj `@Imię` w polu, zbierz e-maile → zapisz do `messages.mentions` (JSONB tablica e-maili).
- Trigger DB (`create_message_notification`) tworzy wspomnianym powiadomienie typu **`mention`** i push **niezależnie od obecności**. Reszta dostaje `message` (push tylko gdy offline/away). Nie musisz robić nic po stronie klienta poza zapisaniem `mentions`.
- Render: podświetl tokeny `@słowo`. Jeśli `currentUserEmail ∈ message.mentions` → wyróżnij dymek („wspomniano Cię").

---

## 4. Ptaszki doręczenia (statusy WhatsApp)

Status własnej wiadomości liczony z `message_read_receipts` (wiersze innych niż nadawca):
- **`read`** – istnieje `read_at` → `✓✓` niebieskie
- **`delivered`** – istnieje `delivered_at` (a nie `read_at`) → `✓✓` szare
- **`sent`** – brak wierszy → `✓`

Zapis:
- Doręczenie: globalna subskrypcja na INSERT do `messages` → dla cudzych wiadomości `upsert {message_id,user_email,delivered_at, read_at:null}` z `ignoreDuplicates:true` (nie nadpisuj „przeczytane").
- Przeczytanie: `upsert {message_id,user_email,read_at:now,delivered_at:now}` z `ignoreDuplicates:false`.

---

## 5. Kanały ogłoszeń (broadcast)

- Typ `announcement` **lub** dowolna rozmowa z `posting_policy='admins'` → **piszą tylko admini**, reszta czyta/reaguje.
- Klient MUSI to egzekwować (na schwro RLS bywa wyłączone): jeśli `posting_policy==='admins' && myRole!=='admin'` → ukryj kompozer, pokaż „Tylko administratorzy mogą pisać".
- „Potwierdzenia zapoznania": dla wiadomości w kanale ogłoszeń pokazuj licznik przeczytań (liczba `read_at` w `message_read_receipts`) zamiast ptaszków.

---

## 6. Przypinanie rozmów

`conversation_participants.pinned` (per user). Sortowanie listy: **przypięte → ulubione (starred) → nieprzeczytane → po dacie**. Sekcja „Przypięte" na górze.

---

## 7. Push / powiadomienia (VPS)

Push wysyła **serwer** — `packages/api/src/realtime/push-hooks.js` (`notifyOnWrite`), fire-and-forget po insertcie przez Data API `/api/db`:
- insert do `messages` → push do uczestników (nie wyciszonych); osoby z `messages.mentions` → push `type:'mention'` **zawsze** (nawet przy wyciszeniu),
- podglądy bogatych typów w treści (📊/🙏/📅) liczone w `messagePreview()`.

**Klient NIE wysyła pushy** — web (`useMessages.js`) i mobile tylko insertują wiadomość z `mentions`; resztę robi serwer. (Klientowy `functions.invoke('send-push')` i tak wymagał `action:push_campaigns:send` → 403 dla członka.)

---

## 8. Web – nowe pliki (referencja implementacji)

Hooki: `hooks/usePolls.js`, `hooks/usePrayer.js`, rozszerzone `useReadReceipts.js` (delivered), `useMessages.js` (extra: messageType/metadata/mentions), `useConversations.js` (pinned, `createAnnouncementChannel`, `togglePin`).
Komponenty: `EmojiPicker.jsx`, `PollCard.jsx`, `PrayerCard.jsx`, `EventCard.jsx`, `PollComposerModal.jsx`, `EventShareModal.jsx` + rozbudowane `MessageInput/MessageBubble/MessageThread/ConversationList/NewConversationModal`.

`sendMessage(content, attachments, replyToId, { messageType, metadata, mentions })` – 4. argument jest opcjonalny i wstecznie zgodny.
