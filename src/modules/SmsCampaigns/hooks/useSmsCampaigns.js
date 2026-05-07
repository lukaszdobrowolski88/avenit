import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

const CAMPAIGN_SELECT = `
  *,
  segments:sms_campaign_segments(*),
  ab_variants:sms_campaign_ab_variants(*),
  creator:app_users!sms_campaigns_created_by_fkey(full_name, avatar_url)
`;

export function useSmsCampaigns(campusId = null) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('sms_campaigns')
        .select(CAMPAIGN_SELECT)
        .order('created_at', { ascending: false });
      if (campusId) query = query.eq('campus_id', campusId);

      const { data, error: err } = await query;
      if (err) throw err;
      setCampaigns(data || []);
    } catch (err) {
      console.error('useSmsCampaigns fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campusId]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const createCampaign = async (data) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Nie jesteś zalogowany');

    const { segments, ab_variants, ...campaign } = data;

    const { data: created, error: err } = await supabase
      .from('sms_campaigns')
      .insert({ ...campaign, created_by: user.email })
      .select()
      .single();
    if (err) throw err;

    if (segments?.length) await saveSegments(created.id, segments);
    if (ab_variants?.length) await saveAbVariants(created.id, ab_variants);

    await fetchCampaigns();
    return created;
  };

  const updateCampaign = async (id, data) => {
    const { segments, ab_variants, ...campaign } = data;

    const { data: updated, error: err } = await supabase
      .from('sms_campaigns')
      .update(campaign)
      .eq('id', id)
      .select()
      .single();
    if (err) throw err;

    if (segments !== undefined) await saveSegments(id, segments);
    if (ab_variants !== undefined) await saveAbVariants(id, ab_variants);

    await fetchCampaigns();
    return updated;
  };

  const deleteCampaign = async (id) => {
    const { error: err } = await supabase
      .from('sms_campaigns')
      .delete()
      .eq('id', id);
    if (err) throw err;
    setCampaigns(prev => prev.filter(c => c.id !== id));
  };

  const getCampaign = useCallback(async (id) => {
    const { data, error: err } = await supabase
      .from('sms_campaigns')
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
            recipient_count, sent_count, delivered_count, replied_count,
            failed_count, total_cost, status, creator,
            segments, ab_variants,
            ...rest } = original;

    return createCampaign({
      ...rest,
      name: `${original.name} (kopia)`,
      status: 'draft',
      segments: (segments || []).map(s => {
        const { id: _, campaign_id, created_at, ...keep } = s; return keep;
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
  await supabase.from('sms_campaign_segments').delete().eq('campaign_id', campaignId);
  if (!segments?.length) return;
  const rows = segments.map(s => ({
    campaign_id: campaignId,
    segment_type: s.type,
    segment_id: s.id ? String(s.id) : null,
    segment_name: s.name || null,
    exclude: !!s.exclude,
    emails: s.emails || null,
    phones: s.phones || null,
  }));
  const { error } = await supabase.from('sms_campaign_segments').insert(rows);
  if (error) throw error;
}

export async function saveAbVariants(campaignId, variants) {
  await supabase.from('sms_campaign_ab_variants').delete().eq('campaign_id', campaignId);
  if (!variants?.length) return;
  const rows = variants.map(v => ({
    campaign_id: campaignId,
    variant: v.variant,
    body: v.body,
    share_percent: v.share_percent ?? 50,
  }));
  const { error } = await supabase.from('sms_campaign_ab_variants').insert(rows);
  if (error) throw error;
}

/**
 * Wywołuje edge function send-sms dla pojedynczego numeru. Używane do "Wyślij do mnie".
 */
export async function invokeSendSms(payload) {
  const { data, error } = await supabase.functions.invoke('send-sms', { body: payload });
  if (error) throw error;
  return data;
}

/**
 * Uruchamia kampanię natychmiast — zmienia status na 'sending' i wywołuje
 * edge function sms-campaign-dispatch, która materializuje odbiorców i wysyła.
 */
export async function dispatchSmsCampaign(campaignId) {
  await supabase.from('sms_campaigns')
    .update({ status: 'sending', scheduled_at: new Date().toISOString(), started_at: new Date().toISOString() })
    .eq('id', campaignId);

  const { data, error } = await supabase.functions.invoke('sms-campaign-dispatch', {
    body: { campaign_id: campaignId, force: true },
  });
  if (error) throw error;
  return data;
}
