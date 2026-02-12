import { createClient } from "npm:@supabase/supabase-js@2";

// 1. CONFIGURE CREDENTIALS
// We attempt to read from environment variables first.
// If running locally without env vars set, you can temporarily uncomment the fallbacks below (BUT DO NOT COMMIT SECRETS).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "https://ucwmcmdwbvrwotuzlmxh.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY.includes("YOUR_")) {
    console.error("❌ Error: Missing SUPABASE_SERVICE_ROLE_KEY.");
    console.error("👉 Please set 'SUPABASE_SERVICE_ROLE_KEY' environment variable.");
    Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 2. PASTE YOUR PROTOCOLS HERE
// Use backticks (`) for multi-line strings. No need to escape quotes/newlines.
const UPDATES = [
    {
        stage: "novo_lead",
        prompt: `...` // TODO: Paste 'Novo Lead' protocol here
    },
    {
        stage: "respondeu",
        prompt: `...` // TODO: Paste 'Respondeu' protocol here
    },
    {
        stage: "chamada_agendada",
        prompt: `...` // TODO: Paste 'Chamada Agendada' protocol here
    },
    {
        stage: "nao_compareceu",
        prompt: `...` // TODO: Paste 'Não Compareceu' protocol here
    },
    {
        stage: "visita_agendada",
        prompt: `...` // TODO: Paste 'Visita Agendada' protocol here
    },
    {
        stage: "visita_realizada",
        prompt: `...` // TODO: Paste 'Visita Realizada' protocol here
    },
    {
        stage: "chamada_realizada",
        prompt: `...` // TODO: Paste 'Chamada Realizada' protocol here
    },
    {
        stage: "aguardando_proposta",
        prompt: `...` // TODO: Paste 'Aguardando Proposta' protocol here
    },
    {
        stage: "proposta_pronta",
        prompt: `...` // TODO: Paste 'Proposta Pronta' protocol here
    },
    {
        stage: "proposta_negociacao",
        prompt: `...` // TODO: Paste 'Proposta em Negociação' protocol here
    },
    {
        stage: "financiamento",
        prompt: `...` // TODO: Paste 'Financiamento' protocol here
    },
    {
        stage: "aprovou_projeto",
        prompt: `...` // TODO: Paste 'Aprovou Projeto' protocol here
    },
    {
        stage: "contrato_assinado",
        prompt: `...` // TODO: Paste 'Contrato Assinado' protocol here
    },
    {
        stage: "perdido",
        prompt: `...` // TODO: Paste 'Perdido' protocol here
    }
];

async function main() {
    console.log(`🚀 Starting Prompt Updates... [${UPDATES.length} stages declared]`);

    let successCount = 0;
    for (const update of UPDATES) {
        if (update.prompt === '...' || update.prompt.includes('TODO:')) {
            console.log(`⏩ Skipping '${update.stage}' (Placeholder detected)`);
            continue;
        }

        console.log(`\n🔹 Processing stage: '${update.stage}'...`);

        const { data, error } = await supabase
            .from('ai_stage_config')
            .upsert({
                pipeline_stage: update.stage,
                prompt_override: update.prompt.trim(),
                is_active: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'pipeline_stage' })
            .select();

        if (error) {
            console.error(`❌ Failed to update '${update.stage}':`, error.message);
        } else {
            console.log(`✅ Success! Updated '${update.stage}'. Length: ${update.prompt.length} chars.`);
            successCount++;
        }
    }

    console.log(`\n✨ Done. Updated ${successCount} stages.`);
}

main();
