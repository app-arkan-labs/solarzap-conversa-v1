import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TARGET_ORG_ID = Deno.env.get("TARGET_ORG_ID") || Deno.env.get("ORG_ID");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TARGET_ORG_ID) {
  console.error("Missing required env vars.");
  console.error("Required: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, TARGET_ORG_ID (or ORG_ID).");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const UPDATES = [
  { stage: "novo_lead", prompt: `...` },
  { stage: "respondeu", prompt: `...` },
  { stage: "chamada_agendada", prompt: `...` },
  { stage: "nao_compareceu", prompt: `...` },
  { stage: "visita_agendada", prompt: `...` },
  { stage: "visita_realizada", prompt: `...` },
  { stage: "chamada_realizada", prompt: `...` },
  { stage: "aguardando_proposta", prompt: `...` },
  { stage: "proposta_pronta", prompt: `...` },
  { stage: "proposta_negociacao", prompt: `...` },
  { stage: "financiamento", prompt: `...` },
  { stage: "aprovou_projeto", prompt: `...` },
  { stage: "contrato_assinado", prompt: `...` },
  { stage: "perdido", prompt: `...` },
];

async function main() {
  console.log(`Starting prompt updates for org ${TARGET_ORG_ID}...`);

  let successCount = 0;

  for (const update of UPDATES) {
    if (update.prompt === "..." || update.prompt.includes("TODO:")) {
      console.log(`Skipping ${update.stage} (placeholder).`);
      continue;
    }

    const { error } = await supabase
      .from("ai_stage_config")
      .upsert(
        {
          org_id: TARGET_ORG_ID,
          pipeline_stage: update.stage,
          prompt_override: update.prompt.trim(),
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,pipeline_stage" },
      );

    if (error) {
      console.error(`Failed to update ${update.stage}: ${error.message}`);
      continue;
    }

    successCount++;
    console.log(`Updated ${update.stage}.`);
  }

  console.log(`Done. Updated ${successCount} stage(s).`);
}

main();
