/**
 * Supabase Edge Function - Process Dunning
 * Automatycznie przetwarza zaległe faktury i wysyła przypomnienia
 * Uruchamiany przez cron job (np. codziennie o 9:00)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@appschtomy.pl';
const APP_URL = Deno.env.get('APP_URL') || 'https://app.appschtomy.pl';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DunningItem {
  tenant_id: string;
  invoice_id: string;
  invoice_number: string;
  tenant_email: string;
  tenant_name: string;
  days_overdue: number;
  next_stage: number;
  action_to_take: string;
  amount: number;
}

/**
 * Wysyła email przez Resend
 */
async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY not configured, skipping email');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: `AppSchtomy <${FROM_EMAIL}>`,
        to: [to],
        subject,
        html
      })
    });

    const result = await response.json();
    return response.ok;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Generuje treść emaila dla danego etapu dunning
 */
function generateEmailContent(stage: number, data: DunningItem): { subject: string; html: string } {
  const paymentUrl = `${APP_URL}/billing?invoice=${data.invoice_id}`;
  const formatAmount = (amount: number) => (amount / 100).toFixed(2) + ' PLN';

  switch (stage) {
    case 1:
      return {
        subject: `Przypomnienie o płatności - faktura ${data.invoice_number}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Przypomnienie o płatności</h2>
            <p>Szanowny Kliencie,</p>
            <p>Przypominamy, że faktura <strong>${data.invoice_number}</strong> na kwotę <strong>${formatAmount(data.amount)}</strong>
            jest już ${data.days_overdue} dni po terminie płatności.</p>
            <p>Prosimy o jak najszybszą regulację należności.</p>
            <a href="${paymentUrl}" style="display: inline-block; background: linear-gradient(to right, #ec4899, #f97316); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
              Zapłać teraz
            </a>
            <p style="color: #666; font-size: 14px;">
              Jeśli płatność została już dokonana, prosimy zignorować tę wiadomość.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">
              AppSchtomy - Zarządzanie kościołem<br>
              Ta wiadomość została wysłana automatycznie.
            </p>
          </div>
        `
      };

    case 2:
      return {
        subject: `Pilne: Nieuregulowana faktura ${data.invoice_number}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Pilne przypomnienie o płatności</h2>
            <p>Szanowny Kliencie,</p>
            <p>To drugie przypomnienie dotyczące nieuregulowanej faktury <strong>${data.invoice_number}</strong>
            na kwotę <strong>${formatAmount(data.amount)}</strong>.</p>
            <p style="color: #dc2626; font-weight: bold;">
              Faktura jest już ${data.days_overdue} dni po terminie płatności.
            </p>
            <p>Prosimy o pilną regulację należności, aby uniknąć ograniczenia dostępu do usług.</p>
            <a href="${paymentUrl}" style="display: inline-block; background: linear-gradient(to right, #ec4899, #f97316); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
              Zapłać teraz
            </a>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">
              AppSchtomy - Zarządzanie kościołem
            </p>
          </div>
        `
      };

    case 3:
      return {
        subject: `Ostatnie ostrzeżenie - zawieszenie konta za 7 dni`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px;">
              <strong style="color: #dc2626;">OSTATNIE OSTRZEŻENIE</strong>
            </div>
            <h2 style="color: #dc2626;">Twoje konto zostanie zawieszone</h2>
            <p>Szanowny Kliencie,</p>
            <p>Pomimo poprzednich przypomnień, faktura <strong>${data.invoice_number}</strong>
            na kwotę <strong>${formatAmount(data.amount)}</strong> pozostaje nieopłacona.</p>
            <p style="color: #dc2626; font-weight: bold; font-size: 18px;">
              Jeśli płatność nie zostanie dokonana w ciągu 7 dni, Twoje konto zostanie zawieszone.
            </p>
            <p>Po zawieszeniu konta:</p>
            <ul style="color: #666;">
              <li>Stracisz dostęp do aplikacji</li>
              <li>Członkowie Twojego zespołu nie będą mogli się zalogować</li>
              <li>Check-in dzieci będzie niedostępny</li>
            </ul>
            <a href="${paymentUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
              Zapłać teraz i zachowaj dostęp
            </a>
            <p style="color: #666;">
              W razie problemów z płatnością, skontaktuj się z nami: kontakt@appschtomy.pl
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">
              AppSchtomy - Zarządzanie kościołem
            </p>
          </div>
        `
      };

    case 4:
      return {
        subject: `Twoje konto AppSchtomy zostało zawieszone`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
              <h2 style="margin: 0;">Konto zawieszone</h2>
            </div>
            <div style="padding: 20px;">
              <p>Szanowny Kliencie,</p>
              <p>Z powodu nieuregulowanej faktury <strong>${data.invoice_number}</strong>
              na kwotę <strong>${formatAmount(data.amount)}</strong>, Twoje konto AppSchtomy zostało zawieszone.</p>
              <p style="font-weight: bold;">Co to oznacza:</p>
              <ul style="color: #666;">
                <li>Ty i Twoi użytkownicy nie macie dostępu do aplikacji</li>
                <li>Wszystkie funkcje są zablokowane</li>
                <li>Twoje dane są bezpieczne i zostaną przywrócone po opłaceniu faktury</li>
              </ul>
              <p style="font-weight: bold;">Jak przywrócić konto:</p>
              <p>Opłać zaległą fakturę, a Twoje konto zostanie automatycznie odblokowane w ciągu kilku minut.</p>
              <a href="${paymentUrl}" style="display: inline-block; background: linear-gradient(to right, #ec4899, #f97316); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                Opłać fakturę i odblokuj konto
              </a>
              <p style="color: #666; font-size: 14px;">
                Masz pytania? Napisz do nas: kontakt@appschtomy.pl
              </p>
            </div>
          </div>
        `
      };

    default:
      return { subject: '', html: '' };
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verify authorization (should be called by cron or admin)
  const authHeader = req.headers.get('authorization');
  // In production, verify the authorization properly

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Get all overdue invoices that need dunning action
    const { data: dunningItems, error: dunningError } = await supabaseClient
      .rpc('process_dunning');

    if (dunningError) {
      throw dunningError;
    }

    const results = {
      processed: 0,
      emailsSent: 0,
      accountsSuspended: 0,
      errors: [] as string[]
    };

    // 2. Process each item
    for (const item of (dunningItems || [])) {
      if (!item.next_stage || item.next_stage === 0) continue;

      try {
        // Get tenant name
        const { data: tenant } = await supabaseClient
          .from('tenants')
          .select('name')
          .eq('id', item.tenant_id)
          .single();

        const dunningData: DunningItem = {
          ...item,
          tenant_name: tenant?.name || 'Klient'
        };

        // Get invoice amount
        const { data: invoice } = await supabaseClient
          .from('invoices')
          .select('total')
          .eq('id', item.invoice_id)
          .single();

        dunningData.amount = invoice?.total || 0;

        // Determine action
        if (item.action_to_take === 'email') {
          // Send reminder email
          const { subject, html } = generateEmailContent(item.next_stage, dunningData);

          if (subject && html) {
            const emailSent = await sendEmail(item.tenant_email, subject, html);

            if (emailSent) {
              results.emailsSent++;
            }

            // Log the action
            await supabaseClient
              .from('dunning_log')
              .insert({
                tenant_id: item.tenant_id,
                invoice_id: item.invoice_id,
                stage: item.next_stage,
                action_taken: 'email',
                email_sent_to: item.tenant_email,
                email_sent_at: new Date().toISOString()
              });
          }
        } else if (item.action_to_take === 'suspend') {
          // Suspend the tenant
          await supabaseClient
            .from('tenants')
            .update({ status: 'suspended' })
            .eq('id', item.tenant_id);

          await supabaseClient
            .from('tenant_subscriptions')
            .update({ status: 'suspended' })
            .eq('tenant_id', item.tenant_id)
            .in('status', ['trialing', 'active', 'past_due']);

          // Send suspension email
          const { subject, html } = generateEmailContent(4, dunningData);
          await sendEmail(item.tenant_email, subject, html);

          // Log the action
          await supabaseClient
            .from('dunning_log')
            .insert({
              tenant_id: item.tenant_id,
              invoice_id: item.invoice_id,
              stage: item.next_stage,
              action_taken: 'suspend',
              email_sent_to: item.tenant_email,
              email_sent_at: new Date().toISOString()
            });

          results.accountsSuspended++;
        }

        results.processed++;
      } catch (itemError) {
        console.error('Error processing dunning item:', itemError);
        results.errors.push(`Tenant ${item.tenant_id}: ${itemError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Dunning process error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
