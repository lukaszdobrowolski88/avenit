// Rozmowa 1:1 — jedno miejsce w webie (Komunikator, pulpit „Kto jest online”), ta sama logika co
// aplikacja (packages/mobile/src/features/messenger/start.ts): najpierw istniejąca rozmowa z tą osobą
// (także zarchiwizowana — wraca z archiwum), dopiero potem nowa. Serwer i tak nie pozwoli założyć
// drugiej (409 DIRECT_EXISTS), więc wtedy po prostu otwieramy istniejącą.
import { supabase } from '../../../lib/supabase';
import { buildParticipantRows, emailPattern, pickDirectConversation } from './chatLogic';

// Istniejąca rozmowa 1:1 (szukana w bazie — lista mogła się jeszcze nie wczytać). Przy dawnych
// duplikatach — ta z najświeższą wiadomością.
export async function findExistingDirect(myEmail, otherEmail) {
  const { data: mine, error: mineErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .ilike('user_email', emailPattern(myEmail));
  if (mineErr) throw mineErr;
  const myIds = (mine || []).map(p => p.conversation_id);
  if (!myIds.length) return null;

  const { data: theirs, error: theirsErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .ilike('user_email', emailPattern(otherEmail))
    .in('conversation_id', myIds);
  if (theirsErr) throw theirsErr;
  const common = [...new Set((theirs || []).map(p => p.conversation_id))];
  if (!common.length) return null;

  const { data: convs, error: convsErr } = await supabase
    .from('conversations')
    .select('id, type, created_at, updated_at, last_message_at')
    .in('id', common)
    .eq('type', 'direct');
  if (convsErr) throw convsErr;
  if (!convs?.length) return null;
  if (convs.length === 1) return convs[0].id;
  const withLast = await Promise.all(convs.map(async (c) => {
    const { data } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', c.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    return { ...c, lastMessage: data?.[0] || null };
  }));
  return pickDirectConversation(withLast)?.id || null;
}

// Otwierana rozmowa wraca z archiwum (mój wiersz) — inaczej „znikała” zaraz po otwarciu.
export async function unarchiveMine(conversationId, myEmail) {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ archived: false })
    .eq('conversation_id', conversationId)
    .ilike('user_email', emailPattern(myEmail))
    .eq('archived', true)
    .select('conversation_id')
    .silent();
  if (error) console.warn('Nie udało się przywrócić rozmowy z archiwum:', error.message);
}

// Nowa rozmowa 1:1: rozmowa → cały skład jednym zapisem (obie osoby administratorami).
async function insertDirect(myEmail, otherEmail) {
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({ type: 'direct', created_by: myEmail })
    .select('id')
    .single();
  if (convError) throw convError;
  // .silent(): błąd (np. 409 „rozmowa już istnieje”) obsługuje wywołujący — bez drugiego komunikatu.
  const { error: partError } = await supabase
    .from('conversation_participants')
    .insert(buildParticipantRows(conv.id, myEmail, [otherEmail], { allAdmins: true }))
    .select('conversation_id, user_email')
    .silent();
  if (partError) throw partError;
  return conv.id;
}

// Otwórz istniejącą albo załóż nową. Zwraca { id, created }.
// knownId — rozmowa znaleziona już na liście (bez zapytań o istniejącą).
export async function openOrCreateDirect(myEmail, otherEmail, { canManageOwn = true, knownId = null } = {}) {
  const existingId = knownId || await findExistingDirect(myEmail, otherEmail);
  if (existingId) {
    if (canManageOwn) await unarchiveMine(existingId, myEmail);
    return { id: existingId, created: false };
  }
  try {
    return { id: await insertDirect(myEmail, otherEmail), created: true };
  } catch (err) {
    if (err?.code === 'DIRECT_EXISTS') {
      const id = await findExistingDirect(myEmail, otherEmail);
      if (id) {
        if (canManageOwn) await unarchiveMine(id, myEmail);
        return { id, created: false };
      }
    }
    throw err;
  }
}
