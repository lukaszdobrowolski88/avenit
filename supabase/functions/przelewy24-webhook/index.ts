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

/**
 * Generuje sumę kontrolną dla weryfikacji P24
 */
async function generateVerifyChecksum(data: Record<string, string | number>): Promise<string> {
  const checksumData = { ...data, crc: P24_CRC };
  const stringToHash = JSON.stringify(checksumData);

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(stringToHash);
  const hashBuffer = await crypto.subtle.digest('SHA-384', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Parsuj dane z POST
    const formData = await req.formData();
    const merchantId = formData.get('merchantId') as string;
    const posId = formData.get('posId') as string;
    const sessionId = formData.get('sessionId') as string;
    const amount = formData.get('amount') as string;
    const originAmount = formData.get('originAmount') as string;
    const currency = formData.get('currency') as string;
    const orderId = formData.get('orderId') as string;
    const methodId = formData.get('methodId') as string;
    const statement = formData.get('statement') as string;
    const sign = formData.get('sign') as string;

    console.log('P24 Webhook received:', { sessionId, orderId, amount });

    // Walidacja merchantId
    if (merchantId !== P24_MERCHANT_ID) {
      console.error('Invalid merchantId');
      return new Response('Invalid merchantId', { status: 400 });
    }

    // Znajdź transakcję w bazie
    const { data: transaction, error: txError } = await supabaseClient
      .from('payment_transactions')
      .select('*')
      .eq('gateway_session_id', sessionId)
      .single();

    if (txError || !transaction) {
      console.error('Transaction not found:', sessionId);
      return new Response('Transaction not found', { status: 404 });
    }

    // Weryfikuj podpis
    const expectedSign = await generateVerifyChecksum({
      merchantId: parseInt(merchantId),
      posId: parseInt(posId),
      sessionId,
      amount: parseInt(amount),
      originAmount: parseInt(originAmount),
      orderId: parseInt(orderId),
      methodId: parseInt(methodId),
      statement,
      currency
    });

    if (sign !== expectedSign) {
      console.error('Invalid signature');
      await supabaseClient
        .from('payment_transactions')
        .update({
          status: 'failed',
          error_message: 'Invalid webhook signature',
          gateway_response: { merchantId, posId, sessionId, orderId, amount, currency, sign }
        })
        .eq('id', transaction.id);
      return new Response('Invalid signature', { status: 400 });
    }

    // Weryfikuj transakcję w P24
    const verifyData = {
      merchantId: parseInt(P24_MERCHANT_ID),
      posId: parseInt(P24_POS_ID),
      sessionId,
      amount: parseInt(amount),
      currency,
      orderId: parseInt(orderId),
      sign: await generateVerifyChecksum({
        sessionId,
        orderId: parseInt(orderId),
        amount: parseInt(amount),
        currency
      })
    };

    const verifyResponse = await fetch(`${P24_API_URL}/api/v1/transaction/verify`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${P24_POS_ID}:${P24_API_KEY}`)}`
      },
      body: JSON.stringify(verifyData)
    });

    const verifyResult = await verifyResponse.json();

    if (verifyResult.data?.status === 'success') {
      // Płatność zweryfikowana pomyślnie
      await supabaseClient
        .from('payment_transactions')
        .update({
          status: 'completed',
          gateway_transaction_id: orderId,
          completed_at: new Date().toISOString(),
          gateway_response: { ...transaction.gateway_response, verify: verifyResult }
        })
        .eq('id', transaction.id);

      // Faktura zostanie zaktualizowana automatycznie przez trigger w bazie
      console.log('Payment verified successfully:', orderId);

    } else {
      // Weryfikacja nieudana
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

    // P24 wymaga odpowiedzi "OK" na webhook
    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Internal error', { status: 500 });
  }
});
