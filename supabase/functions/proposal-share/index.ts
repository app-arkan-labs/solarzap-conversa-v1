import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");
if (!ALLOWED_ORIGIN) {
  throw new Error("Missing ALLOWED_ORIGIN env");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const base64urlToBytes = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToBase64url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
};

const verifyToken = async (
  token: string,
  secret: string,
): Promise<{ pv: string; exp: number } | null> => {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  if (!h || !p || !sig) return null;
  const msg = `${h}.${p}`;
  const expectedSig = bytesToBase64url(await hmacSha256(secret, msg));
  if (!timingSafeEqual(sig, expectedSig)) return null;

  try {
    const payloadJson = new TextDecoder().decode(base64urlToBytes(p));
    const payload = JSON.parse(payloadJson) as any;
    const pv = typeof payload?.pv === "string" ? payload.pv : "";
    const exp = Number(payload?.exp || 0);
    if (!pv || !Number.isFinite(exp) || exp <= 0) return null;
    if (Math.floor(Date.now() / 1000) > exp) return null;
    return { pv, exp };
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseServiceRole) {
      return new Response(JSON.stringify({ error: "missing_supabase_env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const url = new URL(req.url);
    const token =
      url.searchParams.get("token") ||
      (await req.json().catch(() => ({}))).token ||
      "";
    if (!token) {
      return new Response(JSON.stringify({ error: "missing_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verified = await verifyToken(token, secret);
    if (!verified) {
      return new Response(JSON.stringify({ error: "invalid_or_expired_token" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceRole);
    const { data: versionRow, error: versionErr } = await admin
      .from("proposal_versions")
      .select("id, proposta_id, lead_id, user_id, premium_payload")
      .eq("id", verified.pv)
      .maybeSingle();
    if (versionErr || !versionRow?.id) {
      return new Response(JSON.stringify({ error: "proposal_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bucket = String((versionRow as any)?.premium_payload?.storage?.bucket || "");
    const path = String((versionRow as any)?.premium_payload?.storage?.path || "");
    if (!bucket || !path) {
      return new Response(JSON.stringify({ error: "proposal_storage_missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Track opening (best-effort).
    try {
      await admin.from("proposal_delivery_events").insert({
        proposal_version_id: versionRow.id,
        proposta_id: versionRow.proposta_id,
        lead_id: versionRow.lead_id,
        user_id: versionRow.user_id,
        channel: "web",
        event_type: "opened",
        metadata: {
          exp: verified.exp,
          ua: req.headers.get("user-agent") || null,
        },
      });
    } catch {
      // ignore
    }

    const { data: signed, error: signedErr } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, 60);
    if (signedErr || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: "failed_to_create_signed_url" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return Response.redirect(signed.signedUrl, 302);
  } catch (err) {
    console.error("proposal-share error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

