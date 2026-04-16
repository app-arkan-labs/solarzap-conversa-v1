# Relatorio Tecnico - Modulo Contratual SolarZap

## Fonte de verdade aplicada

Implementacao orientada pelos arquivos, nesta ordem:

1. `GERADOR DE CONTRATOS/blueprint_arquitetura_contratual_solarzap_v2.md`
2. `GERADOR DE CONTRATOS/minuta_estrutural_contrato_base_solarzap_template_v2.md`
3. `GERADOR DE CONTRATOS/contrato_base_solarzap_template_real_v2.md`

## Entregaveis implementados

1. Schema/modelagem central do modulo contratual.
2. Maquina de estados do contrato.
3. Wizard modal de formalizacao com 8 etapas.
4. Motor de merge/template com placeholders, resumo comercial e anexos.
5. Preview contratual em HTML.
6. Exportacao funcional de PDF.
7. Persistencia central via Supabase + storage privado.
8. Rota dedicada para uso futuro por embed/prefill.
9. Mocks de teste Solar Prime.
10. Testes unitarios e golden test gerando artifacts reais.

## Arquitetura implantada

### 1. Persistencia central

Migration criada:

- `supabase/migrations/20260416000100_contract_module_foundation.sql`

Tabelas adicionadas:

- `public.contract_drafts`
  - registro central do contrato/draft
  - separa `legal_data` de `internal_metadata`
  - persiste `commercial_summary`, `plan_snapshot`, `special_condition_snapshot`, `payment_snapshot`, `recurrence_snapshot`, `placeholder_snapshot`
  - guarda `rendered_html`, `rendered_text`, status, assinatura e referencias de preview/PDF

- `public.contract_artifacts`
  - historico de preview/PDF/snapshots
  - permite versionamento por artifact e rastreabilidade de storage

- `public.contract_events`
  - event log nativo do modulo
  - registra criacao, save, review, preview, PDF, cancelamento e falhas

Tambem foi criada a funcao:

- `public.generate_contract_number()`

Migration adicional criada:

- `supabase/migrations/20260416000200_contract_embed_sessions.sql`

Tabela adicional:

- `public.contract_embed_sessions`
  - controla a sessao publica do iframe
  - vincula token assinado a um draft especifico
  - registra origem permitida, TTL, prefill e lock fields

### 2. Storage privado

Edge Function criada:

- `supabase/functions/contract-storage-intent/index.ts`

Responsabilidades:

- validar usuario autenticado
- validar membership em `organization_members`
- garantir bucket privado `contracts`
- emitir signed upload URL para HTML/PDF do contrato

### 2.1 Sessao publica de embed

Edge Functions criadas:

- `supabase/functions/contract-embed-link/index.ts`
- `supabase/functions/contract-embed-api/index.ts`

Responsabilidades:

- emitir token HMAC com sessao limitada a um draft
- criar draft inicial para embed com prefill controlado
- resolver a sessao publica sem login
- persistir `save`, `review_ready`, `save_preview` e `save_pdf`
- reaplicar lock fields no backend antes de salvar
- validar `allowed_origin` quando a origem embed e enviada pelo iframe

### 3. Dominio compartilhado

Arquivos centrais:

- `src/modules/contracts/lib/domain.ts`
- `src/modules/contracts/lib/config.ts`
- `src/modules/contracts/lib/schema.ts`
- `src/modules/contracts/lib/catalog.ts`
- `src/modules/contracts/lib/derivations.ts`
- `src/modules/contracts/lib/stateMachine.ts`
- `src/modules/contracts/lib/templateEngine.ts`
- `src/modules/contracts/lib/pdf.ts`
- `src/modules/contracts/lib/repository.ts`
- `src/modules/contracts/lib/mock.ts`

Esses arquivos concentram:

- schema Zod/TypeScript
- defaults juridicos/comerciais
- catalogo de planos A/B/C
- aplicacao de regra de condicao especial
- placeholders juridicos
- merge do contrato-base real v2
- selecao do anexo correto do plano
- injecao condicional do anexo de condicao especial
- geracao de HTML e PDF a partir da mesma origem

### 4. Superficie do modulo

Componentes criados:

- `src/modules/contracts/components/ContractsWorkspace.tsx`
- `src/modules/contracts/components/ContractsEmbedSurface.tsx`
- `src/modules/contracts/components/ContractWizardDialog.tsx`
- `src/modules/contracts/components/ContractPreview.tsx`
- `src/modules/contracts/components/ContractStatusBadge.tsx`

Hooks centrais:

- `src/modules/contracts/hooks/useContractModule.ts`
- `src/modules/contracts/hooks/useContractEmbedSession.ts`

Integracoes no app:

- rota interna final: `/admin/crm/contracts`
- redirect de compatibilidade: `/admin/contracts`
- rota publica de embed: `/embed/contracts?token=...`
- navegacao do modulo via `adminCrmNavigation`

Arquivos integrados:

- `src/App.tsx`
- `src/pages/Admin.tsx`
- `src/pages/ContractsEmbed.tsx`
- `src/components/admin/adminCrmNavigation.ts`

## Grupo A x Grupo B

### Grupo A - dados juridicos renderizados

Entram no contrato e no PDF:

- contratante
- responsavel legal
- contratada
- plano contratado
- valores
- vencimentos
- recorrencia
- foro
- plataforma de assinatura
- condicao especial
- resumo comercial
- anexos

### Grupo B - metadados internos

Persistidos em `internal_metadata` + colunas de controle:

- `contract_draft_id`
- `contract_number`
- `contract_version`
- `template_version`
- `lead_id`
- `opportunity_id`
- `organization_id`
- `seller_user_id`
- `generated_from`
- `source_context`
- `embed_origin`
- `embed_source`
- `created_by_user_id`
- `last_updated_by_user_id`
- `contract_status`
- `signature_status`
- `signature_provider`
- `signature_envelope_id`
- `pdf_storage_path`
- `preview_storage_path`
- `event_log`

Observacao:

- `contract_number` e `template_version` aparecem no texto final porque o contrato-base real v2 ja os coloca explicitamente no documento.

## Maquina de estados

Estados implementados:

- `draft`
- `review_ready`
- `preview_generated`
- `pdf_generated`
- `sent_for_signature`
- `signed`
- `cancelled`
- `expired`
- `failed`

Regras aplicadas:

- nao existe salto direto de `draft` para `pdf_generated`
- preview exige contrato revisado
- PDF nasce do mesmo render do preview
- eventos sao registrados em `contract_events` e no `eventLog` local do draft

## Regras de negocio por plano

### Plano A

- implantacao enxuta
- sem acompanhamento semanal
- sem suporte WhatsApp ampliado
- sem landing page salvo condicao especial

### Plano B

- 1 reuniao de coleta e alinhamento
- 1 mes de SolarZap
- trafego pago
- treinamento base
- sem landing page salvo condicao especial

### Plano C

- tudo do Plano B
- acompanhamento semanal
- suporte via WhatsApp na implantacao
- reuniao extra e landing page apenas quando registrados

### Condicao especial

Quando ativa:

- injeta Anexo IV
- altera resumo comercial
- aciona flags de reuniao extra e/ou landing page
- preserva contrato unico com recorrencia no mesmo instrumento

## Preview e PDF

### Preview

- usa o texto do `contrato_base_solarzap_template_real_v2.md`
- substitui placeholders definidos na minuta
- inclui apenas o anexo do plano selecionado
- inclui Anexo IV apenas quando `condicaoEspecial.ativa = true`
- gera HTML limpo a partir da mesma arvore de blocos usada pelo PDF

### PDF

- gerado via `jsPDF` com base nos blocos do preview
- usa a mesma fonte de verdade do preview
- pode ser salvo em storage privado via `contract-storage-intent`

## Mock obrigatorio gerado

Mock implementado em:

- `src/modules/contracts/lib/mock.ts`

Caso obrigatorio Solar Prime gerado por teste golden em:

- `artifacts/contracts/solar-prime-contract-draft.json`
- `artifacts/contracts/solar-prime-contract-render.md`
- `artifacts/contracts/solar-prime-contract-render.html`
- `output/pdf/solar-prime-contrato-teste.pdf`

Dados aplicados:

- empresa `Solar Prime Energia Ltda`
- responsavel `Joao Pedro Martins`
- plano `plano_c / Implementacao Completa`
- implantacao `R$ 2.000,00`
- recorrencia `R$ 1.500,00`
- condicao especial com reuniao extra + landing page
- inicio e primeiro vencimento em `20/04/2026`
- foro `Marilia/SP`
- assinatura `ZapSign`

## Validacoes executadas

Executado com sucesso:

- `npm run build`
- `npx vitest run tests/unit/contracts/embedToken.test.ts tests/unit/contracts/templateEngine.test.ts tests/golden/contractModule.golden.test.ts`

Observacao sobre typecheck global:

- `npm run typecheck` continua falhando por erros preexistentes em `src/modules/internal-crm/...`
- o recorte filtrado por `src/modules/contracts` ficou limpo

## Observacoes tecnicas relevantes

### 1. Codificacao do template

O contrato-base bruto chegou com sinais de mojibake no import raw. O motor contratual aplica reparo de codificacao antes do merge para preservar acentuacao correta em preview/PDF.

### 2. Dados fixos da contratada

Os 3 documentos-base trouxeram apenas placeholders da contratada, sem todos os valores concretos. Por isso:

- foi criada configuracao central em `src/modules/contracts/lib/config.ts`
- a contratada padrao pode ser sobrescrita por `VITE_CONTRACTOR_*`
- o representante/CNPJ devem ser revisados na configuracao final do ambiente antes de producao juridica

Variaveis suportadas:

- `VITE_CONTRACTOR_RAZAO_SOCIAL`
- `VITE_CONTRACTOR_NOME_FANTASIA`
- `VITE_CONTRACTOR_CNPJ`
- `VITE_CONTRACTOR_ENDERECO`
- `VITE_CONTRACTOR_REPRESENTANTE_NOME`
- `VITE_CONTRACTOR_REPRESENTANTE_CPF`
- `VITE_CONTRACT_SIGNATURE_PLATFORM_NAME`
- `VITE_CONTRACT_SIGNATURE_PLATFORM_URL`
- `VITE_CONTRACT_FORO_CIDADE`
- `VITE_CONTRACT_FORO_ESTADO`

## Proximo passo natural

Com a base pronta, o proximo passo tecnico natural e conectar o envio real para assinatura eletronicamente:

1. criar envelope na plataforma escolhida
2. persistir `signature_envelope_id`
3. mover status para `sent_for_signature`
4. receber webhook e consolidar `signed`
