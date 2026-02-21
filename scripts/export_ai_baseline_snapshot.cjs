const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const transitionMap = {
  novo_lead: ['respondeu', 'perdido'],
  respondeu: ['chamada_agendada', 'visita_agendada', 'perdido', 'respondeu'],
  chamada_agendada: ['chamada_realizada', 'nao_compareceu', 'perdido'],
  nao_compareceu: ['chamada_agendada', 'visita_agendada', 'perdido'],
  chamada_realizada: ['aguardando_proposta', 'perdido'],
  aguardando_proposta: ['proposta_pronta', 'visita_agendada', 'perdido'],
  proposta_pronta: ['proposta_negociacao', 'perdido'],
  visita_agendada: ['visita_realizada', 'nao_compareceu', 'perdido'],
  visita_realizada: ['proposta_negociacao', 'perdido'],
  proposta_negociacao: ['financiamento', 'aprovou_projeto', 'contrato_assinado', 'perdido'],
  financiamento: ['aprovou_projeto', 'contrato_assinado', 'perdido'],
  aprovou_projeto: ['contrato_assinado', 'perdido']
};

(async () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const [aiSettings, aiStageConfig, waInstances] = await Promise.all([
    supabase.from('ai_settings').select('*').order('org_id', { ascending: true }),
    supabase.from('ai_stage_config').select('*').order('org_id', { ascending: true }).order('pipeline_stage', { ascending: true }),
    supabase.from('whatsapp_instances').select('*').order('org_id', { ascending: true }).order('instance_name', { ascending: true }),
  ]);

  for (const [name, resp] of Object.entries({ aiSettings, aiStageConfig, waInstances })) {
    if (resp.error) {
      console.error(`${name} error:`, resp.error.message);
      process.exit(1);
    }
  }

  const payload = {
    generated_at_utc: now.toISOString(),
    source: 'pre-implementation baseline snapshot',
    rollback_instructions: {
      restore_tables: [
        'Use the JSON arrays in this file to restore rows (upsert by natural keys: ai_settings.org_id, ai_stage_config.org_id+pipeline_stage, whatsapp_instances.id or org_id+instance_name).',
        'Preferred rollback: run SQL transaction with temp staging tables and upsert from this snapshot.',
      ],
      transition_map: 'Restore STAGE_TRANSITION_MAP in supabase/functions/ai-pipeline-agent/index.ts using baseline_transition_map_legacy_current.'
    },
    baseline_transition_map_legacy_current: transitionMap,
    counts: {
      ai_settings: aiSettings.data.length,
      ai_stage_config: aiStageConfig.data.length,
      whatsapp_instances: waInstances.data.length,
    },
    ai_settings: aiSettings.data,
    ai_stage_config: aiStageConfig.data,
    whatsapp_instances: waInstances.data,
  };

  const outDir = path.join(process.cwd(), 'docs');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `baseline_ai_snapshot_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(outPath);
})();
