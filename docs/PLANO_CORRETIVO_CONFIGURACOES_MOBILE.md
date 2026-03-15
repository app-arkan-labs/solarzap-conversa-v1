# Plano Corretivo — Responsividade das Abas de Configurações (Mobile)

> **Data:** 15/03/2026  
> **Contexto:** As telas principais (Chat, Pipeline, Contatos, Calendário, Dashboard, Tracking, Broadcast, Propostas) já foram corrigidas no commit `b49d69c`. As abas de Configurações (acessadas pelo ícone ⚙️ na sidebar) continuam com problemas graves de responsividade em telas < 430px.

---

## Diagnóstico Geral

Todas as abas de configurações sofrem dos mesmos problemas-raiz:

1. **PageHeader sem `mobileToolbar`**: Nenhuma aba de configurações usa a prop `mobileToolbar`. No mobile, o `actionContent` é suprimido (retorna `null`), então botões importantes desaparecem ou o header mostra apenas o título sem ações.
2. **Padding excessivo**: Containers com `p-6` a `p-8` desperdiçam espaço em telas de 375px.
3. **Card headers com `flex-row` rígidos**: ícone 48×48 + texto + badges + botões na mesma linha não cabem em 375px.
4. **Grids não-responsivos**: `grid-cols-2` e `md:grid-cols-12` sem fallback para mobile.
5. **WhatsApp card header overflow**: Botões "Testar API" + "Nova Instância" ao lado do título+badge extrapolam a largura.

---

## Inventário de Telas Afetadas

| # | Componente | Arquivo | Problemas Principais |
|---|-----------|---------|---------------------|
| 1 | **IA (Agentes)** | `src/components/solarzap/AIAgentsView.tsx` | Header com 2 botões (Comprar créditos + Badge/Switch) some no mobile; card de instâncias com botão "Religar todos" truncado |
| 2 | **Automações** | `src/components/solarzap/AutomationsView.tsx` | Header com counter + botão "Restaurar Padrão" some; cards internas com ícone 48px + título longo + switch overflow |
| 3 | **Central de Integrações** | `src/components/solarzap/IntegrationsView.tsx` | Header com counter + ícone some; card WhatsApp header com ícone 48px + título + badge + botão Atualizar não cabe; form "Nova Instância" com `flex-row` sem wrap |
| 4 | **Minha Empresa** | `src/components/solarzap/KnowledgeBaseView.tsx` | Header com botão "Importar Documento" some; container principal com `p-6` hardcoded |
| 5 | **Meu Plano** | `src/components/solarzap/MeuPlanoView.tsx` | Header sem ações (ok), mas hero card com `px-6 pt-8 pb-6 sm:px-8` excessivo; ícone 56px; `text-2xl` no nome do plano |
| 6 | **Minha Conta** | `src/components/solarzap/ConfiguracoesContaView.tsx` | Header ok (sem ações), mas avatar 96px muito grande no mobile; padding `p-4 sm:p-6` ok |
| 7 | **Gestão de Equipe** | `src/pages/AdminMembersPage.tsx` | Header com botão "Atualizar" + "Voltar" some no mobile; form de convite com `md:grid-cols-12` ok mas padding `p-4 md:p-8` ok |
| 8 | **Notificações** | `src/components/solarzap/NotificationSettingsCard.tsx` | Card header com ícone 48px + texto longo não cabe; `AutomationCard` interna com ícone 40px + texto + badge + switch overflow |
| 9 | **WhatsApp Manager** | `src/components/solarzap/WhatsAppInstancesManager.tsx` | Card header com ícone 56px + título + 2 badges + 2 botões absoluto overflow; botões "Testar API" e "Nova Instância" somem em mobile |

---

## Plano de Correção por Arquivo

### 1. AIAgentsView.tsx (Prioridade: ALTA)

**Linha ~796: PageHeader**
- **Problema**: `actionContent` com 2 elementos ("Comprar créditos" + badge/switch container) desaparece no mobile.
- **Correção**: Adicionar `mobileToolbar` com:
  - Badge compacto (ATIVO/PAUSADO) + Switch ao lado
  - Botão "Créditos IA" ícone-only

**Linha ~833: Settings Grid**
- `grid grid-cols-1 md:grid-cols-2` — OK, responsivo.

**Linha ~870: WhatsApp instance rows**
- **Problema**: Botão "Religar todos" com texto + ícone longo em `flex-row` pode truncar.
- **Correção**: Já usa `flex-col gap-2 sm:flex-row` — revisar se cabe em 375px, possivelmente reduzir padding.

---

### 2. AutomationsView.tsx (Prioridade: ALTA)

**Linha ~208: PageHeader**
- **Problema**: `actionContent` com counter (X/6) + botão "Restaurar Padrão" dentro de container `rounded-xl border px-4 py-2`. Some no mobile.
- **Correção**: Adicionar `mobileToolbar` com:
  - Badge com "X/6 ativas" inline
  - Botão "Restaurar" ícone-only (RotateCcw)

**Linha ~240-270: "Ignorar Retrocessos" card**
- **Problema**: `flex items-center justify-between` com ícone 48px + div com `text-lg` título + Badge + descrição + Switch. Em 375px o texto sobrepõe o Switch.
- **Correção**: No mobile, mudar para `flex-col` com switch abaixo do texto, ou reduzir ícone para 36px e título para `text-base`.

**Linha ~305: AutomationCard reutilizável**
- **Problema**: `flex items-center justify-between` com ícone 40px + div (título + badge + descrição) + Switch. Em 375px pode overflow.
- **Correção**: Adicionar `flex-wrap` e no mobile empurrar o switch para linha seguinte, ou reduzir ícone para 32px.

**Linha ~337: Messages section card header**
- **Problema**: `flex items-center justify-between` com ícone 48px + título "Mensagens Pré-Configuradas" + botão que não cabe em mobile.
- **Correção**: Card header com `flex-wrap` + botão Expandir/Recolher em segunda linha no mobile.

---

### 3. IntegrationsView.tsx (Prioridade: ALTA)

**Linha ~152: PageHeader**
- **Problema**: `actionContent` com counter (X/Y instâncias) + ícone CheckCircle some no mobile.
- **Correção**: Adicionar `mobileToolbar` com badge compacto "X ativas".

**Linha ~185: WhatsApp card header**
- **Problema**: `flex flex-wrap items-center justify-between gap-3` com ícone 48px + título "Conexões WhatsApp" + descrição + botão "Atualizar". Em mobile, o ícone + texto + botão ficam apertados.
- **Correção**: ícone menor (36px) ou remover no mobile; botão compacto.

**Linha ~205: "Nova Instância" form**  
- Já usa `flex-col gap-3 sm:flex-row` — OK.

**Linha ~250: QR Code modal inline**
- **Problema**: `flex-col md:flex-row` com QR `max-w-[280px]` — OK em mobile.

**Linha ~300: Instance cards**
- Já usa `flex-col gap-4 md:flex-row` — OK.

---

### 4. KnowledgeBaseView.tsx (Prioridade: MÉDIA)

**Linha ~273: PageHeader**
- **Problema**: `actionContent` com botão "Importar Documento" some no mobile.
- **Correção**: Adicionar `mobileToolbar` com botão compacto `<FileUp />` ícone-only.

**Linha ~290: Container principal**
- **Problema**: `p-6` hardcoded sem responsive.
- **Correção**: Mudar para `p-4 sm:p-6`.

---

### 5. MeuPlanoView.tsx (Prioridade: MÉDIA)

**Linha ~229: PageHeader**
- Sem `actionContent` — PageHeader já é compacto no mobile. ✅

**Linha ~240: Hero card**
- **Problema**: `px-6 pt-8 pb-6 sm:px-8` — padding excessivo no mobile.
- **Correção**: Mudar para `px-4 pt-5 pb-4 sm:px-8 sm:pt-8 sm:pb-6`.
- **Problema**: ícone `h-14 w-14` grande.
- **Correção**: Mudar para `h-11 w-11 sm:h-14 sm:w-14`.
- **Problema**: `text-2xl` para nome do plano.
- **Correção**: Mudar para `text-xl sm:text-2xl`.

---

### 6. ConfiguracoesContaView.tsx (Prioridade: BAIXA)

**Linha ~175: PageHeader**
- Sem `actionContent` — OK. ✅

**Linha ~198: Avatar**
- **Problema**: `h-24 w-24` pode ser muito grande com o form ao lado.
- **Correção**: Mudar para `h-20 w-20 sm:h-24 sm:w-24`.

**Geral**: O layout já usa `flex-col gap-3 sm:flex-row` — razoavelmente OK.

---

### 7. AdminMembersPage.tsx (Prioridade: MÉDIA)

**Linha ~321: PageHeader**
- **Problema**: `actionContent` com botão "Atualizar" + "Voltar" some no mobile.
- **Correção**: Adicionar `mobileToolbar` com botão "Atualizar" ícone-only (RefreshCw).

**Linha ~350: Form de convite**
- `grid gap-4 md:grid-cols-12` — em mobile é `grid-cols-1`, OK.

---

### 8. NotificationSettingsCard.tsx (Prioridade: MÉDIA)

**Não usa PageHeader** (é um componente Card autônomo renderizado dentro de ConfiguracoesContaView ou IntegrationsView).

**Linha ~160: Card header**
- **Problema**: `flex items-center gap-4` com ícone 48px + div (título `text-xl` + descrição). Em 375px o título pode quebrar deselegantemente.
- **Correção**: Reduzir ícone para 36px e título para `text-lg` em mobile.

**Linha ~175+: AutomationCard internas**
- Mesmo problema do AutomationsView: ícone 40px + texto + switch em `flex-row`.
- **Correção**: Mesmo fix — `flex-wrap` ou `flex-col` em mobile.

---

### 9. WhatsAppInstancesManager.tsx (Prioridade: ALTA)

**Nota**: Este componente é usado no IntegrationsView como sub-componente. Pode coexistir com o manager do IntegrationsView.

**Linha ~250: Card header**  
- **Problema CRÍTICO**: `flex items-start justify-between` com:
  - Esquerda: ícone WhatsApp 56px + título + 2 badges (conectado + modo demonstração) + descrição
  - Direita: Botão "Testar API" + Botão "Nova Instância"
  - Em 375px, os botões ficam embaixo do título mas os 2 botões + 2 badges não cabem.
- **Correção**:
  - Mobile: ícone menor (40px), badges em row abaixo do título, botões em row separada full-width, ou stack vertical.
  - Adicionar `flex-wrap` e `w-full` nos buttons no mobile.

---

## Resumo de Ações

| Ação | Arquivos | Tipo |
|------|----------|------|
| Adicionar `mobileToolbar` ao PageHeader | AIAgentsView, AutomationsView, IntegrationsView, KnowledgeBaseView, AdminMembersPage | Prop nova |
| Reduzir padding hero cards no mobile | MeuPlanoView | Tailwind responsive |
| Fix card headers com overflow | AutomationsView, IntegrationsView, WhatsAppInstancesManager, NotificationSettingsCard | `flex-wrap` / `flex-col` |
| Reduzir ícones de card header no mobile | AutomationsView, IntegrationsView, NotificationSettingsCard, WhatsAppInstancesManager | Tailwind responsive |
| Reduzir avatar | ConfiguracoesContaView | Tailwind responsive |
| Fix container padding | KnowledgeBaseView | `p-4 sm:p-6` |

**Total de arquivos a modificar:** 9  
**Componentes novos:** 0  
**Estimativa de LOC alteradas:** ~250 linhas

---

## Ordem de Execução Recomendada

1. **Batch 1 (Alto impacto, PageHeaders)**: AIAgentsView, AutomationsView, IntegrationsView, KnowledgeBaseView, AdminMembersPage — adicionar `mobileToolbar`
2. **Batch 2 (Card overflow fixes)**: WhatsAppInstancesManager header, AutomationsView cards internas, NotificationSettingsCard cards
3. **Batch 3 (Polish)**: MeuPlanoView hero padding, ConfiguracoesContaView avatar, KnowledgeBaseView container padding
