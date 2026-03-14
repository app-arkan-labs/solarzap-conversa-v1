# Mobile Production Action Plan

## Objetivo

Fechar os gaps entre blueprint e implementação atual para liberar a versão mobile com segurança de produção, sem regressão desktop.

## Diagnóstico Atual

### Status geral

- A base da navegação mobile foi implementada (bottom nav, modal Mais, config compartilhada, adaptações nas principais views).
- A implementação não está 100% pronta para produção neste momento.

### Bloqueadores de produção

1. Typecheck quebrado no app.
2. Fluxo mobile do pipeline ainda sem alternativa completa para mover estágio (drag foi desativado no mobile).
3. Smoke mobile e validação E2E não executados após as mudanças.

### Erros técnicos atuais (typecheck)

Origem da checagem: comando npm run -s typecheck.

- src/components/onboarding/GuidedTour.tsx
  - Step usa campo description, mas o tipo resolvido em build não contém essa propriedade.
- src/lib/guidedTourTargets.ts
  - Resolver usa selector, mas o tipo resolvido em build não contém essa propriedade.
- src/components/solarzap/SolarZapLayout.tsx
  - Assinaturas esperadas de useGuidedTour.closeTour e do segundo argumento de useGuidedTour estão divergentes.
- src/components/solarzap/CalendarView.tsx
  - ptBR está sendo usado sem import.
- src/hooks/useProposalForm.ts
  - Campo descontoAvistaPercentual não existe no tipo ProposalPDFData.

## Plano de Execução

## Fase 0 - Sanidade de base

Objetivo: zerar erros de compilação antes de qualquer ajuste funcional adicional.

1. Corrigir contrato de tipos do Guided Tour para ficar consistente entre:
   - src/components/onboarding/tourSteps.ts
   - src/components/onboarding/GuidedTour.tsx
   - src/lib/guidedTourTargets.ts
   - tests/unit/guidedTourTargets.test.ts
2. Corrigir import de locale em CalendarView (ptBR).
3. Corrigir mismatch entre ProposalPDFData e payload em useProposalForm.
4. Rodar typecheck até ficar limpo.

Comando de validação:

- npm run -s typecheck

Critério de aceite:

- Zero erros TypeScript no comando acima.

## Fase 1 - Gap funcional mobile (Pipeline)

Objetivo: fechar requisito do blueprint para operação mobile sem drag-and-drop.

1. Implementar ação mobile explícita para mover lead de estágio no Pipeline.
2. Expor a ação no card mobile com UX clara (sheet/menu de etapas).
3. Garantir que mudança de estágio aciona o mesmo fluxo de negócio já usado no desktop.

Critério de aceite:

- Em viewport mobile, usuário consegue mover lead entre etapas sem depender de drag.
- Desktop mantém comportamento atual de drag.

## Fase 2 - Testes de regressão obrigatórios

Objetivo: validar a navegação mobile e garantir ausência de regressão crítica.

1. Executar smoke mobile atualizado.
2. Executar suite mínima de regressão (typecheck + unit tests relevantes).
3. Registrar evidência dos resultados no PR/relatório.

Comandos sugeridos:

- npm run -s typecheck
- npm run -s test:unit
- npx playwright test tests/e2e/mobile-critical-tabs-smoke.spec.ts

Critério de aceite:

- Smoke mobile passa.
- Sem erro de compilação.
- Sem falha crítica de unit test introduzida pela mudança.

## Fase 3 - Hardening de UX e checklist blueprint

Objetivo: concluir os itens restantes do checklist de qualidade para produção.

1. Validar foco e fechamento do modal Mais (backdrop, Escape, retorno de foco).
2. Validar safe-area em iOS e Android (com e sem barra de gestos).
3. Validar teclado virtual em:
   - Conversas (input)
   - Contatos (edição)
   - Calendário (agendamento)
4. Validar landscape em 390x844 equivalente.
5. Confirmar que desktop permaneceu intacto nas abas principais.

Critério de aceite:

- Checklist de QA aprovado sem bloqueadores.

## Fase 4 - Fechamento para produção

Objetivo: deixar release pronto com documentação e controle de risco.

1. Atualizar docs/MOBILE_IMPLEMENTATION_REPORT.md com status final pós-correções.
2. Incluir seção de evidências (comandos executados e resultado).
3. Confirmar plano de rollback (feature flag ou revert seguro).

Critério de aceite:

- Report atualizado com status final e evidências.
- Release pode seguir para deploy com risco conhecido e mitigado.

## Ordem de execução recomendada

1. Fase 0
2. Fase 1
3. Fase 2
4. Fase 3
5. Fase 4

## Definição de pronto

A versão mobile só é considerada pronta para produção quando:

- Typecheck está limpo.
- Pipeline mobile permite mover estágio sem drag.
- Smoke mobile passa.
- Checklist de UX e regressão desktop está validado.
- Relatório final está atualizado com evidências.

## Status de execução (14/03/2026)

- Fase 0: concluída.
  - Typecheck corrigido e sem erros.
- Fase 1: concluída.
  - Pipeline mobile com ação explícita para mover estágio via menu no card.
- Fase 2: concluída.
  - Unit tests e smoke mobile executados e aprovados.
- Fase 3: parcialmente concluída.
  - Cobertura automatizada validada; faltam somente checks manuais em dispositivo real (safe-area, teclado virtual, landscape).
- Fase 4: concluída para documentação técnica.
  - Report atualizado com evidências e pendências residuais.