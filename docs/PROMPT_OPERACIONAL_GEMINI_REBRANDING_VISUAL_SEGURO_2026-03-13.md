# Prompt Operacional Fechado: Rebranding Visual Seguro Completo

Data: 2026-03-13
Modo: execucao direta
Escopo: somente visual

## Seu papel

Voce e o executor tecnico responsavel por aplicar um rebranding visual completo neste repositorio, cobrindo o app inteiro e as telas publicas, sem alterar comportamento, regras de negocio, dados, contratos, integracoes, backend ou infraestrutura.

Voce nao deve devolver um novo plano. Voce deve executar as mudancas no codigo agora, com seguranca e em lotes verificaveis.

## Objetivo

Aplicar um rebranding visual completo e consistente em todo o frontend do app, substituindo a identidade visual ruim atual por uma implementacao refinada, coesa e premium, usando a nova direcao visual aprovada pelo usuario.

O resultado final deve:

- cobrir o app inteiro, incluindo abas internas, modais, overlays, auth, onboarding e telas publicas;
- eliminar o visual atual com cinzas pobres, contrastes ruins, verdes residuais e gradientes desalinhados;
- manter light mode e dark mode consistentes;
- preservar integralmente o comportamento atual do produto.

## Regras inegociaveis

1. Altere apenas o visual.
2. Nao altere comportamento, logica, fluxos, regras, integracoes, queries, schemas, edge functions, scripts, dominio, env vars, Stripe, Supabase, jobs, automacoes, hooks de negocio ou infraestrutura.
3. Nao mude contratos de props, tipos, nomes de rotas, ids operacionais, nomes de servico ou chaves tecnicas.
4. Nao reescreva o produto. Nao faca redesign funcional. Nao mude IA, pipeline, agendamento, tracking, billing ou permissao.
5. Se um arquivo misturar logica e UI, altere somente `className`, estilos, tokens, assets visuais, wrappers de layout e markup superficial estritamente visual.
6. Nao invente logo nova. Use apenas os assets aprovados ja fornecidos no workspace ou pelo usuario.
7. Se um asset visual aprovado nao estiver disponivel no workspace, nao improvise. Complete todo o restante do rebranding visual e reporte objetivamente o bloqueio apenas da troca de asset faltante.
8. Verde pode permanecer apenas onde for semantica legitima de sucesso. Verde nao pode permanecer como cor principal de branding.
9. Nao pare para pedir confirmacoes intermediarias. Trabalhe ate concluir. So pare se houver bloqueio real que impeça continuar com seguranca.

## Escopo incluido

Inclua obrigatoriamente:

- app logado inteiro;
- todas as abas principais e secundarias;
- todos os headers, sidebars, cards, dialogs, popovers, badges, forms, tabelas, banners, tooltips, toasts, loaders, empty states e overlays;
- login, update password, organization select, onboarding, pricing e telas publicas associadas;
- troca da logo do app, favicon e demais assets visuais do frontend em escopo;
- light mode e dark mode;
- responsividade desktop e mobile.

## Escopo excluido

Exclua explicitamente:

- PDFs e renderizacao visual de propostas exportadas;
- covers de proposta;
- email templates;
- backend, Supabase, edge functions, scripts, deploy, Docker, dominios, sender domains, env vars, Stripe, buckets e infraestrutura;
- qualquer alteracao funcional.

## Diretriz de execucao

Execute em fases, nesta ordem, sem pular verificacoes.

### Fase 0 - Guardrails e auditoria inicial

Antes de editar:

1. Identifique os arquivos centrais de tema e shell.
2. Mapeie os pontos com hardcode visual da identidade antiga.
3. Classifique ocorrencias verdes como:
   - semantica legitima de sucesso;
   - vazamento de branding antigo a substituir.
4. Nao altere nada fora do frontend visual.

Faça buscas dirigidas por residuos do branding antigo, incluindo pelo menos:

- `emerald`
- `green`
- `teal`
- `whatsapp-green`
- `solar-`
- `from-emerald`
- `to-emerald`
- `border-green`
- `bg-green`
- `text-green`
- gradientes esverdeados e sombras com rgba esverdeado

### Fase 1 - Fundacao global do tema

Comece obrigatoriamente por:

- `src/index.css`
- `tailwind.config.ts`

Objetivo desta fase:

- redefinir os tokens globais de marca;
- separar cor de marca de cor semantica;
- corrigir `background`, `foreground`, `primary`, `secondary`, `accent`, `muted`, `ring`, `sidebar-*`, `chat-*` e equivalentes;
- revisar tokens legados como `--whatsapp-*` e `--solar-*` para que parem de propagar a identidade antiga, sem quebrar consumo existente;
- estabilizar light mode e dark mode com bom contraste e profundidade visual.

Regras desta fase:

- nao deixe fundo claro puro e esteril se isso piorar o visual;
- nao deixe fundo escuro chapado e sem profundidade;
- preserve legibilidade de texto, borda, hover, active, focus e estados de elevacao;
- nao confunda `success`, `warning`, `danger` e `info` com as novas cores de marca.

### Fase 2 - Assets e shell principal

Rebrand dos ativos e da estrutura compartilhada do app.

Prioridade obrigatoria:

- `public/logo.png`
- `public/favicon.ico`
- `src/components/solarzap/SolarZapLayout.tsx`
- `src/components/solarzap/SolarZapNav.tsx`
- `src/components/solarzap/PageHeader.tsx`
- `src/App.tsx`

Objetivo desta fase:

- trocar logo e favicon se os assets aprovados estiverem disponiveis;
- refazer sidebar, area da logo, estados ativos, badges de plano, hover, fundos e headers;
- eliminar gradientes ruins e contrastes ruins no shell global;
- garantir que a percepcao de marca correta ja apareca nas estruturas mais repetidas do produto.

### Fase 3 - Primitives e componentes transversais

Padronize os componentes compartilhados e wrappers usados por muitas telas.

Inclua obrigatoriamente a auditoria visual de:

- buttons
- cards
- inputs
- dialogs
- popovers
- badges
- tooltips
- toasts
- banners
- focus rings
- scrollbars customizadas
- loaders
- empty states

Revise especialmente:

- `src/components/ProtectedRoute.tsx`
- `src/components/billing/BillingBanner.tsx`
- `src/components/billing/OnboardingChecklist.tsx`
- `src/components/onboarding/OnboardingWizardShell.tsx`
- `src/components/onboarding/GuidedTour.tsx`

### Fase 4 - Abas internas por grupo

Execute a revisao visual completa de todas as superficies abaixo.

#### Grupo A - Conversas

Revise por completo:

- `src/components/solarzap/ConversationList.tsx`
- `src/components/solarzap/ChatArea.tsx`
- `src/components/solarzap/ActionsPanel.tsx`
- componentes auxiliares visuais da area de chat

Corrija:

- background e pattern do chat;
- bolhas enviada e recebida;
- filtros, busca, toolbar e painel lateral;
- CTAs, chips, badges e estados vazios;
- qualquer visual de clone de WhatsApp que conflite com a nova marca.

#### Grupo B - Pipeline, calendario e dashboard

Revise:

- `src/components/solarzap/PipelineView.tsx`
- `src/components/solarzap/CalendarView.tsx`
- `src/components/solarzap/DashboardView.tsx`

Corrija:

- kanban, cards, colunas, contadores, scrollbars e drag states;
- eventos, chips, grades e destaques do calendario;
- KPI cards, graficos, legendas, badges e filtros do dashboard.

#### Grupo C - Contatos, disparos e propostas no app

Revise:

- `src/components/solarzap/ContactsView.tsx`
- `src/components/solarzap/BroadcastView.tsx`
- `src/components/solarzap/ProposalsView.tsx`

Importante:

- em propostas, limite o trabalho ao visual da tela do app;
- nao toque em PDF, exportacao, cover ou renderizacao de proposta fora do frontend em tela.

#### Grupo D - Operacao, configuracao e admin

Revise:

- `src/components/solarzap/AIAgentsView.tsx`
- `src/components/solarzap/AutomationsView.tsx`
- `src/components/solarzap/IntegrationsView.tsx`
- `src/components/solarzap/TrackingView.tsx`
- `src/components/solarzap/KnowledgeBaseView.tsx`
- `src/components/solarzap/MeuPlanoView.tsx`
- `src/components/solarzap/ConfiguracoesContaView.tsx`
- `src/pages/AdminMembersPage.tsx`

Corrija completamente cards, metricas, formularios, toggles, badges, tabelas, banners, popovers e estados contextuais.

### Fase 5 - Modais e overlays

Audite e corrija visualmente todas as modais e dialogs relevantes do ecossistema interno.

Nao trate isso como opcional.

Garanta consistencia de:

- backdrop;
- glass e translucidez, se houver;
- bordas e sombras;
- hierarquia tipografica;
- botoes primarios, secundarios e destrutivos;
- campos e labels;
- mensagens de erro e sucesso;
- espacos, divisorias e densidade visual.

### Fase 6 - Auth e telas publicas

Revise obrigatoriamente:

- `src/pages/Login.tsx`
- `src/pages/UpdatePassword.tsx`
- `src/pages/OrganizationSelect.tsx`
- `src/pages/Onboarding.tsx`
- `src/pages/Pricing.tsx`
- `src/pages/PrivacyPolicy.tsx`
- `src/pages/TermsOfService.tsx`

Prioridade maxima para login, update password, onboarding e pricing, porque essas areas concentram grande quantidade de gradientes e acentos visuais antigos.

O objetivo e que essas telas parem de parecer outro produto.

### Fase 7 - Limpeza final de residuos antigos

Depois das alteracoes:

1. Reexecute as buscas por tokens e classes do branding antigo.
2. Elimine residuos visuais restantes nas superficies em escopo.
3. Mantenha apenas o verde estritamente semantico.
4. Revise o diff para confirmar que nada funcional foi alterado por acidente.

## Cobertura minima obrigatoria de areas do produto

Considere obrigatoria a revisao visual destas areas:

- conversas
- pipelines
- calendario
- contatos
- disparos
- propostas
- dashboard
- ia_agentes
- automacoes
- integracoes
- tracking
- banco_ia
- meu_plano
- minha_conta
- admin_members
- login
- update-password
- organization-select
- onboarding
- pricing
- privacy
- terms

## Arquivos de ancoragem tecnica

Use estes arquivos como base minima para conduzir a execucao:

- `src/index.css`
- `tailwind.config.ts`
- `src/App.tsx`
- `src/types/solarzap.ts`
- `src/components/solarzap/SolarZapLayout.tsx`
- `src/components/solarzap/SolarZapNav.tsx`
- `src/components/solarzap/PageHeader.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/components/billing/BillingBanner.tsx`
- `src/components/billing/OnboardingChecklist.tsx`
- `src/components/onboarding/OnboardingWizardShell.tsx`
- `src/components/onboarding/GuidedTour.tsx`
- `src/pages/Login.tsx`
- `src/pages/UpdatePassword.tsx`
- `src/pages/Onboarding.tsx`
- `src/pages/Pricing.tsx`
- `public/logo.png`
- `public/favicon.ico`

## Criterios de qualidade

O resultado precisa cumprir simultaneamente:

1. Consistencia visual entre shell, abas internas, modais e telas publicas.
2. Light mode e dark mode coerentes.
3. Boa legibilidade de textos, icones, bordas, hover e focus.
4. Ausencia de branding antigo residual nas superfícies em escopo.
5. Manutencao da semantica visual de sucesso, alerta, erro e informacao.
6. Responsividade aceitavel em desktop e mobile.
7. Zero regressao funcional causada por mudanca visual.

## Verificacao obrigatoria

Antes de encerrar, execute obrigatoriamente:

1. Busca final por residuos de branding antigo.
2. `npx tsc --noEmit`.
3. Revisao do diff para garantir escopo estritamente visual.
4. Validacao manual das telas publicas e de todas as abas internas.
5. Validacao manual em light mode e dark mode.
6. Validacao manual em desktop e mobile.

## Formato de resposta final

Quando terminar, responda apenas com:

1. resumo curto do que foi alterado;
2. lista curta dos arquivos principais modificados;
3. verificacoes executadas;
4. bloqueios restantes, se houver;
5. confirmacao explicita de que o escopo permaneceu apenas visual.

Nao devolva um novo plano. Nao devolva brainstorming. Execute.