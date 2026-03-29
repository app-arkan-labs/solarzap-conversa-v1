# Plano de Garantia de Isolamento B2B x B2C (CRM Interno)

Data: 2026-03-28
Escopo: garantir que o CRM interno (B2B) nao se misture com os dados operacionais dos clientes nas orgs (B2C).

## 1) Contrato de Arquitetura (obrigatorio)

1. CRM interno escreve somente em internal_crm.*.
2. CRM interno nao pode ler/escrever tabelas runtime dos tenants (ex.: public.leads, public.propostas, public.interacoes).
3. Ponte com dominio publico so pode ocorrer por caminhos explicitos:
   - leitura resumida por RPC read-only (crm_bridge_org_summary);
   - provisionamento de cliente via admin-api (create_org_with_user).
4. Frontend de src/modules/internal-crm nao pode importar hooks operacionais do produto principal (useLeads, useChat, usePipeline, etc.).

## 2) Plano de Execucao

Fase A - Guard rail de codigo (unitario):
- Criar teste que falha se internal-crm-api tocar tabelas runtime de tenant.
- Criar teste que falha se a bridge RPC de resumo de org tiver comandos mutantes em public.*.
- Criar teste que falha se modulos internos importarem hooks runtime do SolarZap principal.

Fase B - Guard rail no smoke oficial:
- Incluir validacao de fronteira B2B/B2C no scripts/smoke_test_final.ps1 em LITE e FULL mode.

Fase C - Operacao local confiavel:
- Quando secrets remotos estiverem ausentes, executar LOCAL mode explicitamente no smoke:
  - boundary guard estatico;
  - npm run test:boundary;
  - npm run typecheck.

Fase D - Validacao e aceite:
- Rodar test:boundary.
- Rodar typecheck.
- Rodar task oficial Smoke Tests + Commit.
- Aceite: 0 FAIL em todos os checks executados no modo disponivel.

## 3) Execucao Realizada nesta sessao

Implementado:
- tests/unit/internalCrmBoundaryGuard.test.ts (novo).
- package.json: script npm test:boundary (novo).
- scripts/smoke_test_final.ps1:
  - funcao Test-InternalCrmIsolationBoundary (nova);
  - gate de fronteira em LITE mode (L06);
  - gate de fronteira em FULL mode (T26);
  - LOCAL mode para ambientes sem secrets remotos.

Executado:
- npm run test:boundary -> PASS.
- npm run typecheck -> PASS.
- Task oficial Smoke Tests + Commit -> PASS (LOCAL mode: 3 PASS, 0 FAIL).

## 4) Analise do Plano Atual (seguir ou ajustar)

Conclusao:
- O plano atual pode e deve continuar sendo seguido.
- Ele ja esta alinhado com isolamento de dominio e com a regra de onboarding via ponte controlada.

Ajustes necessarios para sustentar essa forma de trabalho:
1. Manter este boundary guard como gate obrigatorio de PR.
2. Separar formalmente os niveis de smoke:
   - LOCAL (sem secrets): gate estatico + typecheck;
   - LITE (com secrets base): auth/health remotos;
   - FULL (com org+usuario smoke): fluxo de negocio completo.
3. Adicionar uma checklist de release exigindo resultado do modo FULL antes de deploy de producao.
4. Reavaliar trimestralmente a allowlist de pontes entre dominios para evitar acoplamentos novos.

Status final: isolamento B2B x B2C reforcado com controles automaticos e smoke operacional em ambiente local sem secrets.
