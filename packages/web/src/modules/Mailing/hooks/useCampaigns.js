import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('email_campaigns')
        .select(`
          *,
          template:email_templates(id, name),
          creator:app_users!email_campaigns_created_by_fkey(full_name, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setCampaigns(data || []);
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const createCampaign = async (campaignData) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie jesteś zalogowany');

      const { data, error: insertError } = await supabase
        .from('email_campaigns')
        .insert({
          ...campaignData,
          created_by: user.email
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setCampaigns(prev => [data, ...prev]);
      return data;
    } catch (err) {
      console.error('Error creating campaign:', err);
      throw err;
    }
  };

  const updateCampaign = async (id, updates) => {
    try {
      const { data, error: updateError } = await supabase
        .from('email_campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
      return data;
    } catch (err) {
      console.error('Error updating campaign:', err);
      throw err;
    }
  };

  const deleteCampaign = async (id) => {
    try {
      const { error: deleteError } = await supabase
        .from('email_campaigns')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Error deleting campaign:', err);
      throw err;
    }
  };

  const getCampaign = useCallback(async (id) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('email_campaigns')
        .select(`
          *,
          template:email_templates(id, name, html_content),
          creator:app_users!email_campaigns_created_by_fkey(full_name, avatar_url),
          segments:email_recipient_segments(*)
        `)
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      return data;
    } catch (err) {
      console.error('Error fetching campaign:', err);
      throw err;
    }
  }, []);

  const duplicateCampaign = async (id) => {
    try {
      const original = await getCampaign(id);
      if (!original) throw new Error('Kampania nie istnieje');

      const { data: { user } } = await supabase.auth.getUser();

      const newCampaign = {
        name: `${original.name} (kopia)`,
        subject: original.subject,
        html_content: original.html_content,
        json_design: original.json_design,
        template_id: original.template_id,
        status: 'draft',
        created_by: user.email
      };

      return await createCampaign(newCampaign);
    } catch (err) {
      console.error('Error duplicating campaign:', err);
      throw err;
    }
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
    duplicateCampaign
  };
}

export function useCampaignRecipients(campaignId) {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0
  });

  const fetchRecipients = useCallback(async () => {
    if (!campaignId) return;

    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('email_campaign_recipients')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      setRecipients(data || []);

      // Oblicz statystyki
      const newStats = {
        total: data?.length || 0,
        pending: 0,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0
      };

      data?.forEach(r => {
        if (r.status === 'pending') newStats.pending++;
        else if (r.status === 'sent') newStats.sent++;
        else if (r.status === 'delivered') newStats.delivered++;
        else if (r.status === 'opened') newStats.opened++;
        else if (r.status === 'clicked') newStats.clicked++;
        else if (r.status === 'bounced') newStats.bounced++;
      });

      setStats(newStats);
    } catch (err) {
      console.error('Error fetching recipients:', err);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchRecipients();
  }, [fetchRecipients]);

  const addRecipients = async (recipientsList) => {
    if (!campaignId) return;

    try {
      const recipientsToInsert = recipientsList.map(r => ({
        campaign_id: campaignId,
        email: r.email,
        full_name: r.full_name || r.name,
        status: 'pending'
      }));

      const { data, error: insertError } = await supabase
        .from('email_campaign_recipients')
        .upsert(recipientsToInsert, {
          onConflict: 'campaign_id,email',
          ignoreDuplicates: true
        })
        .select();

      if (insertError) throw insertError;

      await fetchRecipients();
      return data;
    } catch (err) {
      console.error('Error adding recipients:', err);
      throw err;
    }
  };

  const removeRecipient = async (recipientId) => {
    try {
      const { error: deleteError } = await supabase
        .from('email_campaign_recipients')
        .delete()
        .eq('id', recipientId);

      if (deleteError) throw deleteError;

      setRecipients(prev => prev.filter(r => r.id !== recipientId));
    } catch (err) {
      console.error('Error removing recipient:', err);
      throw err;
    }
  };

  const clearRecipients = async () => {
    if (!campaignId) return;

    try {
      const { error: deleteError } = await supabase
        .from('email_campaign_recipients')
        .delete()
        .eq('campaign_id', campaignId);

      if (deleteError) throw deleteError;

      setRecipients([]);
      setStats({
        total: 0,
        pending: 0,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0
      });
    } catch (err) {
      console.error('Error clearing recipients:', err);
      throw err;
    }
  };

  return {
    recipients,
    loading,
    stats,
    fetchRecipients,
    addRecipients,
    removeRecipient,
    clearRecipients
  };
}
