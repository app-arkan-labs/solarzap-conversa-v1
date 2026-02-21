import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_TAG = "[[LEAD_META_JSON]]";

const asString = (value: unknown, max = 2000): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, max);
};

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.floor(n);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
};

const parseLeadMeta = (obs: unknown): Record<string, unknown> => {
  const raw = asString(obs, 20000);
  if (!raw || !raw.includes(META_TAG)) return {};
  try {
    const parts = raw.split(META_TAG);
    if (parts.length < 2) return {};
    const jsonStr = parts[1].replace(/^:\s*/, "").trim();
    const parsed = JSON.parse(jsonStr);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const buildRagQueryText = (input: {
  leadName?: string | null;
  leadObs?: string | null;
  meta?: Record<string, unknown>;
  interactions: Array<{ mensagem?: string; tipo?: string }>;
  comments: Array<{ texto?: string | null }>;
}): string => {
  const parts: string[] = [];

  const leadName = asString(input.leadName, 120);
  if (leadName) parts.push(`Lead: ${leadName}`);

  const meta = input.meta || {};
  const tipoCliente = asString((meta as any)?.tipo_cliente, 40);
  const cidade = asString((meta as any)?.cidade, 80);
  const uf = asString((meta as any)?.uf, 16);
  if (tipoCliente || cidade || uf) {
    parts.push(`Meta: tipo_cliente=${tipoCliente || "-"} cidade=${cidade || "-"} uf=${uf || "-"}`);
  }

  const obs = asString(input.leadObs, 1800);
  if (obs) parts.push(`Observacoes: ${obs}`);

  const lastMsgs = input.interactions
    .slice(Math.max(0, input.interactions.length - 8))
    .map((m) => asString(m?.mensagem, 420))
    .filter(Boolean);
  if (lastMsgs.length > 0) parts.push(`Chat: ${lastMsgs.join(" | ")}`);

  const lastComments = input.comments
    .slice(0, 5)
    .map((c) => asString((c as any)?.texto, 260))
    .filter(Boolean);
  if (lastComments.length > 0) parts.push(`Comentarios: ${lastComments.join(" | ")}`);

  return parts.join("\n");
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
    const user = authData.user;

    const body = await req.json().catch(() => ({}));
    const leadId = Number(body?.leadId || 0);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return new Response(JSON.stringify({ error: "invalid_lead_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limitInteractions = clampInt(body?.limitInteractions, 18, 1, 60);
    const limitComments = clampInt(body?.limitComments, 8, 1, 20);
    const limitDocuments = clampInt(body?.limitDocuments, 4, 0, 12);
    const debug = Boolean(body?.debug);

    const orgId = (user.user_metadata as any)?.org_id || user.id;

    const serviceClient = createClient(supabaseUrl, supabaseServiceRole);

    // Validate ownership before returning sensitive conversation context.
    const { data: leadRow, error: leadErr } = await serviceClient
      .from("leads")
      .select("id, nome, telefone, user_id, observacoes, canal, status_pipeline, created_at")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr || !leadRow || leadRow.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "lead_not_found_or_forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [interactionsRes, commentsRes, companyRes, objectionsRes, testimonialsRes, documentsRes] =
      await Promise.all([
        serviceClient
          .from("interacoes")
          .select("id, created_at, mensagem, tipo, wa_from_me")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(limitInteractions),
        serviceClient
          .from("comentarios_leads")
          .select("texto, autor, created_at")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(limitComments),
        serviceClient
          .from("company_profile")
          .select("elevator_pitch, differentials, installation_process, warranty_info, payment_options")
          .eq("org_id", orgId)
          .maybeSingle(),
        serviceClient
          .from("objection_responses")
          .select("question, response, priority")
          .eq("org_id", orgId)
          .order("priority", { ascending: true })
          .limit(8),
        serviceClient
          .from("testimonials")
          .select("display_name, quote_short, type")
          .eq("org_id", orgId)
          .eq("status", "approved")
          .limit(6),
        limitDocuments > 0
          ? serviceClient
              .from("kb_items")
              .select("id, type, title, body, tags, created_at")
              .eq("org_id", orgId)
              .eq("status", "approved")
              .order("created_at", { ascending: false })
              .limit(limitDocuments)
          : Promise.resolve({ data: [], error: null }),
      ]);

    const meta = parseLeadMeta((leadRow as any)?.observacoes);

    const interactions = (interactionsRes.error ? [] : interactionsRes.data || [])
      .map((row: any) => ({
        id: row?.id,
        created_at: row?.created_at || null,
        // Keep both for flexibility in prompt engineering.
        wa_from_me: Boolean(row?.wa_from_me),
        tipo: asString(row?.tipo, 40),
        mensagem: asString(row?.mensagem, 900),
      }))
      .reverse();

    const documents = (documentsRes as any)?.error
      ? []
      : ((documentsRes as any)?.data || []).map((row: any) => ({
          id: row?.id,
          type: asString(row?.type, 40),
          title: asString(row?.title, 140),
          tags: Array.isArray(row?.tags) ? row.tags.map((t: unknown) => asString(t, 40)).slice(0, 12) : [],
          created_at: row?.created_at || null,
          body_snippet: asString(row?.body, 2600),
        }));

    const comments = commentsRes.error ? [] : commentsRes.data || [];
    let documentsRelevant: Array<{ id: string; type: string; title: string; body_snippet: string }> = [];
    let ragDebug: Record<string, unknown> | null = null;

    try {
      const queryText = buildRagQueryText({
        leadName: (leadRow as any)?.nome,
        leadObs: (leadRow as any)?.observacoes,
        meta,
        interactions,
        comments,
      });

      if (queryText) {
        const { data: ragRows, error: ragErr } = await serviceClient.rpc("knowledge_search_v3", {
          p_org_id: orgId,
          p_query_text: queryText,
          p_limit: 12,
        });

        if (debug) {
          ragDebug = {
            query_preview: queryText.slice(0, 600),
            rag_error: ragErr?.message || null,
            rag_count: Array.isArray(ragRows) ? ragRows.length : 0,
            rag_types: Array.isArray(ragRows) ? ragRows.slice(0, 8).map((r: any) => r?.item_type) : [],
          };
        }

        if (!ragErr && Array.isArray(ragRows)) {
          documentsRelevant = ragRows
            .filter((r: any) => r?.item_type === "kb_chunk" || r?.item_type === "kb_item")
            .map((r: any) => ({
              id: String(r?.item_id || ""),
              type: asString(r?.item_type, 40) || "kb_chunk",
              title: asString(r?.title_or_name, 140) || "Documento",
              body_snippet: asString(r?.content_snippet, 2600),
            }))
            .filter((d) => d.id && (d.title || d.body_snippet))
            .slice(0, 6);
        }
      }
    } catch (ragErr) {
      console.warn("proposal-context-engine rag error (non-blocking):", ragErr);
    }

    return new Response(
      JSON.stringify({
        lead: {
          id: leadRow.id,
          nome: leadRow.nome || null,
          telefone: leadRow.telefone || null,
          canal: leadRow.canal || null,
          status_pipeline: leadRow.status_pipeline || null,
          created_at: leadRow.created_at || null,
          meta,
        },
        orgId,
        interactions,
        comments,
        companyProfile: companyRes.error ? null : companyRes.data || null,
        objections: objectionsRes.error ? [] : objectionsRes.data || [],
        testimonials: testimonialsRes.error ? [] : testimonialsRes.data || [],
        documents,
        documentsRelevant,
        ragDebug: debug ? ragDebug : undefined,
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("proposal-context-engine error:", error);
    return new Response(JSON.stringify({ error: error?.message || "unexpected_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
