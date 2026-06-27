# Correções do Agente de Vendas IA — Pipeline SolarZap

> **Objetivo**: Documentar todos os problemas encontrados, causas raiz, correções aplicadas e a arquitetura final. Feito para ser portado para qualquer outro agente de IA conversacional (WhatsApp, chat, etc.) que tenha sido herdado do SolarZap.

**Data**: 2026-06-27
**Arquivos alterados**:
- `supabase/functions/ai-pipeline-agent/index.ts` — agente principal (prompt + gates)
- `supabase/functions/process-agent-jobs/index.ts` — processador cron de follow-ups

---

## 1. Problemas Encontrados

### Print 1 — Follow-up desconexo da conversa
O agente respondeu o lead em tempo real, mas depois enviou um follow-up completamente fora de contexto, como se não soubesse que já tinha respondido.

### Prints 2-3 — Área de atuação ignorada
Empresa configurada com raio de atuação "MARÍLIA E REGIÃO" (SP). Lead perguntou se atendem MS (Mato Grosso do Sul). O agente respondeu que sim — venda impossível. Depois o lead quis falar com o dono e o agente ignorou.

### Print 4 — Resposta robótica sobre a empresa
Lead perguntou "De onde a Franco&Cunha é?". Resposta: "A Franco&Cunha fica em Marília/SP. Endereco: Rua X." — texto mecânico, parece FAQ de site, não WhatsApp.

### Print 5 — Follow-up repete mensagem + ignora áudio
Lead mandou áudio dizendo que não tem interesse. Agente fechou a conversa, mas o follow-up seguinte repetiu praticamente a mesma coisa ao invés de verificar que a conversa já foi encerrada.

### Prints 6-8 — Agente robótico insistente com lead frio
Lead de um sítio, pouco engajado. Agente segue insistindo com CTA forte, mesma abordagem robótica, sem perceber que o lead não está maduro.

---

## 2. Diagnóstico Raiz

**O problema fundamental**: tudo depende do LLM acertar sozinho a partir de um prompt monolítico de ~400 linhas. Os únicos gates determinísticos que existiam eram: solar safety gate (prazo/dimensionamento sem dados) e resposta factual da empresa. Nenhum cobria **área de atuação**, **handoff humano**, **follow-up condicional**, ou **desinteresse explícito**.

**Efeito colateral**: o prompt era tão inflado de regras que o LLM entrava em modo "checklist compliance" e soava robótico.

### Princípio geral da solução
A IA tem 2 camadas:
1. **(a) Texto do LLM** — humano, variável, criativo
2. **(b) Injeções determinísticas do código** — perguntas canned, CTAs, fallbacks

**Regra de ouro**: o determinístico só entra como rede de segurança (beco sem saída / dado faltando), nunca por cima de uma boa resposta do LLM. Bug de comportamento = código sobrescrevendo o LLM cedo demais. Bug de tom = excesso de regra no prompt OU injeção canned no lugar do texto do LLM.

---

## 3. Mapeamento Problema → Causa → Solução

### 3.1 Follow-up desconexo (Print 1)

| Camada | Arquivo:Linha | Causa |
|---|---|---|
| Trigger cron | `process-agent-jobs/index.ts:~900` | `isLeadRespondedAfter()` só checava `tipo = 'mensagem_cliente'`. Áudios, imagens e outros tipos inbound não cancelavam o job |
| Prompt follow-up | `ai-pipeline-agent/index.ts:~4973` | O LLM não sabia qual foi o último follow-up enviado — repetia ou divagava |

**Solução (commit `cd2d4cb` + `895c828`)**:
1. `isLeadRespondedAfter()` agora captura TODOS os tipos inbound: `mensagem_cliente`, `audio_cliente`, `video_cliente`, `imagem_cliente`, `documento_cliente`, `sticker_cliente`, `localizacao_cliente`, `contato_cliente`
2. Antes de cada follow-up, o sistema busca a última mensagem outbound do agente e infere o "ângulo" usado (benefício, urgência, empatia, despedida, toque leve). Injeta no prompt: `ULTIMO_FOLLOWUP_ENVIADO: "..."` + `ANGULO_USADO_NO_ULTIMO: benefit — NAO repita este angulo`.

```typescript
// process-agent-jobs/index.ts — isLeadRespondedAfter (CORRIGIDO)
const isLeadRespondedAfter = async (supabase, leadId, sinceIso) => {
  const { count } = await supabase
    .from('interacoes')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('wa_from_me', false)
    .in('tipo', [  // ← ANTES era só 'mensagem_cliente'
      'mensagem_cliente', 'audio_cliente', 'video_cliente',
      'imagem_cliente', 'documento_cliente', 'sticker_cliente',
      'localizacao_cliente', 'contato_cliente',
    ])
    .gt('created_at', sinceIso)
  return Number(count || 0) > 0
}
```

---

### 3.2 Área de atuação ignorada (Prints 2-3)

| Camada | Arquivo:Linha | Causa |
|---|---|---|
| Resposta factual | `ai-pipeline-agent/index.ts:1293` | `buildCompanyFactualReply()` só disparava quando o lead perguntava "onde fica a empresa". NUNCA quando o lead dizia "sou de MS, atende?" |
| Dados disponíveis | `ai-pipeline-agent/index.ts:4306` | `service_area_summary` é carregado do banco (`company_profile`) mas nunca era injetado no system prompt como restrição |
| System prompt | `ai-pipeline-agent/index.ts:~5075` | Nenhuma menção a área de cobertura |

**Solução (commit `ea8aa63` + `26a647e`)**:
1. **Gate determinístico (pré-LLM)**: `detectServiceAreaMismatch()` intercepta menções de UF/cidade/região na mensagem do lead, compara contra `service_area_summary` + `headquarters_city` + `headquarters_state` do `company_profile`. Se região explicitamente fora da área → resposta determinística bloqueando o atendimento. Mapa de UFs e suas expansões (ex.: "MS" → "mato grosso do sul") para matching robusto.
2. **Injeção no prompt**: Bloco `DADOS_DA_EMPRESA` com `AREA_DE_ATENDIMENTO_EXCLUSIVA` é injetado no system prompt ANTES do CONTRATO DE EXECUÇÃO. Reforça: "voce NAO pode atender regioes fora desta area".

```typescript
// ai-pipeline-agent/index.ts — detectServiceAreaMismatch (NOVO)
function detectServiceAreaMismatch(text, companyProfile) {
  // Extrai UF/cidade/região que o lead menciona
  const regionPatterns = [
    /(?:sou de|moro em|atende(?:m)? (?:em|no|na)|voce atende)/i,
    /(?:moro em|sou de|minha casa fica em)/i,
    /(?:de|da|do)\s+(ms|mt|mg|rj|sp|es|rs|sc|pr|go|df|ba|...)/i,
  ]
  // Compara contra service_area_summary + headquarters_city + headquarters_state
  // Se fora da área → resposta determinística de bloqueio
  // Se dentro ou ambíguo → deixa passar para o LLM (que tem a restrição no prompt)
}
```

---

### 3.3 Handoff ignorado — "quero falar com o dono" (Print 3)

| Camada | Arquivo:Linha | Causa |
|---|---|---|
| Prompt handoff | `ai-pipeline-agent/index.ts:~5189` | Instrução enterrada no fim do prompt, opcional ("quando identificar necessidade") |
| Catálogo | `ai-pipeline-agent/index.ts:4209` | Pode retornar vazio → fallback `CATALOGO_HANDOFF_INDISPONIVEL` |
| Detecção | — | Zero detecção determinística de "quero falar com [pessoa específica]" |

**Solução (commit `ea8aa63`)**:
`detectHumanHandoffIntent()` — regex multi-padrão que detecta frases como:
- "quero falar com o dono/gerente/responsável"
- "passa pro gerente", "me passa o whatsapp do dono"
- "quem é o responsável?", "atendimento humano"
- "sai do robô", "quero falar com pessoa real"

Se detectado: busca owner/admin na org (`organization_members` com role=owner/admin), faz handoff determinístico via `executeLeadHandoff()`. Se não houver owner, tenta qualquer seller. Se não houver ninguém, responde "vou avisar a equipe".

```typescript
// ai-pipeline-agent/index.ts — detectHumanHandoffIntent (NOVO)
function detectHumanHandoffIntent(text, sellerList) {
  const patterns = [
    /quero falar com (o|a) (dono|gerente|responsavel|supervisor)/i,
    /(passa|transfer|encaminhar?) (pro|para o) (dono|gerente)/i,
    /(falar|conversar).*(humano|pessoa real|gente)/i,
    /atendimento humano/i,
    /sai (do |)robo/i,
    // ... 13 patterns total
  ]
  // Encontra owner/admin na org → handoff com assign_to_user_id
  // Fallback: qualquer seller → handoff
  // Fallback final: resposta "vou avisar a equipe"
}
```

---

### 3.4 Resposta robótica sobre a empresa (Print 4)

| Camada | Arquivo:Linha | Causa |
|---|---|---|
| Bypass do LLM | `ai-pipeline-agent/index.ts:4586` | `buildCompanyFactualReply()` substitui totalmente o LLM — texto determinístico sem humanização |
| Template | `ai-pipeline-agent/index.ts:1326` | Formato: "A [EMPRESA] fica em [CIDADE/UF]. Endereco: [END]." — parece FAQ de site |

**Solução (commit `fc821c7`)**:
Reescrita dos templates de resposta para soar como pessoa real no WhatsApp:
- ~~"A [EMPRESA] fica em [CIDADE/UF]. Endereco: [END]."~~ → "Somos de [CIDADE/UF] — nosso escritorio fica na [END]."
- ~~"Nosso horario comercial e: [HORARIO]."~~ → "Funcionamos de [HORARIO]."
- ~~"WhatsApp: [X] | Telefone: [Y]."~~ → "Claro! nosso WhatsApp e [X] e telefone [Y]."
- ~~"A visita tecnica e gratuita."~~ → "A visita tecnica e gratuita sim."
- ~~"Temos opcao de financiamento."~~ → "Temos financiamento sim."

Mantém-se determinístico (sem risco de alucinação), mas com tom de WhatsApp.

---

### 3.5 Áudio de desinteresse ignorado (Print 5)

| Camada | Arquivo:Linha | Causa |
|---|---|---|
| Pré-check | `process-agent-jobs/index.ts:240` | `isLeadRespondedAfter()` só olhava `tipo = 'mensagem_cliente'` — áudio não era detectado como resposta |
| Gate ai_enabled | `process-agent-jobs/index.ts:880` | `processFollowUpJob` checava `follow_up_enabled` mas NÃO checava `ai_enabled` — se o gate de desinteresse (1C) setasse `ai_enabled=false`, o follow-up ainda disparava |

**Solução (commit `cd2d4cb` + `ea8aa63`)**:
1. `isLeadRespondedAfter()` expandido para todos os tipos inbound (ver 3.1)
2. `processFollowUpJob` agora checa `ai_enabled === false` ANTES de `follow_up_enabled`
3. Gate de desinteresse (1C): `detectDisinterest()` com 14 padrões regex. Se disparado: envia mensagem de despedida E faz UPDATE no lead (`ai_enabled=false, follow_up_enabled=false`) E cancela todos os `pipeline_agent_jobs` pendentes.

```typescript
// process-agent-jobs/index.ts — processFollowUpJob (CORRIGIDO)
// NOVO: check ai_enabled (antes só checava follow_up_enabled)
if (lead.ai_enabled === false) {
  await markJobCancelled(supabase, job.job_id, 'ai_disabled', ...)
  return { result: 'cancelled', reason: 'ai_disabled' }
}
```

---

### 3.6 Robô insistente com lead frio (Prints 6-8)

| Camada | Arquivo:Linha | Causa |
|---|---|---|
| CONDUÇÃO COMERCIAL | `ai-pipeline-agent/index.ts:~5075` | Regra rígida: "TODA mensagem termina com CTA", "NUNCA termine sem próximo passo" |
| CONTRATO DE EXECUÇÃO | `ai-pipeline-agent/index.ts:~5107` | 7 regras mandatórias — modo checklist ativado |
| ESTILO WHATSAPP | `ai-pipeline-agent/index.ts:~5098` | Mais 10 regras de estilo — sobrecarga de compliance |
| Sem noção de engajamento | — | Agente trata lead que respondeu 1 vez igual a lead que nunca respondeu |

**Solução (commit `298b9cc` + `94b7f32` + `dec067e`)**:

1. **Enxugamento do prompt (2A)**: CONDUÇÃO COMERCIAL removida inteiramente (todas as 5 regras já estavam duplicadas no CONTRATO DE EXECUÇÃO + IDENTIDADE). ESTILO WHATSAPP comprimido de 12 para 5 regras (emoji ban movido para PROIBIÇÕES ABSOLUTAS, "1 pergunta por msg" já no CONTRATO item 4). Economia de ~30% de tokens nessas seções.

2. **Detecção de engajamento (4B)**: `assessEngagementLevel()` classifica o lead em 4 níveis:
   - `cold`: 3+ follow-ups sem resposta → "priorize porta aberta, nao insista"
   - `lukewarm`: 2+ follow-ups, lead respondeu pouco → "reduza insistencia"
   - `warm`: conversa normal, sem follow-ups → "tom consultivo normal"
   - `engaged`: lead respondendo ativamente → "aproveite para agendar"
   
   A diretiva `NIVEL_ENGAJAMENTO_LEAD` é injetada no prompt.

3. **Diretiva de tom no FIM do prompt (4A)**: Posicionada IMEDIATAMENTE antes do FORMATO DE SAÍDA (máxima recência):
   > "As regras acima definem O QUE fazer. Esta diretriz define COMO falar. Cumpra TODAS as regras mas soando como PESSOA REAL no WhatsApp. Regras sao o mapa; seu tom e a voz. Varie palavras, ritmo e comprimento das frases. NUNCA recite o script como robo."

```typescript
// ai-pipeline-agent/index.ts — assessEngagementLevel (NOVO)
function assessEngagementLevel({ followUpStep, followUpCount,
    lastInboundAt, conversationLength, isScheduledTrigger }) {
  if (followUpCount >= 3 && (followUpStep || 0) >= 3) return 'cold'
  if (isScheduledTrigger && (followUpStep || 0) >= 4) return 'cold'
  // ... heurísticas de tempo desde última resposta, tamanho da conversa
  if (followUpCount === 0) return 'warm'
  return 'lukewarm'
}
```

---

## 4. Arquitetura Final

```
Mensagem inbound do lead (WhatsApp webhook)
        │
        ▼
┌──────────────────────────────────────────────┐
│ GATES DETERMINÍSTICOS (pré-LLM — NÃO passam  │
│ pelo modelo, resposta imediata e segura)      │
│                                               │
│ 1B. detectHumanHandoffIntent()                │
│     "quero falar com dono" → handoff p/ owner │
│ 1C. detectDisinterest()                       │
│     "não tenho interesse" → despedida + pause │
│ 1A. detectServiceAreaMismatch()               │
│     "sou de MS" → bloqueio área fora cobertura│
│     buildCompanyFactualReply()                │
│     "onde fica a empresa?" → resposta natural │
└──────────────────────────────────────────────┘
        │ (se nenhum gate disparou)
        ▼
┌──────────────────────────────────────────────┐
│ SYSTEM PROMPT (enxuto, ~30% menor)            │
│                                               │
│ 1. IDENTIDADE + timezone + schedule policy    │
│ 2. DADOS_DA_EMPRESA (com service_area)        │
│ 3. SOLAR_BR_PACK (fluxo real, prazos)         │
│ 4. REGRAS DE VERDADE (sem invenção)           │
│ 5. ESTILO WHATSAPP (5 regras, sem duplicatas) │
│ 6. CONTRATO DE EXECUÇÃO (7 regras canônicas)  │
│ 7. Follow-up / Post-call context (se aplic.)  │
│ 8. NIVEL_ENGAJAMENTO_LEAD (cold→engaged)      │
│ 9. PROTOCOLO DA ETAPA (script de vendas)      │
│ 10. DADOS_JA_CONFIRMADOS (CRM)               │
│ 11. DIRETRIZ FINAL DE TOM (alta recência)     │
│ 12. FORMATO DE SAÍDA (JSON)                   │
└──────────────────────────────────────────────┘
        │
        ▼
     LLM (OpenAI gpt-4o-mini)
        │
        ▼
┌──────────────────────────────────────────────┐
│ PROCESS-AGENT-JOBS (cron — follow-ups)        │
│                                               │
│ PRÉ-CHECKS (antes de invocar o LLM):          │
│ • isLeadRespondedAfter (TODOS tipos inbound)  │
│ • hasRecentOutbound (60s)                     │
│ • ai_enabled === false → cancela              │
│ • follow_up_enabled === false → cancela       │
│ • lead em estágio terminal → cancela          │
│ • org suspensa → cancela                      │
│ • stage mudou desde criação do job → cancela  │
└──────────────────────────────────────────────┘
```

---

## 5. Como Portar para Outro Repositório

### 5.1 O que é genérico (reaproveitável)

| Função | O que faz | Dependências |
|---|---|---|
| `detectHumanHandoffIntent()` | Regex para "quero falar com [pessoa]" | `organization_members` table (ou equivalente) |
| `detectDisinterest()` | Regex para "não tenho interesse" | `leads` table (ai_enabled, follow_up_enabled) |
| `detectServiceAreaMismatch()` | Regex para UF/cidade fora da área | `company_profile` table (service_area_summary, headquarters_city/state) |
| `assessEngagementLevel()` | Classifica lead cold→engaged | `interacoes` table (ou histórico de mensagens) |
| `getEngagementDirective()` | Retorna diretiva de tom por nível | Nenhuma — puro texto |
| `buildCompanyFactualReply()` | Respostas factuais humanizadas | `company_profile` table |
| Padrão de gates pré-LLM | if (gateX) return resposta_deterministica | Estrutura do handler de mensagens |

### 5.2 Checklist de implementação

1. **Adicionar os gates determinísticos ANTES da chamada ao LLM**:
   - Copiar as 4 funções de detecção
   - Adaptar as queries de banco para o schema local
   - Inserir no fluxo: `if (gate.triggered) { return gate.aiRes }`

2. **Enxugar o system prompt**:
   - Identificar regras duplicadas (ex.: "sempre termine com CTA" aparece em 3 lugares?)
   - Remover seções redundantes, manter 1 fonte da verdade
   - Mover regras de comportamento para o CONTRATO DE EXECUÇÃO
   - Deixar ESTILO com no máximo 5 regras

3. **Adicionar DIRETRIZ FINAL DE TOM**:
   - Colocar IMEDIATAMENTE antes do FORMATO DE SAÍDA
   - Texto: "As regras definem O QUE fazer. Esta diretriz define COMO falar..."

4. **Injetar dados da empresa no prompt**:
   - Buscar `company_profile` (nome, sede, área, horário, políticas)
   - Injetar como `DADOS_DA_EMPRESA` com `AREA_DE_ATENDIMENTO_EXCLUSIVA`

5. **Hardenizar o processador de follow-ups**:
   - `isLeadRespondedAfter()` deve capturar TODOS os tipos de mensagem inbound
   - Checar `ai_enabled` E `follow_up_enabled` antes de disparar
   - Injetar texto do último follow-up no contexto para evitar repetição
   - Inferir "ângulo" do último follow-up (benefício/urgência/empatia/despedida)

6. **Detecção de engajamento**:
   - Contar follow-ups sem resposta
   - Medir tempo desde última resposta inbound
   - Classificar em 4 níveis e injetar diretiva de tom

### 5.3 Tabela de tabelas necessárias

| Tabela | Campos usados | Propósito |
|---|---|---|
| `company_profile` | `company_name`, `headquarters_city`, `headquarters_state`, `headquarters_address`, `service_area_summary`, `business_hours_text`, `public_phone`, `public_whatsapp`, `technical_visit_is_free`, `technical_visit_fee_notes`, `supports_financing`, `supports_card_installments`, `payment_policy_summary` | Dados da empresa, área de cobertura, políticas |
| `organization_members` | `user_id`, `role` | Catálogo de vendedores para handoff |
| `whatsapp_instances` | `instance_name`, `display_name`, `is_active`, `ai_enabled`, `status` | Instâncias para handoff entre IAs |
| `leads` | `ai_enabled`, `follow_up_enabled`, `status_pipeline`, `follow_up_step`, `cidade`, `assigned_to_user_id`, `instance_name` | Estado do lead |
| `interacoes` | `lead_id`, `wa_from_me`, `tipo`, `mensagem`, `created_at` | Histórico de conversa |
| `ai_settings` | `follow_up_sequence_config`, `follow_up_window_config`, `timezone` | Config de follow-up por org |
| `ai_stage_config` | `pipeline_stage`, `is_active` | Quais etapas têm agente ativo |
| `pipeline_agent_jobs` | `lead_id`, `status`, `scheduled_at` | Jobs pendentes de follow-up |

---

## 6. Lições Aprendidas (replicáveis)

1. **Prompt inflado = LLM robótico**: cada regra duplicada aumenta a pressão de "checklist compliance". Enxugar antes de adicionar.
2. **Gates determinísticos salvam**: regras de negócio críticas (área de atuação, handoff, desinteresse) NÃO devem depender do LLM. Regex + resposta canned é mais barato, mais rápido e nunca alucina.
3. **Tom se corrige no FIM do prompt**: a diretiva de tom na posição de maior recência (imediatamente antes do output) tem disproportionadamente mais efeito que regras espalhadas.
4. **Pré-checks no cron evitam fantasma**: verificar se o lead respondeu (qualquer tipo de mensagem) antes de disparar follow-up evita o cenário "já falei com ele mas o robô mandou outra mensagem".
5. **Rastrear o que foi enviado**: injetar o texto e o ângulo do último follow-up no contexto do próximo evita repetição.
6. **Nem todo lead está pronto**: classificar o nível de engajamento e adaptar o tom (cold → porta aberta, engaged → agendar) reduz a sensação de robô insistente.
