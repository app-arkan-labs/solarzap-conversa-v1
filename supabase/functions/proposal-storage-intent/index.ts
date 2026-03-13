import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveRequestCors } from "../_shared/cors.ts";

const asString = (value: unknown, max = 512): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, max);
};

const clampInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.floor(n);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
};

const sanitizeFileName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 140);

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req);
  const corsHeaders = cors.corsHeaders;

  if (req.method === "OPTIONS") {
    if (cors.missingAllowedOriginConfig) {
      return new Response(JSON.stringify({ error: "missing_allowed_origin" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!cors.originAllowed) {
      return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response("ok", { headers: corsHeaders });
  }

  if (cors.missingAllowedOriginConfig) {
    return new Response(JSON.stringify({ error: "missing_allowed_origin" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!cors.originAllowed) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
    const leadId = clampInt(body?.leadId, 0, 0, 9_000_000_000);
    const fileName = asString(body?.fileName, 220);
    const sizeBytes = clampInt(body?.sizeBytes, 0, 0, 250 * 1024 * 1024);
    const mimeType = asString(body?.mimeType, 120) || "application/pdf";

    if (!fileName || sizeBytes <= 0) {
      return new Response(JSON.stringify({ error: "missing_fileName_or_size" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bucketName = "proposals";
    const admin = createClient(supabaseUrl, supabaseServiceRole);

    // Ensure bucket exists (idempotent) and keep it private by default.
    const { data: bucket, error: bucketErr } = await admin.storage.getBucket(bucketName);
    if (bucketErr || !bucket) {
      // Keep the payload minimal; some Storage API deployments reject extra options here.
      const { error: createErr } = await admin.storage.createBucket(bucketName, { public: false });
      if (createErr && !String(createErr.message || "").toLowerCase().includes("already exists")) {
        throw createErr;
      }
    } else if (bucket.public) {
      // Best-effort: proposals should be private for trackable links.
      try {
        await admin.storage.updateBucket(bucketName, { public: false });
      } catch {
        // ignore
      }
    }

    const safeName = sanitizeFileName(fileName);
    const path =
      `${authData.user.id}/${leadId || "general"}/${Date.now()}_${
        Math.random().toString(36).slice(2, 8)
      }_${safeName}`;

    const { data: uploadData, error: uploadError } = await admin.storage
      .from(bucketName)
      .createSignedUploadUrl(path);
    if (uploadError) throw uploadError;

    return new Response(
      JSON.stringify({
        bucket: bucketName,
        path,
        uploadUrl: uploadData.signedUrl,
        token: uploadData.token,
        mimeType,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("proposal-storage-intent error:", err);
    const message = err?.message ? String(err.message) : String(err);
    return new Response(JSON.stringify({ error: "internal_error", message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
