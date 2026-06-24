# Requisitos e Casos de Uso - SolarZap

## Observacoes de escopo

Este documento lista requisitos inferidos a partir do codigo-fonte do SolarZap. Quando a funcionalidade e evidenciada por componentes, hooks, migrations ou Edge Functions, ela e marcada como implementada no codigo. Quando depende de ambiente externo, configuracao em producao ou comprovacao visual, a situacao e indicada como **pendente de confirmacao**.

## Atores do sistema

| Ator | Descricao | Evidencia |
|---|---|---|
| Visitante/lead | Pessoa interessada em produto/servico de energia solar, recebida por formulario, WhatsApp ou campanha. | `leads`, `attribution-webhook`, `lp-popup-intake`, `evolution-webhook`. |
| Usuario autenticado | Usuario logado no SolarZap. | `AuthContext.tsx`, `ProtectedRoute.tsx`. |
| Consultor/vendedor | Usuario que atende leads, conversa, move pipeline e cria propostas. | Roles em `AuthContext.tsx`, `useSellerPermissions`, `useLeads`. |
| Administrador da organizacao | Usuario com permissao de equipe, automacoes, integracoes e configuracoes. | `owner/admin` em `ProtectedRoute`, `mobileNavConfig.ts`. |
| Proprietario da organizacao | Usuario responsavel por plano, billing e administracao da empresa. | `owner`, `useOrgBilling`, `Billing`, `Pricing`. |
| Administrador do sistema | Usuario com acesso a `/admin/*`, organizacoes, feature flags, auditoria e financeiro SaaS. | `AdminGuard.tsx`, `useAdminApi.ts`. |
| Membro do CRM interno | Usuario de operacao interna com roles especificas. | `src/modules/internal-crm/types/index.ts`. |
| Provedor externo | Sistemas externos como WhatsApp/Evolution, Google, Meta, Stripe, Resend e OpenAI. | `supabase/functions/`. |
| Worker/automacao | Jobs serverless, cron e agentes de IA que processam tarefas. | `process-agent-jobs`, `notification-worker`, `conversion-dispatcher`, migrations cron. |

## Requisitos funcionais

| Codigo | Requisito funcional | Situacao | Evidencia |
|---|---|---|---|
| RF01 | Permitir login, cadastro, recuperacao e encerramento de sessao. | Implementado no codigo. | `src/contexts/AuthContext.tsx`, `src/pages/Login.tsx`, `src/App.tsx`. |
| RF02 | Permitir selecao de organizacao quando o usuario possui mais de uma. | Implementado no codigo. | `src/pages/SelectOrganization.tsx`, `AuthContext.tsx`. |
| RF03 | Validar acesso por organizacao, status, papel, onboarding e billing. | Implementado no codigo. | `src/components/ProtectedRoute.tsx`, `useOrgBilling`. |
| RF04 | Cadastrar, listar, editar, importar, atribuir e excluir leads/contatos. | Implementado no codigo, com algumas acoes dependentes de UI/confirmacao. | `src/hooks/domain/useLeads.ts`, `ContactsView`, RPC `import_leads_batch`. |
| RF05 | Filtrar leads por responsavel, permissao de equipe e instancias de WhatsApp permitidas. | Implementado no codigo. | `useLeads.ts`, `useSellerPermissions`, `organization_members`. |
| RF06 | Exibir e movimentar leads no pipeline comercial. | Implementado no codigo. | `PipelineView`, `usePipeline.ts`, `PipelineStage`. |
| RF07 | Registrar historico de mensagens/interacoes por lead. | Implementado no codigo. | `useChat.ts`, `interacoes` em `src/lib/supabase.ts`. |
| RF08 | Enviar mensagens e midias por integracao de WhatsApp. | Implementado no codigo; operacao real depende de credenciais. | `useChat.ts`, `evolution-api`, `storage-intent`, `media-resolver`. |
| RF09 | Receber webhooks de WhatsApp e associar eventos a leads/conversas. | Implementado no codigo; depende de configuracao externa. | `evolution-webhook`, `whatsapp-webhook`. |
| RF10 | Criar e consultar agendamentos, visitas, reunioes e calendario. | Implementado no codigo. | `20260128000001_calendar_module.sql`, `CalendarView`, `useAppointments`. |
| RF11 | Criar tarefas associadas a leads. | Implementado no codigo. | `20260212_lead_tasks.sql`, `20260212170200_lead_tasks.sql`, `useLeadTasks`. |
| RF12 | Gerar proposta comercial com dados tecnicos e financeiros. | Implementado no codigo. | `useProposalForm.ts`, `solarSizing.ts`, `proposalFinancialModel.ts`. |
| RF13 | Persistir versoes, secoes e eventos de proposta. | Implementado no codigo. | `proposal_versions`, `proposal_sections`, `proposal_delivery_events`. |
| RF14 | Configurar mensagens e automacoes por etapa do funil. | Implementado no codigo. | `AutomationContext.tsx`, `AutomationsView.tsx`, `automation_settings`. |
| RF15 | Desativar IA/follow-up em situacoes de atendimento humano. | Implementado no codigo. | `useChat.ts`, `useLeads.ts`, `scheduled_agent_jobs`. |
| RF16 | Conectar e desconectar integracoes Google, Meta e WhatsApp. | Implementado no codigo; ativacao depende de credenciais. | `useIntegrations.ts`, `google-oauth`, `meta-oauth`, `integration-disconnect`. |
| RF17 | Configurar tracking, plataformas de anuncio e webhooks de atribuicao. | Implementado no codigo. | `useTrackingData.ts`, `tracking_v3_schema.sql`, `attribution-webhook`. |
| RF18 | Enviar eventos de conversao para plataformas externas. | Implementado no codigo; depende de credenciais e eventos reais. | `conversion-dispatcher`, `conversion_deliveries`. |
| RF19 | Gerenciar planos, billing, checkout e portal de assinatura. | Implementado no codigo; depende de Stripe. | `useOrgBilling`, `stripe-checkout`, `stripe-webhook`, migrations billing. |
| RF20 | Permitir administracao do sistema, organizacoes, feature flags e auditoria. | Implementado no codigo. | `src/pages/Admin.tsx`, `AdminGuard.tsx`, `useAdminApi.ts`. |
| RF21 | Operar CRM interno com clientes, deals, tarefas, inbox, campanhas, calendario, automacoes e financeiro. | Implementado no codigo. | `src/modules/internal-crm/`, migrations `internal_crm_*`. |
| RF22 | Criar e gerenciar contratos/minutas e artefatos. | Implementado no codigo. | `src/modules/contracts/`, migrations `contract_*`. |
| RF23 | Exibir dashboards e relatorios. | Implementado no codigo; dados reais dependem de ambiente. | `DashboardView`, `reports-dashboard`, `useDashboardReport`. |
| RF24 | Enviar notificacoes/e-mails de eventos relevantes. | Implementado no codigo; depende de provedor. | `notification-worker`, migrations notificacao. |
| RF25 | Gerenciar base de conhecimento e contexto de IA. | Implementado no codigo. | `knowledge_base_*`, `kb-ingest`, `AIAgentsView`. |

## Requisitos nao funcionais

| Codigo | Requisito nao funcional | Evidencia |
|---|---|---|
| RNF01 | O sistema deve ser acessivel via navegador web moderno. | React/Vite em `package.json`, `src/App.tsx`. |
| RNF02 | O sistema deve separar responsabilidades por componentes, hooks e modulos. | `src/components/`, `src/hooks/`, `src/modules/`. |
| RNF03 | O sistema deve usar tipagem estatica para reduzir erros. | TypeScript, interfaces em `src/types/solarzap.ts`. |
| RNF04 | O sistema deve isolar dados por organizacao. | `org_id`, RLS, `organization_members`, `ProtectedRoute`. |
| RNF05 | O sistema deve proteger rotas autenticadas. | `ProtectedRoute.tsx`, `AdminGuard.tsx`. |
| RNF06 | O sistema deve proteger area administrativa com controle adicional. | MFA/admin guard em `AdminGuard.tsx`. |
| RNF07 | O sistema deve versionar alteracoes de banco. | `supabase/migrations/`. |
| RNF08 | O sistema deve permitir deploy reproduzivel. | `Dockerfile`, `docker-compose.vps.yml`, `Caddyfile`. |
| RNF09 | O sistema deve permitir testes automatizados. | `vitest.config.ts`, `playwright.config.ts`, `tests/`. |
| RNF10 | O sistema deve evitar exposicao de segredos em documentacao e evidencias. | Uso de env vars/vault; revisao manual obrigatoria. |
| RNF11 | O sistema deve suportar integracao com APIs externas por backend serverless. | `supabase/functions/`. |
| RNF12 | O sistema deve registrar logs/eventos relevantes para auditoria e operacao. | `admin audit`, eventos de proposta, notificacoes, conversion deliveries. |

## Casos de uso principais

### UC01 - Autenticar usuario e acessar organizacao

| Campo | Descricao |
|---|---|
| Atores | Usuario autenticado, Supabase Auth. |
| Pre-condicoes | Usuario cadastrado e organizacao existente. |
| Fluxo principal | 1. Usuario acessa `/login`. 2. Informa credenciais. 3. `AuthContext` valida sessao. 4. Sistema resolve organizacoes. 5. Se houver mais de uma, direciona para selecao. 6. Acesso a rota protegida e liberado conforme status e papel. |
| Fluxos alternativos | Organizacao suspensa direciona para tela de restricao; billing pendente direciona para billing; onboarding pendente direciona para onboarding. |
| Criterios de aceite | Usuario valido acessa a area principal; usuario nao autenticado e redirecionado ao login; organizacao e papel sao carregados corretamente. |
| Evidencia | `src/contexts/AuthContext.tsx`, `ProtectedRoute.tsx`, `src/App.tsx`. |

### UC02 - Gerenciar lead/contato

| Campo | Descricao |
|---|---|
| Atores | Consultor/vendedor, administrador da organizacao. |
| Pre-condicoes | Usuario autenticado e autorizado. |
| Fluxo principal | 1. Usuario acessa Contatos. 2. Lista leads da organizacao. 3. Cria ou edita lead. 4. Sistema persiste dados comerciais, contato, origem e responsavel. |
| Fluxos alternativos | Importacao em lote por RPC; exclusao definitiva por funcao especifica; escopo restrito a leads do proprio usuario. |
| Criterios de aceite | Lead aparece na listagem, possui `org_id`, pode ser atualizado e respeita permissoes de acesso. |
| Evidencia | `useLeads.ts`, `src/types/solarzap.ts`, `ContactsView`. |

### UC03 - Atender lead por conversa

| Campo | Descricao |
|---|---|
| Atores | Consultor/vendedor, lead, provedor WhatsApp. |
| Pre-condicoes | Lead cadastrado e instancia/canal configurado. |
| Fluxo principal | 1. Usuario abre Conversas. 2. Seleciona lead. 3. Sistema carrega interacoes. 4. Usuario envia mensagem. 5. Edge Function/provider envia mensagem. 6. Interacao fica registrada. |
| Fluxos alternativos | Envio de midia com upload; recebimento por webhook; pausas de IA quando atendimento humano assume conversa. |
| Criterios de aceite | Mensagem enviada aparece no historico; mensagem recebida por webhook e associada ao lead correto. |
| Evidencia | `useChat.ts`, `evolution-api`, `evolution-webhook`, `whatsapp-connect`. |

### UC04 - Movimentar lead no pipeline

| Campo | Descricao |
|---|---|
| Atores | Consultor/vendedor, administrador da organizacao. |
| Pre-condicoes | Lead existente no CRM. |
| Fluxo principal | 1. Usuario acessa Pipeline. 2. Move card para outra etapa. 3. Sistema atualiza `status_pipeline` e data de mudanca. 4. Regras de automacao e sincronizacoes sao acionadas conforme etapa. |
| Fluxos alternativos | Bloqueio/controle de retrocesso; abertura de modal de visita; criacao de proposta relacionada. |
| Criterios de aceite | Etapa do lead e persistida, historico/regra relacionada e aplicada, UI reflete nova etapa. |
| Evidencia | `usePipeline.ts`, `AutomationContext.tsx`, `PipelineStage`. |

### UC05 - Criar proposta comercial

| Campo | Descricao |
|---|---|
| Atores | Consultor/vendedor, cliente/lead. |
| Pre-condicoes | Lead com dados suficientes para proposta. |
| Fluxo principal | 1. Usuario acessa Propostas. 2. Preenche dados do cliente, consumo e valores. 3. Sistema calcula dimensionamento e indicadores financeiros. 4. Gera versao de proposta/PDF. 5. Registra evento de entrega ou compartilhamento. |
| Fluxos alternativos | Uso de geocodificacao/irradiancia; propostas personalizadas por IA; link compartilhavel. |
| Criterios de aceite | Proposta gerada com dados do lead, calculos e versao persistida. |
| Evidencia | `useProposalForm.ts`, `solarSizing.ts`, `proposalFinancialModel.ts`, migrations `proposal_*`. |

### UC06 - Configurar automacoes

| Campo | Descricao |
|---|---|
| Atores | Owner/admin da organizacao. |
| Pre-condicoes | Usuario com permissao administrativa. |
| Fluxo principal | 1. Usuario acessa Automacoes. 2. Habilita/desabilita regras. 3. Edita mensagens padronizadas. 4. Sistema salva configuracao por `org_id`. |
| Fluxos alternativos | Fallback local quando persistencia remota nao esta disponivel; automacoes internas por cron. |
| Criterios de aceite | Configuracao e carregada novamente apos reload e afeta comportamento do CRM. |
| Evidencia | `AutomationsView.tsx`, `AutomationContext.tsx`, `automation_settings`. |

### UC07 - Configurar integracoes

| Campo | Descricao |
|---|---|
| Atores | Owner/admin, provedores externos. |
| Pre-condicoes | Credenciais externas e autorizacoes disponiveis. |
| Fluxo principal | 1. Usuario abre Integracoes. 2. Inicia OAuth/conexao. 3. Edge Function processa callback. 4. Status de integracao e salvo. |
| Fluxos alternativos | Desconexao; erro de autorizacao; integracao WhatsApp por instancia. |
| Criterios de aceite | Integracao aparece como conectada e pode ser usada pelo modulo correspondente. |
| Evidencia | `useIntegrations.ts`, `google-oauth`, `meta-oauth`, `whatsapp-connect`. |

### UC08 - Registrar atribuicao e conversao

| Campo | Descricao |
|---|---|
| Atores | Sistema externo, webhook, worker de conversao. |
| Pre-condicoes | Tracking configurado e chave publica/credenciais validas. |
| Fluxo principal | 1. Evento chega no webhook de atribuicao. 2. Sistema resolve lead e origem. 3. Conversao e registrada. 4. Dispatcher envia evento para plataformas configuradas. |
| Fluxos alternativos | Rate limit, evento invalido, entrega pendente/retry, credencial ausente. |
| Criterios de aceite | Evento fica registrado e entrega possui status rastreavel. |
| Evidencia | `attribution-webhook`, `conversion-dispatcher`, `tracking_v3_schema.sql`. |

### UC09 - Administrar organizacao/plano

| Campo | Descricao |
|---|---|
| Atores | Proprietario da organizacao, Stripe, sistema. |
| Pre-condicoes | Organizacao existente. |
| Fluxo principal | 1. Usuario acessa plano/billing. 2. Escolhe checkout ou portal. 3. Stripe processa pagamento. 4. Webhook atualiza assinatura/limites. |
| Fluxos alternativos | Plano suspenso, trial, pacote adicional, portal do cliente. |
| Criterios de aceite | Status de billing altera acesso/limites conforme plano. |
| Evidencia | `useOrgBilling`, `stripe-checkout`, `stripe-webhook`, migrations billing. |

### UC10 - Administrar sistema e CRM interno

| Campo | Descricao |
|---|---|
| Atores | Administrador do sistema, membro CRM interno. |
| Pre-condicoes | Usuario com papel administrativo e MFA quando exigido. |
| Fluxo principal | 1. Admin acessa `/admin`. 2. Sistema valida role/MFA. 3. Admin consulta organizacoes, flags, financeiro ou CRM interno. 4. Operacoes sao enviadas para `admin-api` ou `internal-crm-api`. |
| Fluxos alternativos | MFA pendente, role insuficiente, organizacao sem permissao. |
| Criterios de aceite | Somente admins acessam area; acoes ficam registradas/auditaveis. |
| Evidencia | `AdminGuard.tsx`, `useAdminApi.ts`, `src/modules/internal-crm/`. |

## Fluxos de uso resumidos

### Fluxo comercial principal

1. Lead entra por cadastro, importacao, webhook ou integracao.
2. Vendedor visualiza lead em Contatos/Conversas.
3. Atendimento registra interacoes.
4. Lead avanca no pipeline.
5. Sistema aciona automacoes e tarefas.
6. Proposta e gerada.
7. Cliente aprova/negocia.
8. Projeto evolui para contrato, pagamento, instalacao e avaliacao.

### Fluxo de dados de marketing

1. Usuario configura tracking e credenciais.
2. Origem do lead e capturada.
3. Lead/conversao e registrada no banco.
4. Worker despacha evento a plataformas externas.
5. Dashboard/relatorios podem consolidar resultados.

### Fluxo administrativo

1. Admin autentica e valida MFA.
2. Consulta organizacoes e status.
3. Ajusta plano/flags/suspensao quando necessario.
4. Consulta auditoria e financeiro.
5. Opera CRM interno quando possui papel apropriado.

## Criterios gerais de aceite

- O usuario nao autenticado nao deve acessar rotas protegidas.
- Dados exibidos devem estar restritos a organizacao atual.
- Movimentacoes de pipeline devem persistir no banco.
- Interacoes devem ficar associadas ao lead correto.
- Propostas devem manter versao/snapshot para rastreabilidade.
- Automacoes devem ser configuraveis por organizacao.
- Integracoes devem expor status claro de conectado/desconectado.
- Eventos de tracking devem possuir status de entrega/erro.
- Area administrativa deve exigir permissao especifica.
- Prints e testes devem ser anexados sem dados sensiveis.

## Pendencias de confirmacao

- Ambiente real/producao em uso.
- Credenciais ativas das integracoes.
- Dados reais anonimizados para demonstracao.
- Resultado atualizado de testes e typecheck.
- Historico de desenvolvimento durante o periodo de integralizacao do curso.
- Capturas de tela finais para cada caso de uso.

