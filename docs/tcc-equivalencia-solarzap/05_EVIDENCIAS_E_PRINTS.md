# Evidencias e Prints - SolarZap

## Orientacoes gerais

- Gere prints em ambiente local ou producao, conforme disponibilidade.
- Nao exponha dados reais de clientes, telefones, e-mails, documentos, tokens, chaves, segredos ou valores de variaveis de ambiente.
- Se usar dados reais, anonimize antes.
- Evite prints de arquivos `.env`, paineis de secrets, tokens de API ou configuracoes sensiveis.
- Nomeie os arquivos conforme sugestao para facilitar montagem dos anexos.
- Insira os prints no PDF final nas secoes indicadas.

## Lista organizada de prints

| Nome sugerido | Onde tirar | O que comprova | Secao do relatorio |
|---|---|---|---|
| `01-login.png` | Tela `/login` ou tela inicial de acesso. | Existencia de autenticacao e entrada no sistema. | Seguranca, autenticacao e controle de acesso. |
| `02-selecao-organizacao.png` | Tela `/select-organization`, se houver mais de uma organizacao. | Suporte multiempresa/multiorganizacao. | Arquitetura; Escopo do sistema. |
| `03-dashboard.png` | Modulo Dashboard do SolarZap. | Indicadores comerciais e visao gerencial. | Telas e funcionalidades principais; Resultados obtidos. |
| `04-conversas-whatsapp.png` | Aba Conversas, com dados anonimizados. | Atendimento, historico de interacoes e canais digitais. | Fluxos principais; Integracoes identificadas. |
| `05-pipeline-crm.png` | Aba Pipelines. | Funil comercial e etapas do processo de venda solar. | Fluxos principais; Telas e funcionalidades. |
| `06-contatos-leads.png` | Aba Contatos. | Cadastro/listagem de leads e contatos. | Modelagem de dados; Requisitos funcionais. |
| `07-detalhe-lead.png` | Modal/tela de detalhe de lead ou oportunidade. | Dados comerciais, responsavel, etapa e informacoes do cliente. | Fluxos principais; Modelagem de dados. |
| `08-calendario.png` | Aba Calendario. | Agenda, chamadas, reunioes ou visitas. | Fluxos principais; Requisitos funcionais. |
| `09-tarefas-lead.png` | Tarefas associadas a lead, se disponivel na interface. | Controle operacional de follow-up. | Automacoes e regras de negocio. |
| `10-propostas-lista.png` | Aba Propostas/listagem. | Existencia do modulo de propostas. | Telas e funcionalidades principais. |
| `11-proposta-formulario.png` | Tela/formulario de criacao de proposta. | Dados tecnicos e comerciais de projeto solar. | Fluxo de propostas; Modelagem de dados. |
| `12-proposta-pdf.png` | PDF/preview de proposta com dados anonimizados. | Geracao documental e calculos comerciais. | Testes, validacao e evidencias; Anexos. |
| `13-automacoes.png` | Aba Automacoes. | Configuracao de regras, mensagens e comportamentos automaticos. | Automacoes e regras de negocio. |
| `14-integracoes.png` | Central de Integracoes. | Conectores Google, Meta, WhatsApp ou outros. | Integracoes identificadas. |
| `15-whatsapp-instancias.png` | Area de instancias WhatsApp, se separada. | Gestao de canais/instancias de atendimento. | Integracoes identificadas; Fluxo de atendimento. |
| `16-tracking-conversoes.png` | Aba Tracking e Conversoes. | Configuracao de eventos, plataformas e webhooks. | Fluxo de tracking e conversoes. |
| `17-banco-ia.png` | Banco de IA/base de conhecimento. | Estrutura para conhecimento e contexto de agentes. | Automacoes e IA; Trabalhos futuros. |
| `18-ia-agentes.png` | Aba de agentes de IA/configuracoes. | Uso de IA e automacoes orientadas por jobs. | Automacoes e regras de negocio. |
| `19-equipe-membros.png` | Gestao de equipe/membros. | Controle de acesso por usuarios/papeis. | Seguranca, autenticacao e controle de acesso. |
| `20-meu-plano-billing.png` | Meu Plano/Billing. | Modelo SaaS, planos e restricoes. | Arquitetura; Integracoes; Resultados. |
| `21-admin-dashboard.png` | `/admin` dashboard, se voce tiver acesso. | Painel administrativo do sistema. | Admin e CRM interno. |
| `22-admin-organizacoes.png` | Area de organizacoes no admin. | Gestao de tenants/organizacoes. | Seguranca; Modelagem de dados. |
| `23-admin-feature-flags.png` | Area de feature flags. | Controle de funcionalidades por org/plano. | Arquitetura; Trabalhos futuros. |
| `24-admin-audit-log.png` | Auditoria admin. | Rastreabilidade de acoes administrativas. | Seguranca; Testes e validacao. |
| `25-crm-interno-pipeline.png` | CRM interno/pipeline, se aplicavel. | Modulo interno de vendas/operacao. | Escopo do sistema; CRM interno. |
| `26-crm-interno-clientes.png` | CRM interno/clientes. | Modelagem de clientes/deals internos. | Modelagem de dados. |
| `27-crm-interno-automacoes.png` | CRM interno/automacoes. | Regras internas e runs de automacao. | Automacoes e regras de negocio. |
| `28-contratos.png` | Workspace de contratos. | Modulo de minutas, artefatos e fluxo contratual. | Telas e funcionalidades; Anexos. |
| `29-supabase-tabelas.png` | Supabase Table Editor ou lista de migrations, sem dados sensiveis. | Existencia de banco relacional/modelagem. | Modelagem de dados. |
| `30-supabase-functions.png` | Lista de Edge Functions no Supabase ou pasta `supabase/functions`. | Backend serverless e integracoes. | Arquitetura da solucao. |
| `31-supabase-rls.png` | Politicas RLS ou migrations de RLS, sem secrets. | Isolamento e seguranca por organizacao. | Seguranca, autenticacao e controle de acesso. |
| `32-testes-vitest.png` | Terminal com `npm run test`, se executado. | Validacao automatizada. | Testes, validacao e evidencias. |
| `33-typecheck-build.png` | Terminal com `npm run typecheck` ou `npm run build`, se executado. | Integridade tecnica do projeto. | Testes, validacao e evidencias. |
| `34-repositorio-commits.png` | Historico de commits ou tela do repositorio. | Evidencia de desenvolvimento e evolucao. | Metodologia de desenvolvimento. |
| `35-deploy-ambiente.png` | Dominio, servidor, Docker, Caddy ou painel de deploy, se aplicavel. | Existencia de ambiente operacional. | Arquitetura; Resultados obtidos. |

## Prints minimos recomendados

Caso o Portal limite quantidade de anexos, priorize:

1. `01-login.png`
2. `03-dashboard.png`
3. `05-pipeline-crm.png`
4. `06-contatos-leads.png`
5. `07-detalhe-lead.png`
6. `10-propostas-lista.png`
7. `12-proposta-pdf.png`
8. `13-automacoes.png`
9. `14-integracoes.png`
10. `16-tracking-conversoes.png`
11. `29-supabase-tabelas.png`
12. `30-supabase-functions.png`
13. `34-repositorio-commits.png`

## Observacoes para anexos

- Em prints de clientes/leads, use nomes ficticios ou borre dados.
- Em prints de Supabase, mostre estrutura, nao valores de registros sensiveis.
- Em prints de integracoes, oculte qualquer token, chave, segredo, webhook secreto ou client secret.
- Em prints de terminal, revise a saida antes de anexar.
- Em prints de commit/repo, evite expor mensagens com dados sensiveis.

