# Plano de Acao Cirurgico - Ajustes no Gerador de Propostas (2026-03-25)

## 1) Objetivo
Implementar os ajustes solicitados no gerador de propostas com mudancas cirurgicas, sem alterar regras de calculo financeiro nem o pipeline de irradiancia/PVGIS.

## 2) Escopo fechado (somente o que sera alterado)
1. Remover o campo `observacoes` do fluxo do gerador de propostas e do PDF final.
2. Mover o bloco de `condicoes de pagamento` para a ultima pagina (mesma pagina de assinatura).
3. No bloco de condicoes de pagamento (na ultima pagina), incluir:
   - valor cheio da proposta;
   - valor a vista com desconto, no formato `Valor a vista: R$X,00 (Y% de desconto)`;
   - parcelas/condicoes de financiamento (quando aplicavel para a proposta especifica).
4. Na pagina de visao geral apos a capa (cards de destaque):
   - substituir `INVESTIMENTO ESTIMADO` por `SEM ENERGIA SOLAR` (em vermelho), exibindo `R$X,00 / mes`;
   - mover `ECONOMIA MENSAL ESTIMADA` para o lugar de `PAYBACK ESTIMADO`;
   - no lugar antigo da economia mensal, inserir `COM ENERGIA SOLAR` com `R$X,00 / mes`;
   - resultado final dos 3 cards: `SEM ENERGIA SOLAR | COM ENERGIA SOLAR | ECONOMIA MENSAL ESTIMADA`.
5. Remover a parte de personalizacao com IA do gerador de propostas (UI do wizard).

## 3) Escopo explicitamente fora (blindagem de regressao)
1. Nao alterar funcoes/rotas de irradiancia (PVGIS), geocoding ou Solar Resource API.
2. Nao alterar formulas de dimensionamento, TUSD/TE, OM, degradacao ou payback.
3. Nao alterar schema de banco/Supabase, migrations ou Edge Functions para este pacote.
4. Nao alterar pipeline de IA de conversa, automacoes, tracking ou WhatsApp.

## 4) Diagnostico atual (base tecnica)
1. Fluxo de UI ativo do gerador:
   - `src/components/solarzap/ProposalModal.tsx` -> `ProposalWizardModal`.
2. Campos `observacoes` e UI de IA hoje estao em:
   - `src/components/solarzap/proposal-wizard/steps/StepPersonalization.tsx`;
   - `src/hooks/useProposalForm.ts` (estado + payload de IA).
3. PDF final e renderizado em:
   - `src/utils/generateProposalPDF.ts` -> `src/utils/pdf/legacyRenderer.ts`.
4. Cards da pagina apos capa e bloco de pagamento hoje estao em `legacyRenderer.ts`.
5. `proposalRendererV2` atualmente delega para o renderer legacy (sem divergencia de output).

## 5) Premissas de execucao
1. O fluxo principal em producao e o wizard novo (`ProposalWizardModal`).
2. Para `usina`, a nomenclatura `SEM/COM ENERGIA SOLAR` pode nao representar a mesma semantica de economia de conta.
   - Premissa inicial de implementacao: aplicar esse layout novo para propostas nao-usina, preservando semantica de usina caso necessario para nao distorcer dados.
   - Se voce quiser, eu forco o mesmo layout tambem para usina.
3. Nao ha deploy Supabase previsto para este ajuste (somente frontend + renderer PDF).

## 6) Estrategia anti-regressao (cirurgica)
1. Trabalhar com whitelist de arquivos alteraveis:
   - `src/components/solarzap/proposal-wizard/steps/StepPersonalization.tsx`
   - `src/components/solarzap/proposal-wizard/WizardProgressBar.tsx` (somente label/UX)
   - `src/hooks/useProposalForm.ts` (somente campos de observacoes/IA do wizard)
   - `src/components/solarzap/SolarZapLayout.tsx` (apenas se tipagem exigir)
   - `src/utils/pdf/legacyRenderer.ts`
   - testes novos/ajustados em `tests/unit` e `tests/e2e` (somente se necessario)
2. Guard rails obrigatorios apos cada etapa:
   - revisar diff por arquivo;
   - confirmar que `src/hooks/useSolarResource.ts`, `src/utils/solarSizing.ts`, `src/utils/proposalFinancialModel.ts`, `src/utils/proposalCharts.ts` e `supabase/functions/solar-resource/*` nao foram tocados;
   - rodar smoke da etapa antes de seguir.
3. Se qualquer smoke falhar, bloquear avancar de etapa, corrigir e rerodar.

## 7) Plano detalhado por etapa (com smoke ao final de cada etapa)

### Etapa 0 - Baseline e congelamento
Acoes:
1. Capturar baseline de compilacao/testes para provar que regressao nao e pre-existente.
2. Confirmar flag de renderer e caminho ativo do wizard.

Smoke da etapa 0:
1. `npm run typecheck`
2. `npm run test:unit -- tests/unit/proposalCashDiscount.test.ts tests/unit/proposalFinancialModel.test.ts tests/unit/useSolarResource.test.ts tests/unit/solarSizing.test.ts`

Criterio de saida:
1. Baseline verde ou, se houver falha pre-existente, falha documentada antes de editar codigo.

### Etapa 1 - Remocao da personalizacao com IA no wizard
Acoes:
1. Remover do passo de personalizacao:
   - botao `Personalizar com IA`;
   - bloco visual de IA/preview de headline.
2. Manter apenas dados de assinatura nesse passo (renomear titulo para `Assinatura`, se aplicavel).
3. Ajustar `WizardProgressBar` para refletir o novo conteudo do passo sem alterar navegacao.

Smoke da etapa 1:
1. `npm run typecheck`
2. `npm run test:unit -- tests/unit/text_encoding_guard.test.ts`

Criterio de saida:
1. Wizard abre, navega e gera proposta sem qualquer CTA de IA.

### Etapa 2 - Remocao de `observacoes` do fluxo de geracao
Acoes:
1. Remover campo `observacoes` da UI do wizard.
2. Remover `observacoes` dos payloads do fluxo de proposta (front), incluindo save/contexto de proposta quando aplicavel.
3. Garantir que ausencia de observacoes nao quebre:
   - geracao do PDF;
   - persistencia da proposta;
   - roteiros do vendedor.

Smoke da etapa 2:
1. `npm run typecheck`
2. `npm run test:unit -- tests/unit/proposalCashDiscount.test.ts tests/unit/proposalFinancialModel.test.ts tests/unit/useSolarResource.test.ts`
3. `npx playwright test tests/e2e/proposal-smoke.spec.ts --reporter=line`

Criterio de saida:
1. Proposta e gerada de ponta a ponta sem campo de observacoes no fluxo.

### Etapa 3 - Reordenacao dos 3 cards da pagina apos capa
Acoes:
1. Em `legacyRenderer.ts`, ajustar o array de metricas para refletir:
   - `SEM ENERGIA SOLAR` = valor mensal sem sistema (`R$X,00 / mes`) com destaque em vermelho;
   - `COM ENERGIA SOLAR` = valor mensal com sistema (`R$X,00 / mes`);
   - `ECONOMIA MENSAL ESTIMADA` = economia mensal (`R$X,00 / mes`).
2. Remover `PAYBACK ESTIMADO` desse trio.
3. Garantir consistencia visual (cores, espacos e overflow).

Smoke da etapa 3:
1. `npm run typecheck`
2. `npm run test:unit -- tests/unit/proposalFinancialModel.test.ts tests/unit/proposalCharts_monthlyGeneration.test.ts tests/unit/useSolarResource.test.ts`
3. `npx playwright test tests/e2e/proposal-templates.spec.ts --reporter=line`

Criterio de saida:
1. Cards exibem exatamente os 3 campos solicitados, sem quebrar layout.

### Etapa 4 - Mover condicoes de pagamento para a ultima pagina e enriquecer valores
Acoes:
1. Remover da pagina financeira intermediaria (page 4) o bloco de `Condicoes de Pagamento` e `Condicoes de Financiamento`.
2. Inserir bloco equivalente na ultima pagina (page 5), imediatamente antes do bloco de assinatura, contendo:
   - valor cheio da proposta;
   - valor a vista com desconto no formato `R$X,00 (Y% de desconto)`;
   - condicoes de pagamento selecionadas;
   - parcelas de financiamento (instituicao, taxa, carencia, parcelas), quando houver simulacao aplicavel.
3. Remover definitivamente secao `Observacoes` do PDF final.
4. Garantir quebra de pagina segura para assinatura (sem sobreposicao).

Smoke da etapa 4:
1. `npm run typecheck`
2. `npm run test:unit -- tests/unit/proposalCashDiscount.test.ts tests/unit/proposalFinancialModel.test.ts tests/unit/useSolarResource.test.ts`
3. `npx playwright test tests/e2e/proposal-smoke.spec.ts --reporter=line`

Criterio de saida:
1. Ultima pagina contem condicoes + assinatura;
2. Page 4 nao contem mais esse bloco;
3. PDF renderiza sem truncamentos.

### Etapa 5 - Cobertura adicional de regressao (se necessario)
Acoes:
1. Adicionar/ajustar testes unitarios para garantir formato da informacao de desconto no bloco final (quando desconto > 0).
2. Ajustar E2E somente se fluxo de passos mudar visualmente (sem ampliar escopo funcional).

Smoke da etapa 5:
1. `npm run typecheck`
2. `npm run test:unit`

Criterio de saida:
1. Cobertura minima para os novos comportamentos de pagamento/desconto.

## 8) Bateria final obrigatoria (go/no-go de producao)
Executar ao final da implementacao completa:
1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm run test:unit`
5. `npx playwright test tests/e2e/proposal-smoke.spec.ts --reporter=line`
6. `npx playwright test tests/e2e/proposal-templates.spec.ts --reporter=line`
7. (blindagem irradiancia) `npm run test:unit -- tests/unit/useSolarResource.test.ts tests/unit/solarSizing.test.ts tests/unit/proposalFinancialModel.test.ts tests/unit/proposalCharts_monthlyGeneration.test.ts`

Regra de qualidade:
1. Se qualquer teste falhar, corrigir causa raiz e rerodar:
   - smoke da etapa afetada;
   - bateria final completa.

## 9) Validacao manual final (checklist curto)
1. Wizard nao mostra `Observacoes da proposta`.
2. Wizard nao mostra `Personalizar com IA`.
3. PDF: pagina apos capa com `SEM ENERGIA SOLAR | COM ENERGIA SOLAR | ECONOMIA MENSAL ESTIMADA`.
4. PDF: bloco de pagamento somente na ultima pagina, junto da assinatura.
5. PDF: desconto aparece no texto de valor a vista com percentual.
6. PDF: quando houver financiamento, parcelas aparecem no bloco final.
7. Fluxo de geracao continua exigindo PVGIS e coordenadas (sem regressao).

## 10) Supabase / deploy
1. Nao ha alteracao prevista de migration/schema/edge function para este pacote.
2. Portanto, nao ha deploy de Supabase planejado nesta entrega.
3. Se durante a execucao surgir necessidade real de backend, isso sera separado como mudanca adicional e executado apenas no final, apos sua aprovacao.
