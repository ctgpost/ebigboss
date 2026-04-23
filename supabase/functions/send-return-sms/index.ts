// Sends an SMS notification to a customer when a return is approved/rejected.
// Requires Twilio connector + LOVABLE_API_KEY to actually send. If Twilio is not
// configured the function returns a graceful "skipped" response so the UI flow
// is never blocked.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

interface Payload {
  to: string;            // E.164 e.g. +8801712345678 (we accept 01XXXXXXXXX too)
  body: string;          // SMS text (Bengali OK; Twilio handles UCS-2)
  from?: string;         // optional Twilio number override
}

function normalizeBdNumber(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("880") && digits.length === 13) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+88${digits}`;
  if (digits.startsWith("+")) return digits;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { to, body, from } = (await req.json()) as Payload;

    if (!to || !body) {
      return new Response(JSON.stringify({ ok: false, error: "to and body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalized = normalizeBdNumber(to);
    if (!normalized) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const TWILIO_FROM = from || Deno.env.get("TWILIO_FROM_NUMBER");

    if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !TWILIO_FROM) {
      // Not configured yet → skip silently so the return flow keeps working.
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "Twilio not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const gateway = "https://connector-gateway.lovable.dev/twilio";
    const res = await fetch(`${gateway}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: normalized, From: TWILIO_FROM, Body: body }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: data }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, sid: data.sid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
