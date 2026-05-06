/**
 * Supabase Edge Function - Przelewy24 Webhook
 * Obsługuje powiadomienia o statusie płatności z Przelewy24
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

async function generateChecksum(data: Record<string, string | number>): Promise<string> {
  const checksumData = { ...data, crc: P24_CRC };
  const stringToHash = JSON.stringify(checksumData);

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(stringToHash);
  const hashBuffer = await crypto.subtle.digest('SHA-384', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // P24 może wysłać OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // P24 może wysyłać dane jako JSON lub form-data — obsłuż oba formaty
    let merchantId: string, posId: string, sessionId: string, amount: string,
        originAmount: string, currency: string, orderId: string, methodId: string,
        statement: string, sign: string;

    const contentType = req.headers.get('content-type') || '';
    console.log('P24 Webhook - content-type:', contentType, 'method:', req.method);

    if (contentType.includes('application/json')) {
      const json = await req.json();
      console.log('P24 Webhook JSON body:', JSON.stringify(json));
      merchantId = String(json.merchantId);
      posId = String(json.posId);
      sessionId = String(json.sessionId);
      amount = String(json.amount);
      originAmount = String(json.originAmount);
      currency = String(json.currency);
      orderId = String(json.orderId);
      methodId = String(json.methodId);
      statement = String(json.statement || '');
      sign = String(json.sign);
    } else {
      const formData = await req.formData();
      console.log('P24 Webhook form entries:', [...formData.entries()].map(([k,v]) => `${k}=${v}`).join(', '));
      merchantId = formData.get('merchantId') as string;
      posId = formData.get('posId') as string;
      sessionId = formData.get('sessionId') as string;
      amount = formData.get('amount') as string;
      originAmount = formData.get('originAmount') as string;
      currency = formData.get('currency') as string;
      orderId = formData.get('orderId') as string;
      methodId = formData.get('methodId') as string;
      statement = formData.get('statement') as string || '';
      sign = formData.get('sign') as string;
    }

    console.log('P24 Webhook parsed:', { merchantId, posId, sessionId, orderId, amount, currency, sign: sign?.substring(0, 10) + '...' });

    // Walidacja merchantId
    if (merchantId !== P24_MERCHANT_ID) {
      console.error('Invalid merchantId:', merchantId, 'expected:', P24_MERCHANT_ID);
      return new Response('Invalid merchantId', { status: 400 });
    }

    // Znajdź transakcję w bazie
    const { data: transaction, error: txError } = await supabaseClient
      .from('payment_transactions')
      .select('*')
      .eq('gateway_session_id', sessionId)
      .single();

    if (txError || !transaction) {
      console.error('Transaction not found for sessionId:', sessionId, 'error:', txError);
      return new Response('Transaction not found', { status: 404 });
    }

    console.log('Transaction found:', transaction.id);

    // Weryfikuj transakcję w P24
    const verifySign = await generateChecksum({
      sessionId,
      orderId: parseInt(orderId),
      amount: parseInt(amount),
      currency
    });

    const verifyData = {
      merchantId: parseInt(P24_MERCHANT_ID),
      posId: parseInt(P24_POS_ID),
      sessionId,
      amount: parseInt(amount),
      currency,
      orderId: parseInt(orderId),
      sign: verifySign
    };

    console.log('P24 verify request:', JSON.stringify(verifyData));

    const verifyResponse = await fetch(`${P24_API_URL}/api/v1/transaction/verify`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${P24_POS_ID}:${P24_API_KEY}`)}`
      },
      body: JSON.stringify(verifyData)
    });

    const verifyResult = await verifyResponse.json();
    console.log('P24 verify response:', verifyResponse.status, JSON.stringify(verifyResult));

    if (verifyResult.data?.status === 'success') {
      await supabaseClient
        .from('payment_transactions')
        .update({
          status: 'completed',
          gateway_transaction_id: orderId,
          completed_at: new Date().toISOString(),
          gateway_response: { ...transaction.gateway_response, verify: verifyResult }
        })
        .eq('id', transaction.id);

      console.log('Payment verified successfully:', orderId);
    } else {
      await supabaseClient
        .from('payment_transactions')
        .update({
          status: 'failed',
          error_message: verifyResult.error || 'Verification failed',
          gateway_response: { ...transaction.gateway_response, verify: verifyResult }
        })
        .eq('id', transaction.id);

      console.error('Payment verification failed:', verifyResult);
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error?.message || error, 'stack:', error?.stack);
    return new Response('Internal error', { status: 500 });
  }
});
