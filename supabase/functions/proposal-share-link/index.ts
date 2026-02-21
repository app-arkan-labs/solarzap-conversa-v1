import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const asString = (value: unknown, max = 1200): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, max);
};

const base64urlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64urlEncodeJson = (obj: unknown): string =>
  base64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
};

const hmacSha256 = async (secret: string, data: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
};

const signToken = async (
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> => {
  const header = { alg: "HS256", typ: "PROP" };
  const h = base64urlEncodeJson(header);
  const p = base64urlEncodeJson(payload);
  const msg = `${h}.${p}`;
  const sig = base64urlEncode(await hmacSha256(secret, msg));
  return `${msg}.${sig}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRole) {
      return new Response(JSON.stringify({ error: "missing_supabase_env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const proposalVersionId = asString(body?.proposalVersionId, 120);
    if (!proposalVersionId) {
      return new Response(JSON.stringify({ error: "missing_proposalVersionId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate ownership via RLS (authClient).
    const { data: versionRow, error: versionErr } = await authClient
      .from("proposal_versions")
      .select("id, lead_id, proposta_id, premium_payload")
      .eq("id", proposalVersionId)
      .maybeSingle();

    if (versionErr || !versionRow?.id) {
      return new Response(JSON.stringify({ error: "proposal_version_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validityDaysRaw = (versionRow as any)?.premium_payload?.proposal_validity_days;
    const validityDays = Number.isFinite(Number(validityDaysRaw)) && Number(validityDaysRaw) > 0
      ? Math.min(120, Math.max(7, Math.floor(Number(validityDaysRaw))))
      : 30;

    const exp = Math.floor(Date.now() / 1000) + validityDays * 24 * 60 * 60;
    const payload = { pv: proposalVersionId, exp };

    const secret =
      Deno.env.get("PROPOSAL_SHARE_HMAC_SECRET") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "";
    if (!secret) {
      return new Response(JSON.stringify({ error: "missing_share_secret" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await signToken(payload, secret);
    const url = `${supabaseUrl}/functions/v1/proposal-share?token=${encodeURIComponent(token)}`;

    // Best-effort: record link generation (does not imply it was sent).
    try {
      const admin = createClient(supabaseUrl, supabaseServiceRole);
      await admin.from("proposal_delivery_events").insert({
        proposal_version_id: versionRow.id,
        proposta_id: versionRow.proposta_id,
        lead_id: versionRow.lead_id,
        user_id: authData.user.id,
        channel: "crm",
        event_type: "shared",
        metadata: { kind: "link_generated", exp, url_preview: url.slice(0, 80) },
      });
    } catch {
      // ignore
    }

    return new Response(JSON.stringify({ token, url, exp }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("proposal-share-link error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

