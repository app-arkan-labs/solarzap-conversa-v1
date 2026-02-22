import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_TAG = "[[LEAD_META_JSON]]";
const DEFAULT_BUCKET = "knowledge-base";

const asString = (value: unknown, max = 8000): string => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.slice(0, max);
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

const extractTagValue = (text: string, tag: string): string | null => {
  const re = new RegExp(`\\[${tag}:([^\\]]+)\\]`, "i");
  const m = text.match(re);
  if (!m) return null;
  const value = String(m[1] || "").trim();
  return value || null;
};

const normalizeExtractedText = (raw: string): string => {
  const cleaned = raw
    .replaceAll("\u0000", "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
};

const chunkText = (text: string, chunkSize = 1500, overlap = 180, maxChunks = 80): string[] => {
  const normalized = normalizeExtractedText(text);
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const out = current.trim();
    if (out) chunks.push(out);
    current = "";
  };

  for (const p of paragraphs) {
    if (!p) continue;
    if ((current ? current.length + 2 : 0) + p.length <= chunkSize) {
      current = current ? `${current}\n\n${p}` : p;
      continue;
    }

    if (current) pushCurrent();

    if (p.length <= chunkSize) {
      current = p;
      continue;
    }

    // Very large paragraph: fall back to sliding window.
    const stride = Math.max(200, chunkSize - overlap);
    for (let i = 0; i < p.length && chunks.length < maxChunks; i += stride) {
      const slice = p.slice(i, i + chunkSize).trim();
      if (slice) chunks.push(slice);
    }
  }

  if (current) pushCurrent();

  return chunks.slice(0, maxChunks);
};

const extFromPath = (path: string): string => {
  const lowered = String(path || "").toLowerCase();
  const idx = lowered.lastIndexOf(".");
  if (idx < 0) return "";
  return lowered.slice(idx + 1);
};

async function extractTextFromPdf(buf: ArrayBuffer): Promise<string> {
  // Polyfills needed for pdfjs-dist in Deno/Supabase Edge runtime.
  try {
    if (!(globalThis as any).DOMMatrix) {
      const domMatrixMod = await import("npm:@thednp/dommatrix@2.0.12");
      (globalThis as any).DOMMatrix = (domMatrixMod as any)?.default || domMatrixMod;
    }
  } catch (err) {
    throw new Error(`pdf_polyfill_dommatrix_failed:${asString((err as any)?.message || err, 220)}`);
  }
  try {
    // Some pdfjs builds try to detect node via process; in Deno this can be misleading.
    (globalThis as any).process = undefined;
  } catch { /* intentionally empty */ }
  try {
    if (typeof navigator !== "undefined") {
      Object.defineProperty(navigator, "platform", { value: "Linux" });
    }
  } catch { /* intentionally empty */ }

  const pdfjsLib = await import("npm:pdfjs-dist@5.4.149/legacy/build/pdf.mjs").catch((err) => {
    throw new Error(`pdf_module_load_failed:${asString(err?.message || err, 220)}`);
  });

  try {
    if ((pdfjsLib as any)?.GlobalWorkerOptions) {
      const workerPath = "npm:pdfjs-dist@5.4.149/legacy/build/pdf.worker.mjs";
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc =
        (pdfjsLib as any).GlobalWorkerOptions.workerSrc || (import.meta as any).resolve?.(workerPath) || workerPath;
    }
  } catch {
    // best-effort; some builds still parse fine with disableWorker
  }
  const task = (pdfjsLib as any).getDocument({ data: new Uint8Array(buf), disableWorker: true });
  const pdf = await task.promise;
  const pageCount = pdf.numPages || 0;
  const out: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = (content.items as any[])
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .filter(Boolean);
    out.push(strings.join(" "));
  }
  try {
    await (pdf as any).cleanup?.();
  } catch {
    // best-effort
  }
  return out.join("\n\n");
}

async function extractTextFromDocx(buf: ArrayBuffer): Promise<string> {
  const mod = await import("npm:jszip@3.10.1").catch((err) => {
    throw new Error(`docx_module_load_failed:${asString(err?.message || err, 220)}`);
  });
  const JSZip = (mod as any)?.default || mod;
  const zip = await JSZip.loadAsync(buf);

  const candidates = (zip.file(/(^|[\\/])word[\\/]+document\\.xml$/i) as any[]) || [];
  const docFile = candidates[0] || zip.file("word/document.xml") || zip.file("word\\document.xml");
  if (!docFile) throw new Error("docx_missing_word_document_xml");

  const xml = await docFile.async("string");
  if (!xml) return "";

  const decodeXml = (value: string): string =>
    value
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", "\"")
      .replaceAll("&apos;", "'")
      .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCodePoint(Number.parseInt(code, 16)));

  const texts: string[] = [];
  const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const t = decodeXml(String(m[1] || ""));
    if (t) texts.push(t);
  }

  // Also capture some basic line-break semantics.
  const joined = texts.join(" ");
  return joined;
}

async function extractTextFromTxt(buf: ArrayBuffer): Promise<string> {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(new Uint8Array(buf));
}

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

    const serviceClient = createClient(supabaseUrl, supabaseServiceRole);
    const { data: membership, error: membershipError } = await serviceClient
      .from("organization_members")
      .select("org_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership?.org_id) {
      return new Response(JSON.stringify({ error: "organization_membership_not_found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const orgId = String(membership.org_id);

    const body = await req.json().catch(() => ({}));
    const kbItemId = asString(body?.kbItemId || body?.kb_item_id, 80) || null;
    const force = Boolean(body?.force);
    const limit = Math.max(1, Math.min(10, Number(body?.limit || 3)));

    const itemsQuery = serviceClient
      .from("kb_items")
      .select("id, org_id, title, body, status, storage_bucket, storage_path, mime_type, ingested_at, ingestion_error")
      .eq("org_id", orgId)
      .eq("status", "approved");

    const { data: itemsRaw, error: itemsErr } = kbItemId
      ? await itemsQuery.eq("id", kbItemId).limit(1)
      : force
        ? await itemsQuery.order("created_at", { ascending: false }).limit(limit)
        : await itemsQuery.is("ingested_at", null).order("created_at", { ascending: false }).limit(limit);

    if (itemsErr) {
      return new Response(JSON.stringify({ error: itemsErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    if (items.length === 0) {
      return new Response(JSON.stringify({ ingested: [], skipped: [], failed: [], message: "no_items" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = { ingested: [] as any[], skipped: [] as any[], failed: [] as any[] };

    for (const item of items) {
      const existingIngested = item?.ingested_at && !force;
      if (existingIngested) {
        results.skipped.push({ id: item.id, reason: "already_ingested" });
        continue;
      }

      const bodyText = asString(item?.body, 20000);
      const bucket = asString(item?.storage_bucket, 120) || DEFAULT_BUCKET;
      const pathFromColumn = asString(item?.storage_path, 400);
      const pathFromBody = extractTagValue(bodyText, "storage_path") || "";
      const storagePath = pathFromColumn || pathFromBody;

      if (!storagePath) {
        const reason = "missing_storage_path";
        results.failed.push({ id: item.id, error: reason });
        await serviceClient
          .from("kb_items")
          .update({ ingestion_error: reason })
          .eq("id", item.id);
        continue;
      }

      const expectedPrefix = `org/${orgId}/`;
      const legacyPrefix = `${orgId}/`;
      if (!storagePath.startsWith(expectedPrefix) && !storagePath.startsWith(legacyPrefix)) {
        const reason = "storage_path_out_of_org_scope";
        results.failed.push({ id: item.id, error: reason });
        await serviceClient
          .from("kb_items")
          .update({ ingestion_error: reason })
          .eq("id", item.id);
        continue;
      }

      try {
        const { data: blob, error: dlErr } = await serviceClient.storage.from(bucket).download(storagePath);
        if (dlErr || !blob) throw new Error(`download_failed:${dlErr?.message || "no_blob"}`);

        const buf = await blob.arrayBuffer();
        const ext = extFromPath(storagePath);

        let extracted = "";
        let mimeType = asString(item?.mime_type, 120);

        if (ext === "txt") {
          extracted = await extractTextFromTxt(buf);
          mimeType = mimeType || "text/plain";
        } else if (ext === "pdf") {
          extracted = await extractTextFromPdf(buf);
          mimeType = mimeType || "application/pdf";
        } else if (ext === "docx") {
          extracted = await extractTextFromDocx(buf);
          mimeType = mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        } else if (ext === "doc") {
          throw new Error("unsupported_doc_binary");
        } else {
          throw new Error(`unsupported_extension:${ext || "unknown"}`);
        }

        const cleaned = normalizeExtractedText(extracted);
        if (!cleaned) throw new Error("empty_extracted_text");

        const chunks = chunkText(cleaned, 1500, 180, 80);
        if (chunks.length === 0) throw new Error("empty_chunks");

        // Replace chunks for idempotency.
        await serviceClient.from("kb_item_chunks").delete().eq("kb_item_id", item.id);

        const rows = chunks.map((chunkText, idx) => ({
          org_id: orgId,
          kb_item_id: item.id,
          chunk_index: idx,
          chunk_text: chunkText,
        }));
        const { error: insErr } = await serviceClient.from("kb_item_chunks").insert(rows);
        if (insErr) throw new Error(`insert_chunks_failed:${insErr.message}`);

        const { error: updErr } = await serviceClient
          .from("kb_items")
          .update({
            storage_bucket: bucket,
            storage_path: storagePath,
            mime_type: mimeType || null,
            ingested_at: new Date().toISOString(),
            ingestion_error: null,
          })
          .eq("id", item.id);
        if (updErr) throw new Error(`update_kb_items_failed:${updErr.message}`);

        results.ingested.push({ id: item.id, chunks: chunks.length, storagePath, bucket });
      } catch (err: any) {
        const message = asString(err?.message || err, 500) || "ingest_failed";
        results.failed.push({ id: item.id, error: message });
        await serviceClient
          .from("kb_items")
          .update({ ingestion_error: message })
          .eq("id", item.id);
      }
    }

    return new Response(JSON.stringify({ ...results, generatedAt: new Date().toISOString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("kb-ingest error:", error);
    return new Response(JSON.stringify({ error: error?.message || "unexpected_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
