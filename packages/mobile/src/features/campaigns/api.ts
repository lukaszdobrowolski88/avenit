import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Segment } from './recipientsLogic';

// Kampanie push i SMS — kontrakt jak web (src/modules/PushCampaigns/hooks/usePushCampaigns.js,
// src/modules/SmsCampaigns/hooks/useSmsCampaigns.js): te same inserty/update'y, te same tabele
// dzieci (delete + insert) i te same funkcje serwera w tej samej kolejności.

export type CampaignKind = 'push' | 'sms';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type SendMode = 'now' | 'scheduled' | 'smart';

export const TABLE = { push: 'push_campaigns', sms: 'sms_campaigns' } as const;
const SEGMENTS_TABLE = { push: 'push_campaign_segments', sms: 'sms_campaign_segments' } as const;
const TEMPLATES_TABLE = { push: 'push_campaign_templates', sms: 'sms_campaign_templates' } as const;
const DISPATCH_FN = { push: 'push-campaign-dispatch', sms: 'sms-campaign-dispatch' } as const;
export const SEND_CAP = { push: 'action:push_campaigns:send', sms: 'action:sms_campaigns:send' } as const;
export const MODULE_KEY = { push: 'push_campaigns', sms: 'sms_campaigns' } as const;

// Embedy jak CAMPAIGN_SELECT na webie (bez `creator` — niepotrzebny w apce).
const FULL_SELECT = {
  push: '*, segments:push_campaign_segments(*), actions:push_campaign_actions(*), ab_variants:push_campaign_ab_variants(*)',
  sms: '*, segments:sms_campaign_segments(*), ab_variants:sms_campaign_ab_variants(*)',
} as const;

export const TITLE_MAX = 65;
export const PUSH_BODY_MAX = 240;

export const STATUS_META: Record<CampaignStatus, { label: string; fg: string; bg: string }> = {
  draft: { label: 'Szkic', fg: '#4A463E', bg: '#ECE8DE' },
  scheduled: { label: 'Zaplanowany', fg: '#6B4F05', bg: '#FFF1C2' },
  sending: { label: 'Wysyłanie…', fg: '#6B4F05', bg: '#FFF1C2' },
  sent: { label: 'Wysłany', fg: '#1E6B34', bg: '#E7F3EA' },
  failed: { label: 'Błąd', fg: '#B42318', bg: '#FDE7E4' },
  cancelled: { label: 'Anulowany', fg: '#6E685A', bg: '#ECE8DE' },
};

// Kategorie powiadomień (przyciski) — jak PUSH_CATEGORIES na webie; edycja przycisków tylko na webie.
export const PUSH_CATEGORIES: { id: string; label: string; actions: { label: string; destructive?: boolean }[] }[] = [
  { id: 'cm_dismiss_only', label: 'Bez przycisków', actions: [] },
  { id: 'cm_open_link', label: 'Otwórz w aplikacji', actions: [{ label: 'Otwórz' }] },
  { id: 'cm_external_url', label: 'Otwórz w przeglądarce', actions: [{ label: 'Otwórz' }] },
  { id: 'cm_form', label: 'Wypełnij formularz', actions: [{ label: 'Wypełnij' }, { label: 'Później' }] },
  { id: 'cm_rsvp_yes_no', label: 'Potwierdź obecność (RSVP)', actions: [{ label: 'Potwierdzam' }, { label: 'Nie mogę', destructive: true }] },
];

// Wiersz kampanii z bazy — pola obu typów (push: title/opened…, SMS: sender/replied/total_cost…).
export interface CampaignRow {
  id: string;
  name: string;
  status: CampaignStatus;
  title?: string | null;
  body: string | null;
  sender?: string | null;
  icon?: string | null;
  big_image?: string | null;
  link?: string | null;
  tag?: string | null;
  category_id?: string | null;
  data?: Record<string, unknown> | null;
  send_mode?: SendMode | null;
  scheduled_at: string | null;
  smart_window_hours?: number | null;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  frequency_cap_per_day?: number | null;
  created_at: string | null;
  completed_at?: string | null;
  recipient_count?: number | null;
  sent_count?: number | null;
  delivered_count?: number | null;
  opened_count?: number | null;
  action_clicked_count?: number | null;
  replied_count?: number | null;
  failed_count?: number | null;
  total_cost?: number | string | null;
  segments?: any[];
  actions?: any[];
  ab_variants?: any[];
}

export interface TemplateRow {
  id: string;
  name: string;
  title?: string | null;
  body: string | null;
  icon?: string | null;
  category_id?: string | null;
  default_sender?: string | null;
  is_system?: boolean | null;
}

export interface PushAction {
  label: string;
  action_type: string;
  action_value: string | null;
  destructive: boolean;
}

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(q: T) => T;
}

const asList = (d: unknown) => ((d ?? []) as any[]);

export const campaignsKey = (kind: CampaignKind) => ['campaigns', kind] as const;

// Lista: '*' bez embedów (jak lista push na webie — szybciej i odporne na embedy), filtr kampusu.
export const useCampaigns = (kind: CampaignKind, scope: CampusScope, enabled = true) =>
  useQuery({
    queryKey: [...campaignsKey(kind), 'list', scope.selectedCampusId],
    enabled,
    queryFn: async (): Promise<CampaignRow[]> => {
      const { data, error } = await scope
        .withCampusFilter(supabase.from(TABLE[kind]).select('*'))
        .order('created_at', { ascending: false });
      if (error) throw error;
      return asList(data) as CampaignRow[];
    },
  });

const fetchFull = async (kind: CampaignKind, id: string): Promise<CampaignRow> => {
  const { data, error } = await supabase.from(TABLE[kind]).select(FULL_SELECT[kind]).eq('id', id).single();
  if (error) throw error;
  return data as CampaignRow;
};

// Pełna kampania do edycji (z segmentami i przyciskami) — web bierze ją z listy, my dociągamy
// osobno, żeby zapis nie skasował segmentów (lista nie ma embedów).
export const useCampaign = (kind: CampaignKind, id: string | null) =>
  useQuery({
    queryKey: [...campaignsKey(kind), 'one', id],
    enabled: !!id,
    queryFn: () => fetchFull(kind, id!),
  });

export const useTemplates = (kind: CampaignKind) =>
  useQuery({
    queryKey: [...campaignsKey(kind), 'templates'],
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from(TEMPLATES_TABLE[kind])
        .select('*')
        .order('is_system', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return asList(data) as TemplateRow[];
    },
  });

export const useRecipientRows = (kind: CampaignKind, id: string | null) =>
  useQuery({
    queryKey: [...campaignsKey(kind), 'stats', id],
    enabled: !!id,
    queryFn: async (): Promise<{ recipients: any[]; responses: any[] }> => {
      const recipientsTable = kind === 'push' ? 'push_campaign_recipients' : 'sms_campaign_recipients';
      const [rRes, respRes] = await Promise.all([
        supabase.from(recipientsTable).select('*').eq('campaign_id', id!).order('created_at', { ascending: true }),
        kind === 'sms'
          ? supabase.from('sms_inline_responses').select('*').eq('campaign_id', id!).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (rRes.error) throw rRes.error;
      return { recipients: asList(rRes.data), responses: asList(respRes.data) };
    },
  });

// ── Zapis (port helperów weba) ───────────────────────────────────────────────────────────

async function saveSegments(kind: CampaignKind, campaignId: string, segments: Segment[]) {
  await supabase.from(SEGMENTS_TABLE[kind]).delete().eq('campaign_id', campaignId);
  if (!segments?.length) return;
  const rows = segments.map((s) => ({
    campaign_id: campaignId,
    segment_type: s.type,
    segment_id: s.id ? String(s.id) : null,
    segment_name: s.name || null,
    exclude: !!s.exclude,
    emails: s.emails || null,
    // Kolumna `phones` istnieje tylko w sms_campaign_segments.
    ...(kind === 'sms' ? { phones: s.phones || null } : {}),
  }));
  const { error } = await supabase.from(SEGMENTS_TABLE[kind]).insert(rows);
  if (error) throw error;
}

async function saveActions(campaignId: string, actions: PushAction[]) {
  await supabase.from('push_campaign_actions').delete().eq('campaign_id', campaignId);
  if (!actions?.length) return;
  const rows = actions.map((a, idx) => ({
    campaign_id: campaignId,
    position: idx,
    label: a.label,
    action_type: a.action_type,
    action_value: a.action_value || null,
    destructive: !!a.destructive,
    authentication_required: false,
  }));
  const { error } = await supabase.from('push_campaign_actions').insert(rows);
  if (error) throw error;
}

async function saveAbVariants(kind: CampaignKind, campaignId: string, variants: any[]) {
  const table = kind === 'push' ? 'push_campaign_ab_variants' : 'sms_campaign_ab_variants';
  await supabase.from(table).delete().eq('campaign_id', campaignId);
  if (!variants?.length) return;
  const rows = variants.map((v) => ({
    campaign_id: campaignId,
    variant: v.variant,
    ...(kind === 'push' ? { title: v.title } : {}),
    body: v.body,
    share_percent: v.share_percent ?? 50,
  }));
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw error;
}

export interface CampaignPayload {
  campaign: Record<string, unknown>;
  segments?: Segment[];
  actions?: PushAction[];
  ab_variants?: any[];
}

export async function createCampaign(kind: CampaignKind, userEmail: string, p: CampaignPayload): Promise<CampaignRow> {
  const { data: created, error } = await supabase
    .from(TABLE[kind])
    .insert({ ...p.campaign, created_by: userEmail })
    .select()
    .single();
  if (error) throw error;
  const row = created as CampaignRow;
  if (p.segments?.length) await saveSegments(kind, row.id, p.segments);
  if (kind === 'push' && p.actions?.length) await saveActions(row.id, p.actions);
  if (p.ab_variants?.length) await saveAbVariants(kind, row.id, p.ab_variants);
  return row;
}

export async function updateCampaign(kind: CampaignKind, id: string, p: CampaignPayload): Promise<CampaignRow> {
  const { data: updated, error } = await supabase.from(TABLE[kind]).update(p.campaign).eq('id', id).select().single();
  if (error) throw error;
  if (p.segments !== undefined) await saveSegments(kind, id, p.segments);
  if (kind === 'push' && p.actions !== undefined) await saveActions(id, p.actions);
  if (p.ab_variants !== undefined) await saveAbVariants(kind, id, p.ab_variants);
  return updated as CampaignRow;
}

// „Wyślij teraz” jak dispatchCampaign/dispatchSmsCampaign na webie: status 'sending' + teraz,
// potem funkcja dispatch z force (materializuje odbiorców i wysyła).
export async function dispatchCampaign(kind: CampaignKind, id: string) {
  const now = new Date().toISOString();
  await supabase.from(TABLE[kind]).update({ status: 'sending', scheduled_at: now, started_at: now }).eq('id', id);
  const { data, error } = await supabase.functions.invoke(DISPATCH_FN[kind], { body: { campaign_id: id, force: true } });
  if (error) throw error;
  return data;
}

export async function deleteCampaign(kind: CampaignKind, id: string) {
  const { error } = await supabase.from(TABLE[kind]).delete().eq('id', id);
  if (error) throw error;
}

export async function cancelCampaign(kind: CampaignKind, id: string) {
  return updateCampaign(kind, id, { campaign: { status: 'cancelled' } });
}

// Duplikat jak duplicateCampaign na webie: bez liczników/statusu, „(kopia)”, dzieci bez id.
export async function duplicateCampaign(kind: CampaignKind, userEmail: string, id: string) {
  const original = await fetchFull(kind, id);
  const {
    id: _id,
    created_at,
    updated_at,
    started_at,
    completed_at,
    recipient_count,
    sent_count,
    delivered_count,
    opened_count,
    action_clicked_count,
    replied_count,
    failed_count,
    total_cost,
    status,
    creator,
    segments,
    actions,
    ab_variants,
    ...rest
  } = original as any;
  const strip = (r: any) => {
    const { id: _x, campaign_id, created_at: _c, ...keep } = r;
    return keep;
  };
  const segs: Segment[] = asList(segments).map((s) => {
    const k = strip(s);
    return { type: k.segment_type, id: k.segment_id, name: k.segment_name, exclude: !!k.exclude, emails: k.emails, phones: k.phones };
  });
  const acts: PushAction[] = asList(actions)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((a) => ({ label: a.label, action_type: a.action_type, action_value: a.action_value, destructive: !!a.destructive }));
  return createCampaign(kind, userEmail, {
    campaign: { ...rest, name: `${original.name} (kopia)`, status: 'draft' },
    segments: segs,
    actions: kind === 'push' ? acts : undefined,
    ab_variants: asList(ab_variants).map(strip),
  });
}

export async function invokeSendPush(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('send-push', { body: payload });
  if (error) throw error;
  return data as any;
}

export async function invokeSendSms(payload: { phone: string; message: string; sender: string }) {
  const { data, error } = await supabase.functions.invoke('send-sms', { body: payload });
  if (error) throw error;
  return data as any;
}

export const useInvalidateCampaigns = (kind: CampaignKind) => {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: campaignsKey(kind) }), [qc, kind]);
};

// Data w liście: zaplanowane → termin, wysłane → zakończenie, reszta → utworzenie (jak web).
export const listDate = (c: CampaignRow) => (c.status === 'scheduled' ? c.scheduled_at : c.completed_at || c.created_at);

export const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

// Kampanię da się edytować (wysłane/wysyłane — tylko podgląd statystyk).
export const isEditable = (s: CampaignStatus) => s !== 'sent' && s !== 'sending';
