-- P0 hotfix: reseed ai_stage_config for each org with leads (idempotent)
-- Date: 2026-02-19

with default_template(pipeline_stage, is_active, agent_goal, default_prompt) as (
  values
    ('novo_lead', true, 'Iniciar o contato e obter resposta do lead.', 'Voce e um consultor solar. Inicie o contato com clareza, valide interesse e avance para resposta ativa.'),
    ('respondeu', true, 'Qualificar necessidade e contexto do lead.', 'Aprofunde o diagnostico do lead, confirme perfil e colete dados para proxima etapa.'),
    ('chamada_agendada', true, 'Confirmar o agendamento e reduzir no-show.', 'Confirme horario e canal da chamada, reforce valor da conversa e reduza risco de ausencia.'),
    ('nao_compareceu', true, 'Recuperar o contato apos ausencia.', 'Reengaje o lead com empatia, reproponha horario e recupere o fluxo comercial.'),
    ('chamada_realizada', true, 'Consolidar resultado da chamada e proximo passo.', 'Recapitule os pontos da chamada e encaminhe para preparacao de proposta.'),
    ('aguardando_proposta', true, 'Preparar lead para recebimento da proposta.', 'Mantenha o lead aquecido enquanto a proposta e preparada e confirme expectativas.'),
    ('proposta_pronta', true, 'Apresentar proposta e orientar leitura.', 'Apresente a proposta com objetividade, destaque ganhos e conduza para decisao.'),
    ('visita_agendada', true, 'Garantir comparecimento e contexto da visita.', 'Confirme detalhes logisticos da visita e expectativas para aproveitamento maximo.'),
    ('visita_realizada', true, 'Converter visita em avancos concretos.', 'Registre resultado da visita e conduza para proxima decisao comercial.'),
    ('proposta_negociacao', true, 'Conduzir negociacao com margem e previsibilidade.', 'Negocie com transparencia, trate objecoes e avance para fechamento viavel.'),
    ('financiamento', true, 'Acompanhar analise e destravar pendencias.', 'Oriente documentacao e acompanhe aprovacao para evitar atrasos no fechamento.'),
    ('aprovou_projeto', true, 'Transformar aprovacao em assinatura.', 'Parabenize pela aprovacao e conduza imediatamente para assinatura do contrato.'),
    ('contrato_assinado', true, 'Garantir transicao para execucao.', 'Confirme etapas apos assinatura e alinhe cronograma ate pagamento/instalacao.'),
    ('projeto_pago', true, 'Confirmar pagamento e preparar instalacao.', 'Confirme compensacao e prepare comunicacao para fase de instalacao.'),
    ('aguardando_instalacao', true, 'Manter lead informado no pre-instalacao.', 'Atualize prazos de instalacao e mantenha confianca ate execucao em campo.'),
    ('projeto_instalado', true, 'Fechar implantacao com orientacoes finais.', 'Finalize implantacao, confirme entrega e abra espaco para duvidas finais.'),
    ('coletar_avaliacao', true, 'Solicitar avaliacao e fortalecer reputacao.', 'Solicite avaliacao de forma natural e capture prova social para novos leads.'),
    ('contato_futuro', true, 'Manter relacionamento para retomada futura.', 'Registre motivo de pausa e programe follow-up para nova tentativa.'),
    ('perdido', true, 'Encerrar com aprendizado e opcao de retorno.', 'Documente motivo de perda com respeito e mantenha porta aberta para retorno.' )
),
template_org as (
  select org_id
  from public.ai_stage_config
  where org_id is not null
  group by org_id
  order by count(*) desc, org_id
  limit 1
),
template_rows as (
  select
    d.pipeline_stage,
    coalesce(src.is_active, d.is_active) as is_active,
    coalesce(nullif(src.agent_goal, ''), d.agent_goal) as agent_goal,
    coalesce(nullif(src.default_prompt, ''), d.default_prompt) as default_prompt
  from default_template d
  left join (
    select c.pipeline_stage, c.is_active, c.agent_goal, c.default_prompt
    from public.ai_stage_config c
    where c.org_id = (select org_id from template_org)
  ) src
    on src.pipeline_stage = d.pipeline_stage
),
active_orgs as (
  select distinct l.org_id
  from public.leads l
  where l.org_id is not null
),
seed_rows as (
  select
    ao.org_id,
    tr.pipeline_stage,
    tr.is_active,
    tr.agent_goal,
    tr.default_prompt
  from active_orgs ao
  cross join template_rows tr
)
insert into public.ai_stage_config (
  org_id,
  pipeline_stage,
  is_active,
  agent_goal,
  default_prompt,
  created_at,
  updated_at
)
select
  sr.org_id,
  sr.pipeline_stage,
  sr.is_active,
  sr.agent_goal,
  sr.default_prompt,
  now(),
  now()
from seed_rows sr
on conflict (org_id, pipeline_stage)
do update set
  is_active = coalesce(public.ai_stage_config.is_active, excluded.is_active),
  agent_goal = coalesce(nullif(public.ai_stage_config.agent_goal, ''), excluded.agent_goal),
  default_prompt = coalesce(nullif(public.ai_stage_config.default_prompt, ''), excluded.default_prompt),
  updated_at = now();

insert into public.ai_settings (
  org_id,
  is_active,
  assistant_identity_name,
  daily_report_enabled,
  weekly_report_enabled,
  monthly_report_enabled,
  created_at,
  updated_at
)
select
  ao.org_id,
  false,
  'Consultor Solar',
  false,
  false,
  false,
  now(),
  now()
from (
  select distinct org_id
  from public.leads
  where org_id is not null
) ao
on conflict (org_id) do nothing;
