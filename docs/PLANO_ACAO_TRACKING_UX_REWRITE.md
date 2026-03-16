# Plano de Ação — Reajuste UX/UI da Tela de Tracking & Conversões

> **Data**: 16/03/2026  
> **Arquivo**: `src/components/solarzap/TrackingView.tsx` (1637 linhas)  
> **Objetivo**: Simplificar, corrigir bugs de UX observáveis, deixar os fluxos compreensíveis e melhorar a experiência em desktop e mobile  
> **Estratégia de segurança anti-regressão**: A refatoração ficará concentrada em `TrackingView.tsx`, preservando a lógica funcional existente. Não haverá alteração de schema, edge functions, rotas ou contratos externos. Pequenos ajustes locais de apresentação, imports visuais e organização de JSX são permitidos se necessários para manter clareza e estabilidade.

---

## DIAGNÓSTICO COMPLETO

### Bug 1 — Botão "Conectar Google Ads" falha
- **Causas prováveis no código atual**: A Edge Function `google-ads-oauth` depende de `GOOGLE_ADS_CLIENT_ID`, `ALLOWED_ORIGIN`/CORS, autenticação válida do usuário e membership na organização. Em produção, ainda há dependência do setup correto do Google Cloud (consent screen, redirect URI e test users quando aplicável).
- **Ação frontend**: Melhorar a mensagem de erro e, quando possível, expor o motivo devolvido pela function (`missing_authorization`, `forbidden`, `missing_org_id`, falha de infra/config). O fluxo do `connectGoogleAds()` está estruturalmente correto, mas hoje a interface colapsa tudo para um erro genérico.
- **Ação backend**: Nenhuma mudança planejada nesta etapa. O plano deve assumir que parte do problema pode ser de configuração externa, não apenas de UI.

### Bug 2 — Meta CAPI e GA4: sem confirmação visual de que funciona
- **Status real**: O código de envio existe e o dispatcher (`conversion-dispatcher`) está implementado para Meta, Google Ads e GA4. O botão "Testar conexão" valida credenciais/acesso de API, mas não substitui a validação ponta a ponta de uma conversão real passando por webhook, atribuição e fila de entregas.
- **Problema UX**: Não há feedback claro de "o que falta configurar", "o que já está pronto para envio" e "como confirmar que houve entrega real". O usuário não sabe distinguir configuração válida de operação validada ponta a ponta.

### Bug 3 — Aba "Webhook & Snippet" confusa
- **Problema**: Mostra endpoint de webhook, chave pública e snippet JavaScript sem explicar o fluxo. Um usuário que nunca usou attribution tracking não entende o propósito.
- **Solução**: Adicionar um "wizard" guiado com numeração (Passo 1, 2, 3), descrições claras em português, e um diagrama textual do fluxo.

### Bug 4 — Aba "Geral" sem explicação
- **Problema**: Os 4 toggles (Tracking ativado, Auto-atribuição, Forçar overwrite, Google validate-only) e o rate limit não têm nenhuma descrição do que fazem.
- **Solução**: Adicionar subtexto explicativo em cada toggle.

### Bug 5 — Aba "Mensagens Gatilho" — verificação funcional
- **Status real**: O CRUD está consistente com o código atual (insert, update, delete em `ad_trigger_messages`). A lógica de matching está em `trackingAttribution.ts` → `matchTriggerRule()` e suporta exact, contains, starts_with e regex. Os gatilhos são usados durante o fluxo de atribuição para inferir canal/campanha a partir da mensagem.
- **Ação**: Adicionar texto explicativo de quando/como os gatilhos são usados e validar o fluxo com teste manual controlado. Não é tecnicamente correto prometer "garantia" sem executar um cenário ponta a ponta.

### Bug 6 — Abas "Entregas" e "Plataformas" separadas da "Geral"
- **Problema UX**: 6 abas é demais. O usuário precisa navegar muito.
- **Solução**: Consolidar de 6 abas → 3 abas:
  1. **Configuração** (merge de Geral + Plataformas + Webhook/Snippet)
  2. **Regras** (merge de Mapeamento de Etapas + Mensagens Gatilho)
  3. **Monitoramento** (= Entregas atual, com summary cards)

---

## PLANO DE EXECUÇÃO DETALHADO

### Pré-fase — Mapeamento técnico obrigatório (antes de editar)

Para reduzir risco de regressão, a execução deve seguir este mapeamento literal dos blocos atuais de JSX:

- `TabsContent value="geral"` -> migrar para seção "Comportamento do Tracking" dentro de `TabsContent value="configuracao"`
- `TabsContent value="plataformas"` -> migrar para seção "Plataformas de Anúncios" dentro de `TabsContent value="configuracao"`
- `TabsContent value="webhook"` -> migrar para seção "Integração com Site" dentro de `TabsContent value="configuracao"`
- `TabsContent value="mapeamento"` -> migrar para seção "Mapeamento" dentro de `TabsContent value="regras"`
- `TabsContent value="gatilhos"` -> migrar para seção "Gatilhos" dentro de `TabsContent value="regras"`
- `TabsContent value="entregas"` -> manter lógica atual em `TabsContent value="monitoramento"`

Ordem recomendada de execução no arquivo:
1. Alterar `Tabs defaultValue` e `TabsTrigger`
2. Criar os 3 novos `TabsContent`
3. Mover JSX existente sem alterar callbacks
4. Só então ajustar microcopy e estados visuais

Critério de aceite desta pré-fase:
- Nenhum callback funcional removido
- Nenhum `useState`, `useEffect`, `useMemo` e `useCallback` renomeado
- Mudança primária concentrada no bloco de renderização

### Fase 1 — Reestruturação de Abas (APENAS JSX/layout)

**De:**
```
Geral | Webhook & Snippet | Plataformas | Mapeamento de Etapas | Mensagens Gatilho | Entregas
```

**Para:**
```
Configuração | Regras | Monitoramento
```

#### Aba "Configuração" (nova)
Estrutura vertical com seções visíveis em cards. Usar `<details>` apenas para conteúdo avançado ou legado, evitando esconder informações essenciais e reduzindo atrito em mobile.

1. **Seção: Comportamento do Tracking** (ex-aba Geral)
   - Cada toggle com descrição em `<p className="text-xs text-muted-foreground">`:
     - **Tracking ativado**: "Liga ou desliga todo o sistema de tracking. Quando desativado, nenhuma conversão é enviada para as plataformas."
     - **Auto-atribuição**: "Quando ativado, o sistema infere automaticamente o canal de origem (Google, Meta, etc.) pelo UTM/Click ID da mensagem recebida."
     - **Forçar overwrite**: "Quando ativado, reescreve o canal de origem mesmo que o lead já tenha um canal atribuído anteriormente."
     - **Google validate-only**: "Quando ativado, os eventos de Google Ads são enviados em modo de validação (não contam como conversão real). Útil para testar."
     - **Rate limit**: "Limite máximo de requisições de webhook por minuto. Protege contra spam/bots."
   - Botão "Salvar configurações" (mesmo callback `saveSettings`)
   - Adicionar microcopy de impacto para Google Ads: "Para envio real no Google Ads, o lead precisa ter `gclid`, `gbraid` ou `wbraid`. Sem isso, o evento pode ser validado, mas não enviado como conversão offline."

2. **Seção: Plataformas de Anúncios** (ex-aba Plataformas)
   - Cards equivalentes de Meta CAPI / Google Ads / GA4, preservando funcionalidade
   - Cada card deve exibir estado de prontidão com base no que já existe em memória: `Conectado`, `Configuração incompleta` ou `Desativado`
   - Para Google Ads: mensagem de erro melhorada quando `connectGoogleAds()` falha
   - Manter a configuração manual legada recolhida em `<details>` apenas quando houver necessidade de suporte/contorno

    Definição objetiva dos estados visuais (sem alterar backend):
    - Meta CAPI:
       - `Conectado`: `enabled=true` e `meta_pixel_id` preenchido
       - `Configuração incompleta`: `enabled=true` e `meta_pixel_id` vazio
       - `Desativado`: `enabled=false`
    - Google Ads:
       - `Conectado`: `googleAdsConnected=true` e `google_customer_id` + `google_conversion_action_id` preenchidos
       - `Configuração incompleta`: conectado OAuth, mas sem seleção final de conta/conversão
       - `Desativado`: `enabled=false` ou não conectado
    - GA4:
       - `Conectado`: `enabled=true` e `ga4_measurement_id` preenchido
       - `Configuração incompleta`: `enabled=true` e `ga4_measurement_id` vazio
       - `Desativado`: `enabled=false`

3. **Seção: Integração com Site** (ex-aba Webhook & Snippet)
   - Redesenhar com passos numerados:
     - **Passo 1 — Gere uma chave pública**: "Use esta chave quando o seu formulário ou backend enviar dados diretamente para o webhook da SolarZap."
     - **Passo 2 — Entenda o endpoint do webhook**: "Esta URL recebe os dados de atribuição. Se o seu site envia formulário direto para a SolarZap ou se você tem integração server-to-server, esse é o endpoint usado no POST."
     - **Passo 3 — Instale o snippet**: "Cole este código antes de `</body>`. Ele captura UTMs e click IDs, guarda esses dados na sessão e injeta campos ocultos nos formulários da página."
     - **Passo 4 — Conecte o envio do formulário**: "O snippet sozinho não faz POST para o webhook. Ele prepara os dados para que o seu formulário ou integração envie esses campos para a SolarZap."
       - **Passo 5 — Envie a chave no header**: "Quando houver envio direto para o webhook da SolarZap, incluir `x-szap-org-key` na requisição; sem este header o webhook retorna `missing_org_key`."
          - **Observação técnica**: formulário HTML nativo não permite enviar header customizado. Para usar `x-szap-org-key`, o envio deve ocorrer por backend próprio, proxy/server action ou requisição programática (`fetch`/XHR).
   - Incluir um bloco curto "Como funciona" com o fluxo: `Visitante entra com UTM -> snippet guarda dados -> formulário envia campos ocultos -> webhook aplica atribuição -> dispatcher envia conversões`
   - Mesmos botões de copiar e gerar/revogar chave

#### Aba "Regras" (nova)
Duas seções:

1. **Mapeamento de Etapas do CRM** (sem mudanças de lógica)
   - Adicionar explicação: "Quando um lead muda de etapa no CRM, o sistema envia um evento de conversão com o nome configurado abaixo para cada plataforma ativa. Deixe o campo vazio para não enviar evento naquela etapa."
   
2. **Gatilhos de Atribuição** (sem mudanças de lógica)
   - Adicionar explicação: "Gatilhos permitem inferir o canal de origem com base no texto da mensagem recebida no fluxo de atribuição. Exemplo: se a mensagem contém 'vi seu anúncio no Instagram', o sistema atribui o canal como Instagram."
   - Adicionar observação: "Regex inválida é ignorada pelo backend sem quebrar o fluxo, mas deve ser evitada e claramente sinalizada na UI quando possível."
   - CRUD idêntico ao atual

#### Aba "Monitoramento" (renomeado)
- Summary cards (enviados/pendentes/falhos/ignorados) + tabela de entregas
- Sem mudanças de lógica

---

### Fase 2 — Melhorias de UX

#### 2.1 Google Ads — Mensagem de erro melhorada
**Onde**: callback `connectGoogleAds()` no catch
**De:**
```tsx
toast.error('Falha ao iniciar conexão com Google Ads.');
```
**Para:**
```tsx
toast.error('Falha ao iniciar conexão com Google Ads. Verifique OAuth, permissões da organização e secrets do Supabase.');
```

Se o retorno da function vier com `error` conhecido, priorizar a mensagem devolvida pelo backend em vez de uma mensagem fixa.

Mapeamento sugerido de mensagens conhecidas para UX:
- `missing_authorization` -> "Sessão expirada. Faça login novamente e tente conectar."
- `forbidden` -> "Seu usuário não possui acesso a esta organização."
- `missing_org_id` -> "Organização não identificada para iniciar OAuth."
- `missing_global_google_config` -> "Configuração de Google Ads ausente no Supabase."
- fallback -> mensagem genérica atual

#### 2.2 Badges de status no header da aba Configuração
Adicionar mini-badges mostrando:
- Meta CAPI: ✅ Conectado / ⚪ Desconectado
- Google Ads: ✅ Conectado / ⚪ Desconectado  
- GA4: ✅ Conectado / ⚪ Desconectado

Observação: quando a plataforma estiver parcialmente configurada, usar um estado intermediário textual como `Configuração incompleta` em vez de marcar como conectada.

#### 2.3 Melhor empty state no Monitoramento
Quando não há entregas, mostrar: "Nenhuma entrega encontrada. Entregas aparecem quando leads mudam de etapa e as plataformas (Meta, Google Ads, GA4) estão configuradas e ativas."

---

### Fase 3 — Responsividade Mobile

#### 3.1 Tabs mobile-friendly
- Reduzir para 3 abas
- Em larguras menores, permitir rótulos mais curtos se necessário: `Config`, `Regras`, `Fila`
- Objetivo: eliminar o scroll horizontal na maioria dos cenários mobile, sem depender disso como premissa rígida de layout

#### 3.2 Seção de Plataformas em mobile
- Grid de cards em coluna única (`grid-cols-1`) em mobile (já funciona com `xl:grid-cols-3`)
- Verificar que todos os inputs e botões são acessíveis

#### 3.3 Mapeamento de Etapas em mobile
- Já tem `overflow-x-auto` com `min-w-[760px]`
- Manter a abordagem de scroll horizontal para a tabela (funciona bem)

#### 3.4 Tabela de Entregas em mobile
- Já tem card-based layout para mobile (`isMobileViewport`)
- Manter como está

---

## LISTA DE ALTERAÇÕES POR ARQUIVO

### Arquivos MODIFICADOS (1 único arquivo):
| Arquivo | Tipo de mudança |
|---|---|
| `src/components/solarzap/TrackingView.tsx` | Reestruturação da JSX das 6 abas → 3 abas. Adição de textos explicativos e estados de prontidão. Melhoria da mensagem de erro do Google Ads. Preservação da lógica funcional existente. |

### Arquivos NÃO MODIFICADOS (confirmação explícita):
| Arquivo | Motivo |
|---|---|
| `supabase/functions/google-ads-oauth/index.ts` | Bug é de configuração, não de código |
| `supabase/functions/google-ads-callback/index.ts` | Funciona corretamente |
| `supabase/functions/tracking-credentials/index.ts` | Funciona corretamente |
| `supabase/functions/attribution-webhook/index.ts` | Funciona corretamente |
| `supabase/functions/conversion-dispatcher/index.ts` | Funciona corretamente |
| `src/lib/tracking/snippet.ts` | Não mexer |
| `src/lib/tracking/constants.ts` | Não mexer |
| `supabase/functions/_shared/*` | Não mexer |
| Qualquer arquivo de rota, hook, contexto, ou tipo | Não mexer |

---

## ESTRATÉGIA ANTI-REGRESSÃO

### 1. Escopo cirúrgico
- **SOMENTE** `TrackingView.tsx` será editado
- Novos imports visuais só serão aceitos se forem estritamente necessários para clareza da interface
- Nenhum contrato de dados será alterado
- Estados, efeitos e callbacks atuais devem ser preservados; se surgir necessidade de pequeno helper local de apresentação, ele deve ser isolado e sem impacto funcional
- Nenhuma alteração em integração externa será feita nesta etapa
- Não mover funções para fora do componente durante esta fase (evita risco de closure/stale state)

### 2. O que SERÁ alterado
- A estrutura de `<Tabs>` e `<TabsContent>` → de 6 para 3 valores
- A ordem e agrupamento dos blocos de JSX dentro dos tabs
- Adição de textos `<p>` com explicações para cada toggle/seção
- Uso de `<details>` apenas em conteúdo avançado/legado, não como padrão para seções principais
- Melhoria da mensagem `toast.error` no catch de `connectGoogleAds`
- Pequenos estados visuais de prontidão baseados nos dados já carregados na tela
- Ajuste de labels de tabs/section headers e textos de ajuda

### 3. Validação pós-execução
- [ ] `npm run typecheck` passa sem erros
- [ ] `npm run build` passa sem erros
- [ ] Aba "Configuração" renderiza corretamente no browser
- [ ] Todos os toggles salvam (testar Salvar configurações)
- [ ] Cards de plataforma salvam e testam conexão
- [ ] Google Ads mostra erro contextual quando OAuth falha
- [ ] Google Ads não fica em loading infinito em erro (estado `googleAdsConnecting` retorna ao normal)
- [ ] Meta CAPI e GA4 exibem estado visual coerente entre desativado, incompleto e pronto
- [ ] Webhook/Snippet copia endpoint e snippet
- [ ] Textos do fluxo deixam claro que o snippet injeta campos ocultos e não envia sozinho para o webhook
- [ ] Aba "Regras" renderiza mapeamento de etapas editável
- [ ] CRUD de gatilhos funciona
- [ ] Criar, editar e excluir um gatilho de teste sem regressão visual
- [ ] Aba "Monitoramento" carrega entregas
- [ ] Monitoramento deixa claro por que ainda não há entrega real quando plataformas não estão completas
- [ ] Mobile: navegação continua utilizável em 360px, 390px e 768px
- [ ] Mobile: layout empilhado funciona sem cortes de CTA ou inputs principais

### 3.1 Validação funcional ponta a ponta (sanity)
- [ ] Criar lead de teste com UTM no formulário e confirmar persistência dos campos ocultos no submit
- [ ] Confirmar que o webhook rejeita requests sem `x-szap-org-key` e aceita com chave válida
- [ ] Confirmar criação/atualização de atribuição para o lead de teste
- [ ] Confirmar geração de entrega na fila após mudança de etapa no CRM
- [ ] Confirmar mudança de status da entrega (pending -> sent/failed) no Monitoramento

### 4. Rollback
Se algo der errado: `git checkout -- src/components/solarzap/TrackingView.tsx`

---

## RESUMO DAS MELHORIAS (O QUE O USUÁRIO VERÁ)

| Antes | Depois |
|---|---|
| 6 abas confusas | 3 abas claras: Configuração, Regras, Monitoramento |
| Toggles sem explicação | Cada toggle com descrição em português do que faz |
| Webhook/Snippet sem contexto | Passo-a-passo numerado explicando captura, envio e papel do webhook |
| Erro genérico no Google Ads | Mensagem de erro com diagnóstico mais realista |
| Plataformas em aba separada | Plataformas dentro de Configuração, junto com toggles |
| Mapeamento e Gatilhos separados | Juntos na aba Regras com explicações |
| 6 abas em mobile com scroll | 3 abas com navegação mais enxuta e previsível |

---

## NOTA SOBRE O BUG DO GOOGLE ADS

O botão "Conectar Google Ads" chama `supabase.functions.invoke('google-ads-oauth', { body: { org_id } })`.  
A Edge Function exige:
1. `GOOGLE_ADS_CLIENT_ID` configurado como secret no Supabase
2. O projeto Google Cloud com consent screen aprovado (se em produção) ou o email do usuário na lista de test users (se em modo Testing)

**Para resolver de fato**: Configure `GOOGLE_ADS_CLIENT_ID` e `GOOGLE_ADS_CLIENT_SECRET` como secrets nas Edge Functions do Supabase Cloud, valide `ALLOWED_ORIGIN`, redirect URI e membership do usuário na organização, e certifique-se de que o consent screen está aprovado ou o email está na whitelist quando aplicável.

O frontend não resolve a infraestrutura, mas pode expor melhor o motivo da falha e reduzir a ambiguidade operacional.

---

## AJUSTES DE PREMISSA PARA EVITAR FALSOS POSITIVOS

- "Conectado" não significa necessariamente "entrega real validada". O plano deve separar claramente `credencial válida`, `configuração pronta` e `entrega confirmada`.
- Para Google Ads, entrega real depende de click IDs disponíveis (`gclid`, `gbraid` ou `wbraid`). Sem isso, haverá casos legítimos em que a configuração está correta mas o envio é ignorado.
- Para Mensagens Gatilho, a confiança funcional será obtida por validação guiada no browser e não por afirmação absoluta no plano.
- O snippet atual captura dados na sessão e injeta hidden inputs em formulários. O plano não deve prometer comportamento de POST automático que o código não implementa.

---

## GUIA DE IMPLEMENTAÇÃO INCREMENTAL (ONE SHOT SEM REFAZER)

Sequência recomendada para implementação única com menor risco:

1. Migrar apenas a navegação das tabs (6 -> 3), mantendo conteúdo temporariamente bruto
2. Reagrupar blocos de JSX por seção, sem alterar textos ainda
3. Aplicar microcopy explicativa e estados de prontidão
4. Ajustar mensagens de erro do Google Ads
5. Rodar typecheck/build
6. Fazer validação manual desktop/mobile

Critério de rollback parcial:
- Se quebrar layout: reverter apenas bloco de `Tabs` e `TabsContent`
- Se quebrar ação: reverter apenas trecho do callback afetado
- Evitar rollback total do arquivo quando o erro for localizado

---

> **Aprovação necessária antes de executar.** Confirme para prosseguir com a implementação.
