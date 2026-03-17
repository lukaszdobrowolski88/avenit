# 📋 Instrukcja: Wklejanie Edge Function w Supabase Dashboard

## Krok 1: Otwórz Supabase Dashboard

1. Przejdź do: https://app.supabase.com
2. Zaloguj się do swojego konta
3. Wybierz swój projekt (church-manager)

## Krok 2: Przejdź do Edge Functions

1. W menu bocznym kliknij **Edge Functions**
2. Kliknij przycisk **Create a new function**

## Krok 3: Stwórz funkcję

1. **Name**: wpisz `send-program-email`
2. Pozostaw domyślny szablon lub usuń go całkowicie

## Krok 4: Skopiuj kod

Otwórz plik w swoim projekcie:
```
supabase/functions/send-program-email/READY_TO_PASTE.ts
```

lub skopiuj kod poniżej:

---

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    let bodyData;
    try {
      bodyData = JSON.parse(rawBody);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Received keys:", Object.keys(bodyData));

    const { emailTo, subject, htmlBody, pdfUrl, filename, filePath } = bodyData;

    if (!emailTo || emailTo.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing emailTo field or empty recipients list" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!htmlBody) {
      return new Response(
        JSON.stringify({ error: "Missing htmlBody field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const attachments: Array<{ content: string; filename: string }> = [];

    if (filePath) {
      try {
        console.log("Downloading PDF from Supabase Storage:", filePath);

        const { data: pdfData, error: downloadError } = await supabase
          .storage
          .from('programs')
          .download(filePath);

        if (downloadError) {
          throw new Error(`Failed to download PDF: ${downloadError.message}`);
        }

        const arrayBuffer = await pdfData.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const pdfBase64 = btoa(binary);

        attachments.push({
          content: pdfBase64,
          filename: filename || "program.pdf",
        });

        console.log(`PDF downloaded successfully (${bytes.length} bytes) and converted to base64`);
      } catch (error: any) {
        console.error("Error downloading PDF from Supabase:", error);
        return new Response(
          JSON.stringify({ error: "Failed to download PDF from Supabase Storage", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (pdfUrl) {
      try {
        console.log("Fetching PDF from URL:", pdfUrl);
        const pdfResponse = await fetch(pdfUrl);

        if (!pdfResponse.ok) {
          throw new Error(`Failed to fetch PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
        }

        const pdfArrayBuffer = await pdfResponse.arrayBuffer();
        const bytes = new Uint8Array(pdfArrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const pdfBase64 = btoa(binary);

        attachments.push({
          content: pdfBase64,
          filename: filename || "program.pdf",
        });

        console.log("PDF fetched from URL and converted to base64 successfully");
      } catch (error: any) {
        console.error("Error fetching PDF:", error);
        return new Response(
          JSON.stringify({ error: "Failed to fetch PDF from URL", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("Sending email to:", emailTo);
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "App SchWro <program@schwro.pl>",
        to: emailTo,
        subject: subject || "Program nabożeństwa",
        html: htmlBody,
        attachments: attachments,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API Error:", resendData);
      return new Response(
        JSON.stringify({ error: "Resend API Error", details: resendData }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully:", resendData);
    return new Response(JSON.stringify(resendData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Server Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

---

## Krok 5: Wklej kod

1. Zaznacz CAŁY kod powyżej (Ctrl+A lub Cmd+A)
2. Skopiuj (Ctrl+C lub Cmd+C)
3. W Supabase Dashboard, w edytorze funkcji, usuń istniejący kod
4. Wklej skopiowany kod (Ctrl+V lub Cmd+V)

## Krok 6: Zapisz i Deploy

1. Kliknij przycisk **Deploy** (lub **Save and Deploy**)
2. Poczekaj na zakończenie deploymentu (pojawi się zielony checkmark ✅)

## Krok 7: Ustaw zmienne środowiskowe

W Supabase Dashboard:

1. Przejdź do **Project Settings** (ikona koła zębatego w lewym dolnym rogu)
2. Kliknij **Edge Functions** w menu bocznym
3. Przewiń do sekcji **Secrets**
4. Dodaj nowy secret:
   - **Name**: `RESEND_API_KEY`
   - **Value**: Twój klucz API z https://resend.com/api-keys (np. `re_xxxxxxxxxxxxx`)
5. Kliknij **Add secret**

**Uwaga:** `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` są automatycznie dostępne - nie musisz ich dodawać.

## Krok 8: Sprawdź bucket 'programs'

1. W menu bocznym kliknij **Storage**
2. Sprawdź czy bucket `programs` istnieje
3. Jeśli NIE istnieje:
   - Kliknij **New bucket**
   - Name: `programs`
   - **Public bucket**: ✅ Zaznacz
   - Kliknij **Create bucket**

## Krok 9: Testowanie

1. Wróć do swojej aplikacji
2. Otwórz program
3. Kliknij **PDF** - wygeneruj PDF
4. Kliknij **Mail** - wyślij email
5. Sprawdź skrzynkę email

## Sprawdzanie logów

Jeśli coś nie działa, sprawdź logi:

1. W Supabase Dashboard → **Edge Functions**
2. Kliknij na funkcję `send-program-email`
3. Przejdź do zakładki **Logs**
4. Zobacz szczegóły błędów lub udanych wysyłek

## Troubleshooting

### Email nie ma załącznika

Sprawdź logi - powinien być widoczny komunikat:
```
PDF downloaded successfully (XXX bytes) and converted to base64
```

Jeśli nie ma tego komunikatu:
- Sprawdź czy PDF istnieje w Storage (Dashboard → Storage → programs)
- Sprawdź czy `filePath` jest poprawny w logach

### Błąd: "bucket 'programs' does not exist"

Zobacz **Krok 8** - musisz utworzyć bucket w Storage.

### Błąd: "Missing RESEND_API_KEY"

Zobacz **Krok 7** - ustaw klucz API Resend w secrets.

---

## ✅ Gotowe!

Po wykonaniu tych kroków funkcja powinna działać poprawnie i wysyłać emaile z załącznikami PDF!
