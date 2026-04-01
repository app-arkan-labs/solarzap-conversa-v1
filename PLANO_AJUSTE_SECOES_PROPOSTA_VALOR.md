# Plano de Ajuste Cirúrgico — Seções "Quanto custa e quanto economiza" e "Objetivo do Projeto"

**Data:** 2026-03-31  
**Motivo:** Cliente relatou que informações financeiras detalhadas (preço, payback, ROI, valores em R$) nessas seções estão atrapalhando a negociação. O vendedor quer apresentar esses números pessoalmente.

---

## 1) Diagnóstico — O que existe hoje

### Seção "Quanto custa e quanto economiza" (PDF)
**Arquivo:** `src/utils/pdf/legacyRenderer.ts` (linhas ~1254–1272)

- **headline** (vem de `premium.headline`): mostra nome do cliente + economia/mês + retorno estimado com valores em R$.
- **narrative** (montada inline no renderer): mostra investimento total, economia mensal/anual em R$, payback em anos, economia acumulada em 25 anos em R$.

### Seção "Objetivo do Projeto" (PDF)
**Arquivo:** `src/utils/pdf/legacyRenderer.ts` (linhas ~1275–1283)

- Renderiza `premium.executiveSummary` que contém investimento em R$, economia anual em R$, payback e ROI%.

### Origem dos textos
**Arquivo:** `src/utils/proposalPersonalization.ts` (linhas ~365–382 na função `buildPremiumProposalContent`)

- `headline` é montado com `formatCurrency(monthlySavings)`, payback em anos.
- `summaryParts` (que vira `executiveSummary`) é montado com `formatCurrency(valorTotal)`, `formatCurrency(economiaAnual)`, payback e ROI%.

---

## 2) O que vai mudar

### 2a) `proposalPersonalization.ts` — `buildPremiumProposalContent()`

| Campo | Texto atual (exemplo) | Novo texto |
|---|---|---|
| `headline` (residencial) | `Wilson Casemiro: R$458,99/mês em economia com retorno estimado em 2,0 anos` | `{nome}: energia solar dimensionada sob medida para o seu perfil de consumo` |
| `headline` (usina) | `{nome}: R$X/mês em receita estimada com retorno em X anos` | `{nome}: projeto de geração estruturado para máximo aproveitamento da capacidade instalada` |
| `executiveSummary` parte 1 | já ok — `Projeto {tipo} desenhado para {promise}.` | **Manter sem alteração** |
| `executiveSummary` parte 2 (residencial) | `Investimento previsto de R$X, economia anual estimada de R$X e payback em aproximadamente X anos.` | `Este projeto foi dimensionado com base no seu consumo atual, garantindo o melhor aproveitamento da geração solar e a maior redução possível na sua conta de energia.` |
| `executiveSummary` parte 2 (usina) | `Investimento previsto de R$X, receita anual estimada de R$X e payback em aproximadamente X anos.` | `Este projeto foi estruturado para maximizar a capacidade de geração e o aproveitamento da infraestrutura disponível, com foco em eficiência de longo prazo.` |
| `executiveSummary` parte 3 (residencial) | `Na janela de 25 anos, o potencial acumulado de economia é de R$X (ROI estimado de X%).` | `Com vida útil de mais de 25 anos, o sistema oferece décadas de economia contínua e proteção contra reajustes na tarifa de energia.` |
| `executiveSummary` parte 3 (usina) | `Na janela de 25 anos, a receita acumulada estimada é de R$X (ROI estimado de X%).` | `Com vida útil de mais de 25 anos, o sistema oferece décadas de geração consistente e proteção contra variações do mercado de energia.` |

### 2b) `legacyRenderer.ts` — bloco "Quanto custa e quanto economiza"

| Trecho | Texto atual | Novo texto |
|---|---|---|
| `narrative` (residencial) | `R$X de investimento estimado para economizar cerca de R$X/mês (R$X/ano), com payback aproximado de X. Economia acumulada em 25 anos: R$X (simulação).` | `Sistema projetado para cobrir a maior parte do seu consumo mensal, reduzindo significativamente a conta de energia. A economia começa a partir do primeiro mês de operação e se acumula ao longo de mais de 25 anos de vida útil dos equipamentos.` |
| `narrative` (usina) | `R$X de investimento estimado para gerar receita de cerca de R$X/mês (R$X/ano), com payback aproximado de X. Receita acumulada em 25 anos: R$X (simulação).` | `Projeto dimensionado para otimizar a geração de energia com base na potência instalada e nas condições de irradiância do local. A geração estimada cobre todo o horizonte de operação com eficiência consistente ao longo dos anos.` |

---

## 3) Arquivos alterados (escopo fechado)

| # | Arquivo | Tipo de mudança |
|---|---|---|
| 1 | `src/utils/proposalPersonalization.ts` | Alterar `headline` e `summaryParts` dentro de `buildPremiumProposalContent()` |
| 2 | `src/utils/pdf/legacyRenderer.ts` | Alterar a construção da variável `narrative` |

**Total: 2 arquivos, ~15 linhas de código alteradas.**

---

## 4) O que NÃO será tocado (blindagem de regressão)

1. **Modelo financeiro** (`proposalFinancialModel.ts`) — nenhuma fórmula alterada.
2. **Cards de métricas** (SEM ENERGIA SOLAR / COM ENERGIA SOLAR / ECONOMIA MENSAL) — inalterados.
3. **Gráficos de economia e retorno** (página 2 do PDF) — inalterados.
4. **Tabela de premissas técnicas/financeiras** — inalterada.
5. **UI do wizard** (`ProposalWizardModal`, steps) — inalterada.
6. **Edge Functions / Supabase / migrations** — nada tocado.
7. **Pipeline de IA de conversa / WhatsApp / automações** — nada tocado.
8. **`proposalRendererV2.ts`** — delega para legacy, não precisa de alteração.
9. **Seção "Benefícios principais"**, **"Por que confiar"**, **BANT**, **visitSteps** — inalterados.
10. **Score de personalização** (`scorePremiumContent`) — não depende do texto do headline/summary, apenas da presença dos campos.

---

## 5) Validação pós-implementação

1. Gerar uma proposta residencial e verificar no PDF que:
   - Seção "Quanto custa e quanto economiza" não mostra R$, payback, ROI.
   - Seção "Objetivo do Projeto" não mostra R$, payback, ROI.
   - Headline não mostra valores.
   - Cards de métricas continuam mostrando valores normalmente.
   - Gráficos de economia na página 2 continuam intactos.
2. Gerar uma proposta tipo usina e repetir as mesmas verificações.
3. Verificar que o build compila sem erros (`tsc --noEmit`).

---

## 6) Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Texto genérico demais, perde impacto | Baixa | Texto foi escrito para agregar valor qualitativo (proteção tarifária, vida útil, dimensionamento sob medida) |
| RendererV2 diverge do legacy | Nula | V2 delega 100% para legacy hoje |
| AI override sobrescreve os textos | Baixa | O fallback local (`buildPremiumProposalContent`) é usado quando AI não retorna; se AI retornar, os textos AI já passam por `isSensibleAiText`. Se necessário ajustar prompt da AI futuramente, é escopo separado. |
