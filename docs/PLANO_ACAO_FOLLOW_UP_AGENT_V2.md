# Plano de Ação — Agente de Follow-Up V2

> **Data**: 16/03/2026
> **Arquivo principal**: `supabase/functions/ai-pipeline-agent/index.ts`
> **Objetivo**: Tornar o agente de follow-up contextualmente correto e alinhado à etapa real do lead
> **Estratégia de segurança**: Alterações exclusivamente em `ai-pipeline-agent/index.ts`. Zero mudança de schema, frontend, scheduler ou outros Edge Functions.

---

## DIAGNÓSTICO COMPLETO (EVIDÊNCIAS FACTUAIS)

### O que aconteceu

Lead ID 465 (Rodrigo Sena), etapa `proposta_pronta`, recebeu follow-up step 1 às 17:46:

> "Oi Rodrigo! Você teve a chance de analisar a proposta sobre energia solar que enviamos? Estou aqui para ajudar com qualquer dúvida que você tenha. Que tal alinharmos isso?"

### Por que está errado

1. **Nenhuma proposta foi enviada** — o histórico do lead é composto de mensagens de desenvolvimento/testes (bugs de UI, ajustes de layout) que foram parar na conversa porque o WhatsApp de teste é o mesmo do dono. A IA leu "proposta" no histórico (referindo-se ao feature de propostas do app) e interpretou como proposta solar enviada ao lead.

2. **Tom genérico e longo** — "Estou aqui para ajudar com qualquer dúvida que você tenha. Que tal alinharmos isso?" não é a linguagem curta/humana exigida pelo sistema. É genérico, robótico e sem ancoragem real.

3. **Estilo proibido** — O prompt diz "1-2 frases no máximo" e "não soar como chatbot". A mensagem gerada viola ambos.

### Causa raiz arquitetural (5 pontos)

| # | Causa | Impacto | Severidade |
|---|-------|---------|------------|
| 1 | **configStageKey = 'follow_up'** para todos os triggers de follow-up. O `PROTOCOLO DA ETAPA` no systemPrompt recebe o prompt genérico de follow-up (13K chars), mas **NUNCA** o protocolo da etapa real do lead. | A IA não sabe o que a etapa `respondeu`, `proposta_pronta`, etc. exige. Gera mensagens sem direção comercial. | **CRÍTICA** |
| 2 | **followUpContextBlock** injeta `ETAPA_ATUAL_DO_LEAD` e `OBJETIVO_DA_ETAPA` (fix anterior), mas esses 2 campos ficam **enterrados** sob 13K de instruções genéricas + 4K de systemPrompt + histórico de conversa. A IA prioriza o histórico. | O objetivo da etapa é ignorado quando o histórico sugere outro caminho. | **ALTA** |
| 3 | **Mapa FOLLOW_UP_STAGE_GOALS incompleto** — faltam etapas que existem no sistema: `proposta_pronta`, `aguardando_proposta`, `visita_agendada`, `chamada_agendada`, `visita_realizada`, `projeto_pago`, `contrato_assinado`, `aprovou_projeto`, `aguardando_instalacao`. | Fallback genérico é usado, sem orientação comercial específica. | **MÉDIA** |
| 4 | **Sem proibições explícitas por etapa** — Exemplo: na etapa `respondeu`, o agente não deve falar de proposta. Na etapa `novo_lead`, não deve assumir que houve contato prévio. Essas regras existem nos prompts de cada etapa, mas o follow-up não os lê. | Mensagens contradizem a lógica comercial da etapa. | **ALTA** |
| 5 | **Histórico de conversa poluído passa direto** — mensagens de teste, bug reports e textos não-solares entram no chatHistory sem filtro contextual. A IA tenta "referenciar a última conversa" e acaba referenciando lixo. | Follow-ups baseados em contexto errado. | **MÉDIA** |

---

## PLANO DE EXECUÇÃO (5 MUDANÇAS CIRÚRGICAS)

Todas as mudanças são em **1 arquivo**: `supabase/functions/ai-pipeline-agent/index.ts`

---

### Mudança 1 — Carregar o protocolo da etapa REAL junto com o follow-up

**Onde**: Bloco de carregamento do `stageConfig` (~L3431-3440)

**O que fazer**: Quando `isFollowUpTrigger === true`, além de carregar o config de `follow_up`, carregar TAMBÉM o config da etapa real (`currentStage`). Extrair apenas o `default_prompt` ou `prompt_override` dele.

**Como**:
```typescript
// NOVO: Carregar protocolo da etapa real para injetar no follow-up
let realStageProtocol = '';
if (isFollowUpTrigger && currentStage && currentStage !== 'follow_up') {
    const { data: realStageConfig } = await supabase
        .from('ai_stage_config')
        .select('prompt_override, default_prompt, is_active')
        .eq('org_id', leadOrgId)
        .eq('pipeline_stage', currentStage)
        .maybeSingle();
    if (realStageConfig?.is_active !== false) {
        const fullPrompt = String(realStageConfig?.prompt_override || realStageConfig?.default_prompt || '').trim();
        // Extrair apenas as seções OBJETIVO, REGRAS OBRIGATÓRIAS e NÃO FAZER (não duplicar tudo)
        realStageProtocol = extractStageCoreSections(fullPrompt);
    }
}
```

**Nova função auxiliar** `extractStageCoreSections()`:
```typescript
function extractStageCoreSections(fullPrompt: string): string {
    if (!fullPrompt) return '';
    // Extrair seções chave: OBJETIVO, ETAPAS_SEGUINTES, REGRAS OBRIGATÓRIAS, NÃO FAZER
    const sections: string[] = [];
    const patterns = [
        /^OBJETIVO:.*$/m,
        /^ETAPA(?:S)?_SEGUINTE(?:S)?:.*$/m,
        /^REGRAS OBRIGAT[ÓO]RIAS:[\s\S]*?(?=\n[A-Z_]{3,}|\n\n[A-Z]|$)/m,
        /^N[ÃA]O FAZER[\s\S]*?(?=\n[A-Z_]{3,}|\n\n[A-Z]|$)/m,
    ];
    for (const pat of patterns) {
        const match = fullPrompt.match(pat);
        if (match) sections.push(match[0].trim());
    }
    return sections.join('\n\n');
}
```

**Anti-regressão**: 
- Não altera o carregamento do `stageConfig` (follow_up) — apenas adiciona leitura adicional.
- Se a query falhar, `realStageProtocol` fica vazio (sem impacto).
- Se a etapa não tiver config, fica vazio (sem impacto).

---

### Mudança 2 — Injetar protocolo da etapa real no followUpContextBlock

**Onde**: `followUpContextBlock` (~L4286-4315)

**O que muda**: Adicionar seção `PROTOCOLO_DA_ETAPA_REAL` dentro do bloco de follow-up, ANTES das instruções por step.

```
=== FOLLOW UP (STEP ${N}/5) ===
ETAPA_ATUAL_DO_LEAD: ${currentStage || 'desconhecida'}
OBJETIVO_DA_ETAPA: ${followUpStageGoal}
O lead nao responde ha ${elapsed}.
Este e o follow-up ${N} de 5.

${realStageProtocol ? `
PROTOCOLO DA ETAPA REAL (PRIORIDADE MAXIMA — o follow-up deve respeitar estas regras):
${realStageProtocol}
` : ''}

REGRA CRITICA: O CTA deste follow-up DEVE estar alinhado com o OBJETIVO_DA_ETAPA acima.
O follow-up NAO pode inventar contexto. Se o historico nao mostra que algo foi enviado/feito, NAO referencie como se tivesse sido.
...resto do bloco (instruções por step, obrigatório, etc.)...
=== FIM DO FOLLOW UP ===
```

**Anti-regressão**: 
- Se `realStageProtocol` estiver vazio, a seção não é renderizada.
- O prompt genérico de follow-up (13K) continua como `PROTOCOLO DA ETAPA` no systemPrompt — não é removido.
- A nova seção tem prioridade declarada textualmente ("PRIORIDADE MAXIMA").

---

### Mudança 3 — Completar o mapa FOLLOW_UP_STAGE_GOALS

**Onde**: Constante `FOLLOW_UP_STAGE_GOALS` (~L40-52)

**Adicionar as etapas faltantes**:
```typescript
const FOLLOW_UP_STAGE_GOALS: Record<string, string> = {
    novo_lead: 'Fazer o lead responder e evoluir a conversa.',
    respondeu: 'Qualificar para Chamada Agendada ou Visita Agendada.',
    nao_compareceu: 'Recuperar no-show e levar para agendamento.',
    chamada_agendada: 'Confirmar presenca na chamada agendada.',
    chamada_realizada: 'Conduzir ao proximo passo pos-ligacao.',
    visita_agendada: 'Confirmar presenca na visita agendada.',
    visita_realizada: 'Conduzir ao proximo passo pos-visita.',
    proposta_pronta: 'Apresentar proposta ao lead (por ligacao, videochamada ou visita — nunca por WhatsApp).',
    proposta_negociacao: 'Negociar ate compromisso de aprovacao ou proximo passo comercial.',
    aguardando_proposta: 'Manter lead engajado enquanto proposta esta sendo preparada.',
    financiamento: 'Acompanhar financiamento e levar para aprovacao do projeto.',
    aprovou_projeto: 'Alinhar proximos passos pos-aprovacao (contrato, instalacao).',
    contrato_assinado: 'Acompanhar andamento pos-contrato.',
    projeto_pago: 'Alinhar timeline de instalacao e proximos passos.',
    aguardando_instalacao: 'Manter lead informado sobre timeline de instalacao.',
};
```

**Anti-regressão**: Apenas adiciona chaves ao objeto — chaves existentes não mudam.

---

### Mudança 4 — Adicionar proibições explícitas por etapa no follow-up

**Onde**: Dentro do `followUpContextBlock`, após o `OBJETIVO_DA_ETAPA`

```
PROIBICOES DESTA ETAPA (OBRIGATORIO):
${getFollowUpProhibitions(currentStage)}
```

**Nova função auxiliar**:
```typescript
function getFollowUpProhibitions(stage: string): string {
    const prohibitions: Record<string, string> = {
        novo_lead: '- NAO assumir que houve contato previo.\n- NAO falar de proposta, preco ou economia.\n- Apenas tentar gerar a primeira resposta do lead.',
        respondeu: '- NAO falar de proposta, preco, economia ou financiamento.\n- NAO dizer que enviou proposta.\n- O unico objetivo e qualificar e agendar chamada ou visita.',
        chamada_agendada: '- NAO falar de proposta ou preco.\n- Apenas confirmar presenca na chamada agendada.',
        visita_agendada: '- NAO falar de proposta ou preco.\n- Apenas confirmar presenca na visita agendada.',
        nao_compareceu: '- NAO culpar o lead.\n- Apenas recuperar e reagendar.',
        proposta_pronta: '- NAO enviar proposta por WhatsApp.\n- NAO inventar valores de proposta.\n- Conduzir para apresentacao (ligacao, videochamada ou visita).\n- Se a proposta NAO foi apresentada ainda, NAO perguntar se o lead "analisou" a proposta.',
        proposta_negociacao: '- NAO enviar proposta por WhatsApp.\n- NAO inventar valores.\n- Focar em destravar objecao e fechar compromisso.',
        aguardando_proposta: '- NAO inventar que a proposta esta pronta se nao estiver.\n- Manter lead engajado e informado.',
        financiamento: '- NAO inventar status de financiamento.\n- Acompanhar e reduzir atrito.',
    };
    return prohibitions[stage] || '- NAO inventar contexto que nao existe no historico.\n- Referenciar apenas fatos reais da conversa.';
}
```

**Anti-regressão**: Função pura, sem side effects. Se stage não estiver mapeado, retorna proibição genérica segura.

---

### Mudança 5 — Adicionar regra anti-alucinação forte no bloco OBRIGATÓRIO

**Onde**: Seção `OBRIGATORIO` do `followUpContextBlock`

**Adicionar**:
```
- NUNCA afirmar que algo foi enviado, feito ou combinado se isso NAO aparece EXPLICITAMENTE no historico.
- Se o historico nao mostrar que proposta foi enviada, NAO perguntar sobre proposta.
- Se o historico nao mostrar que visita foi realizada, NAO perguntar sobre visita.
- Se o historico nao mostrar que chamada aconteceu, NAO perguntar sobre chamada.
- Na duvida, retomar com pergunta aberta curta baseada no ultimo ponto REAL da conversa.
```

**Anti-regressão**: Apenas adiciona regras ao bloco existente — não remove nenhuma.

---

## RESUMO DE IMPACTO

| Mudança | Risco de Regressão | Impacto |
|---------|-------------------|---------|
| 1 — Carregar protocolo da etapa real | MÍNIMO (query adicional, fallback = vazio) | **ALTO** — IA recebe regras reais da etapa |
| 2 — Injetar protocolo no follow-up block | MÍNIMO (condicional, não remove nada) | **ALTO** — IA prioriza regras da etapa |
| 3 — Completar mapa de goals | ZERO (apenas adiciona chaves) | **MÉDIO** — menos fallbacks genéricos |
| 4 — Proibições por etapa | ZERO (função pura nova) | **ALTO** — evita mensagens fora de contexto |
| 5 — Regra anti-alucinação | ZERO (apenas adiciona texto ao prompt) | **ALTO** — evita inventar contexto inexistente |

---

## ARQUIVOS MODIFICADOS

| Arquivo | Modificações |
|---------|-------------|
| `supabase/functions/ai-pipeline-agent/index.ts` | 5 mudanças cirúrgicas (veja acima) |

**Nenhum outro arquivo é modificado.**  
Zero mudança de schema, zero mudança de frontend, zero mudança no scheduler, zero mudança no prompt base (aiPipelinePdfPrompts.ts).

---

## ORDEM DE EXECUÇÃO

1. Criar nova função `extractStageCoreSections()` (perto das helpers existentes ~L1430)
2. Criar nova função `getFollowUpProhibitions()` (perto das helpers existentes ~L1430)
3. Completar mapa `FOLLOW_UP_STAGE_GOALS` (L40-52)
4. Adicionar carregamento do `realStageProtocol` (após L3440, dentro do bloco de stageConfig)
5. Reescrever `followUpContextBlock` com todas as injeções (L4286-4315)
6. Deploy: `npx supabase functions deploy ai-pipeline-agent --project-ref ucwmcmdwbvrwotuzlmxh`
7. Testar com lead real em cada etapa principal (`respondeu`, `proposta_pronta`, `novo_lead`)

---

## VERIFICAÇÃO PÓS-DEPLOY

Para cada etapa, verificar que o follow-up:
- [ ] NÃO menciona proposta se nenhuma proposta foi enviada
- [ ] NÃO menciona visita/chamada se nenhuma foi agendada
- [ ] Referencia APENAS contexto real do histórico
- [ ] CTA compatível com a etapa (ex.: respondeu → agendar chamada/visita)
- [ ] 1-2 frases curtas, tom humano, sem saudação corporativa
- [ ] Zero emojis
- [ ] Diferente de follow-ups anteriores
