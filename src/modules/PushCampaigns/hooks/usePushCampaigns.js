import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

const CAMPAIGN_SELECT = `
  *,
  segments:push_campaign_segments(*),
  actions:push_campaign_actions(*),
  ab_variants:push_campaign_ab_variants(*),
  creator:app_users!push_campaigns_created_by_fkey(full_name, avatar_url)
`;

export function usePushCampaigns(campusId = null) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('push_campaigns')
        .select(CAMPAIGN_SELECT)
        .order('created_at', { ascending: false });
      if (campusId) query = query.eq('campus_id', campusId);

      const { data, error: err } = await query;
      if (err) throw err;
      setCampaigns(data || []);
    } catch (err) {
      console.error('usePushCampaigns fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campusId]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const createCampaign = async (data) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Nie jesteś zalogowany');

    const { segments, actions, ab_variants, ...campaign } = data;

    const { data: created, error: err } = await supabase
      .from('push_campaigns')
      .insert({ ...campaign, created_by: user.email })
      .select()
      .single();
    if (err) throw err;

    if (segments?.length) await saveSegments(created.id, segments);
    if (actions?.length)  await saveActions(created.id, actions);
    if (ab_variants?.length) await saveAbVariants(created.id, ab_variants);

    await fetchCampaigns();
    return created;
  };

  const updateCampaign = async (id, data) => {
    const { segments, actions, ab_variants, ...campaign } = data;

    const { data: updated, error: err } = await supabase
      .from('push_campaigns')
      .update(campaign)
      .eq('id', id)
      .select()
      .single();
    if (err) throw err;

    if (segments !== undefined) await saveSegments(id, segments);
    if (actions !== undefined)  await saveActions(id, actions);
    if (ab_variants !== undefined) await saveAbVariants(id, ab_variants);

    await fetchCampaigns();
    return updated;
  };

  const deleteCampaign = async (id) => {
    const { error: err } = await supabase
      .from('push_campaigns')
      .delete()
      .eq('id', id);
    if (err) throw err;
    setCampaigns(prev => prev.filter(c => c.id !== id));
  };

  const getCampaign = useCallback(async (id) => {
    const { data, error: err } = await supabase
      .from('push_campaigns')
      .select(CAMPAIGN_SELECT)
      .eq('id', id)
      .single();
    if (err) throw err;
    return data;
  }, []);

  const duplicateCampaign = async (id) => {
    const original = await getCampaign(id);
    if (!original) throw new Error('Kampania nie istnieje');

    const { id: _id, created_at, updated_at, started_at, completed_at,
            recipient_count, sent_count, delivered_count, opened_count,
            action_clicked_count, failed_count, status, creator,
            segments, actions, ab_variants,
            ...rest } = original;

    return createCampaign({
      ...rest,
      name: `${original.name} (kopia)`,
      status: 'draft',
      segments: (segments || []).map(s => {
        const { id: _, campaign_id, created_at, ...keep } = s; return keep;
      }),
      actions: (actions || []).map(a => {
        const { id: _, campaign_id, created_at, ...keep } = a; return keep;
      }),
      ab_variants: (ab_variants || []).map(v => {
        const { id: _, campaign_id, created_at, ...keep } = v; return keep;
      }),
    });
  };

  const cancelCampaign = async (id) => {
    return updateCampaign(id, { status: 'cancelled' });
  };

  return {
    campaigns,
    loading,
    error,
    fetchCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    getCampaign,
    duplicateCampaign,
    cancelCampaign,
  };
}

// Helpers — używane też z CampaignEditor.

export async function saveSegments(campaignId, segments) {
  await supabase.from('push_campaign_segments').delete().eq('campaign_id', campaignId);
  if (!segments?.length) return;
  const rows = segments.map(s => ({
    campaign_id: campaignId,
    segment_type: s.type,
    segment_id: s.id ? String(s.id) : null,
    segment_name: s.name || null,
    exclude: !!s.exclude,
    emails: s.emails || null,
  }));
  const { error } = await supabase.from('push_campaign_segments').insert(rows);
  if (error) throw error;
}

export async function saveActions(campaignId, actions) {
  await supabase.from('push_campaign_actions').delete().eq('campaign_id', campaignId);
  if (!actions?.length) return;
  const rows = actions.map((a, idx) => ({
    campaign_id: campaignId,
    position: idx,
    label: a.label,
    action_type: a.action_type,
    action_value: a.action_value || null,
    destructive: !!a.destructive,
    authentication_required: !!a.authentication_required,
  }));
  const { error } = await supabase.from('push_campaign_actions').insert(rows);
  if (error) throw error;
}

export async function saveAbVariants(campaignId, variants) {
  await supabase.from('push_campaign_ab_variants').delete().eq('campaign_id', campaignId);
  if (!variants?.length) return;
  const rows = variants.map(v => ({
    campaign_id: campaignId,
    variant: v.variant,
    title: v.title,
    body: v.body,
    share_percent: v.share_percent ?? 50,
  }));
  const { error } = await supabase.from('push_campaign_ab_variants').insert(rows);
  if (error) throw error;
}

/**
 * Wywołuje edge function send-push dla pojedynczego odbiorcy. Używane do
 * "Wyślij do mnie" i fallbacku gdy kampania jest wysyłana z UI bez schedulera.
 */
export async function invokeSendPush(payload) {
  const { data, error } = await supabase.functions.invoke('send-push', { body: payload });
  if (error) throw error;
  return data;
}

/**
 * Uruchamia kampanię natychmiast — zmienia status na 'sending' i wywołuje
 * edge function push-campaign-dispatch, która materializuje odbiorców i
 * wysyła. Używane przez przycisk "Wyślij teraz".
 */
export async function dispatchCampaign(campaignId) {
  await supabase.from('push_campaigns')
    .update({ status: 'sending', scheduled_at: new Date().toISOString(), started_at: new Date().toISOString() })
    .eq('id', campaignId);

  const { data, error } = await supabase.functions.invoke('push-campaign-dispatch', {
    body: { campaign_id: campaignId, force: true },
  });
  if (error) throw error;
  return data;
}
