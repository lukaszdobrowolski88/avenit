/**
 * Supabase Edge Function - Przelewy24 Create Payment
 * Tworzy sesję płatności w Przelewy24
 * Obsługuje zarówno płatności z faktur (invoiceId/tenantId) jak i z formularzy publicznych (formId/sessionId)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';

const P24_API_URL = Deno.env.get('P24_SANDBOX') === 'true'
  ? 'https://sandbox.przelewy24.pl'
  : 'https://secure.przelewy24.pl';

const P24_MERCHANT_ID = Deno.env.get('P24_MERCHANT_ID')!;
const P24_POS_ID = Deno.env.get('P24_POS_ID') || P24_MERCHANT_ID;
const P24_CRC = Deno.env.get('P24_CRC')!;
const P24_API_KEY = Deno.env.get('P24_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Generuje sumę kontrolną dla P24
 */
async function generateChecksum(data: Record<string, string | number>): Promise<string> {
  // P24 wymaga JSON string z polami + crc jako input do SHA-384
  const checksumData = { ...data, crc: P24_CRC };
  const stringToHash = JSON.stringify(checksumData);

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(stringToHash);
  const hashBuffer = await crypto.subtle.digest('SHA-384', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Pobierz dane z requestu
    const body = await req.json();
    const {
      // Tryb fakturowy
      invoiceId,
      tenantId,
      // Tryb formularzowy
      formId,
      sessionId: clientSessionId,
      // Wspólne
      amount,
      description,
      email,
      returnUrl,
      statusUrl,
      urlReturn,
      urlStatus
    } = body;

    // Walidacja - wymagane: amount i email
    if (!amount || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: amount and email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generuj unikalny sessionId
    const sessionId = clientSessionId || `${tenantId || formId}_${invoiceId || Date.now()}_${Date.now()}`;

    const sign = await generateChecksum({
      sessionId,
      merchantId: parseInt(P24_MERCHANT_ID),
      amount: amount,
      currency: 'PLN'
    });

    // Dane transakcji dla P24
    const finalReturnUrl = urlReturn || returnUrl || `${Deno.env.get('APP_URL')}/billing/success`;
    const finalStatusUrl = urlStatus || statusUrl || `${Deno.env.get('SUPABASE_URL')}/functions/v1/przelewy24-webhook`;

    const transactionData = {
      merchantId: parseInt(P24_MERCHANT_ID),
      posId: parseInt(P24_POS_ID),
      sessionId,
      amount,
      currency: 'PLN',
      description: description || 'Płatność AppSchtomy',
      email,
      country: 'PL',
      language: 'pl',
      urlReturn: finalReturnUrl,
      urlStatus: finalStatusUrl,
      sign,
      encoding: 'UTF-8'
    };

    // Rejestruj transakcję w P24
    const authString = `${P24_POS_ID}:${P24_API_KEY}`;

    const p24Response = await fetch(`${P24_API_URL}/api/v1/transaction/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(authString)}`
      },
      body: JSON.stringify(transactionData)
    });

    const p24Result = await p24Response.json();

    if (p24Result.error || !p24Result.data?.token) {
      console.error('P24 registration error:', p24Result);
      return new Response(
        JSON.stringify({ error: 'Payment registration failed', details: p24Result }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paymentUrl = `${P24_API_URL}/trnRequest/${p24Result.data.token}`;

    // Zapisz transakcję w bazie
    const insertData: Record<string, unknown> = {
      gateway: 'przelewy24',
      gateway_session_id: sessionId,
      gateway_order_id: p24Result.data.token,
      amount,
      status: 'pending',
      gateway_response: p24Result
    };

    if (tenantId) insertData.tenant_id = tenantId;
    if (invoiceId) insertData.invoice_id = invoiceId;

    const { data: transaction, error: dbError } = await supabaseClient
      .from('payment_transactions')
      .insert(insertData)
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Nie blokuj płatności jeśli zapis do bazy się nie uda - token P24 już jest
      return new Response(
        JSON.stringify({
          success: true,
          token: p24Result.data.token,
          paymentUrl
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Aktualizuj fakturę jeśli jest invoiceId
    if (invoiceId) {
      await supabaseClient
        .from('invoices')
        .update({
          payment_url: paymentUrl,
          payment_id: p24Result.data.token
        })
        .eq('id', invoiceId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        token: p24Result.data.token,
        paymentUrl,
        transactionId: transaction.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating payment:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
