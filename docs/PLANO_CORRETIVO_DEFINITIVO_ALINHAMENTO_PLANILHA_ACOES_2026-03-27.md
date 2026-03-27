# PLANO CORRETIVO DEFINITIVO - ALINHAMENTO PLANILHA DE ACOES (CONVERSAS)

Data: 2026-03-27  
Status: Aprovacao pendente  
Escopo: Conversas (modo planilha de acoes), barra de Proxima Acao, sincronizacao com calendario e lead_tasks  
Objetivo: eliminar desalinhamento visual, remover reset de campos, garantir consistencia funcional e finalizar rollout sem regressao

---

## 1) Contexto do problema

A implementacao atual da planilha lateral ficou funcional em partes, mas instavel na experiencia final. Os sintomas reportados:

1. Linhas do painel de leads e da planilha nao batem em diferentes telas/zooms.
2. Cabecalho visualmente desalinhado com a grade.
3. Campos resetando durante edicao (draft perdido ao atualizar dados).
4. Falhas intermitentes de salvamento e divergencia entre Conversas, barra superior e Calendario.
5. Evento vencido permanecendo em "Proxima Acao" quando deveria migrar para "Ultima Acao".

---

## 2) Causa raiz (diagnostico tecnico)

1. Arquitetura com **dois scroll containers independentes** (lista e grade) e sincronizacao por `scrollTop`.
2. Diferencas acumulativas de altura por linha (borda, line-height, input/select nativo, padding, zoom, escala do SO).
3. Cabecalhos em contextos distintos (`sticky` separado), com offsets proprios.
4. Re-hidratacao de drafts em momentos errados, causando perda de edicao local.
5. Invalidao/revalidacao de queries sem contrato unico de sincronizacao entre agenda e next_action.

Conclusao: ajustes de CSS pontuais mitigam, mas nao resolvem definitivamente.

---

## 3) Arquitetura alvo (definitiva)

### 3.1 Modelo de layout unico

Implementar um **workspace unico** com:

1. Um unico container de scroll vertical.
2. Uma unica grade por linha contendo:
   - Coluna 1: Lead (nome + telefone, sem ruido visual extra no modo planilha).
   - Colunas 2..N: Ultima Acao, Proxima Acao, Tipo, Data/Hora, Duracao, Responsavel, Local, Etapa, Salvar.
3. Um unico cabecalho no mesmo contexto de layout das linhas.

### 3.2 Regra de responsividade

1. Largura fixa reduzida para coluna de leads no modo planilha.
2. Grid com `minmax` por coluna e largura minima controlada.
3. Overflow horizontal apenas na grade (nunca quebrar estrutura vertical).

### 3.3 Contrato de dados e estado

1. Draft local por `leadId` com lock anti-sync enquanto usuario edita/salva.
2. Salvar linha deve atualizar:
   - appointment (calendario),
   - next_action (lead_tasks),
   - barra superior "Proxima Acao",
   - linha corrente da grade.
3. Item vencido sai de Proxima Acao e entra em Ultima Acao por regra de classificacao temporal.

---

## 4) UX/UI definitiva (regras objetivas)

1. Modo planilha deve simplificar lista de leads para: nome + telefone.
2. Nenhum elemento decorativo extra na coluna de leads durante modo planilha.
3. Alturas padronizadas por token unico:
   - `--actions-header-h`
   - `--actions-row-h`
   - `--actions-cell-py`
4. Inputs/selects com altura uniforme e tipografia uniforme.
5. Coluna `Data/Hora` com largura suficiente para valor completo, sem corte.
6. Abrir modo planilha deve desabilitar resize manual da lateral.
7. Botao "Acoes" no topo esquerdo deve abrir/fechar com transicao limpa e previsivel.

---

## 5) Plano de execucao por fases

## Fase 0 - Freeze e seguranca

1. Congelar novas alteracoes desta feature ate fechamento.
2. Criar branch de correcao definitiva.
3. Definir checklist de aceite obrigatoria antes de novo deploy.

Entregavel: branch isolada + checklist assinada.

## Fase 1 - Refactor estrutural do layout

1. Extrair componente `ConversationActionsWorkspace` (layout unico).
2. Migrar render de leads e grade para o mesmo container de scroll.
3. Remover sincronizacao manual de scroll entre componentes.
4. Unificar cabecalho com a mesma malha da grade.

Entregavel: alinhamento estavel em 100% das linhas com zoom 100%.

## Fase 2 - Estado e persistencia sem reset

1. Revisar ciclo de vida dos drafts (`isDirty`, `isSaving`, `syncLockUntil`).
2. Bloquear sobrescrita de draft local durante digitacao/salvamento.
3. Garantir patch otimista seguro e rollback em erro.

Entregavel: zero reset inesperado durante edicao.

## Fase 3 - Sincronizacao funcional completa

1. Salvar linha cria/atualiza agendamento e vincula task corretamente.
2. Invalida queries em cadeia unica (appointments + lead_tasks + barra).
3. Regra temporal oficial:
   - open + due futuro = Proxima Acao
   - open + due vencido = Ultima Acao
   - done = Ultima Acao

Entregavel: calendario, barra e planilha refletindo o mesmo estado.

## Fase 4 - Polimento de UX

1. Modal de texto para Proxima Acao e Local (cancelar/salvar).
2. Estados de loading/saving claros por linha.
3. Ajustes finos de densidade visual para notebook e desktop.

Entregavel: leitura limpa e preenchimento rapido.

## Fase 5 - QA, homologacao e rollout

1. Testes manuais guiados (matriz abaixo).
2. Testes automatizados de regressao visual e funcional.
3. Deploy controlado com rollback pronto.

Entregavel: liberacao para producao com evidencias.

---

## 6) Matriz de testes obrigatoria

## 6.1 Visual/alinhamento

1. Resolucao 1366x768, zoom 100%.
2. Resolucao 1536x864, zoom 100%.
3. Resolucao 1920x1080, zoom 100%.
4. Lista com 200+ leads (scroll longo).
5. Validar header + todas as linhas sem drift.

## 6.2 Funcional

1. Editar Proxima Acao, Tipo, Data/Hora, Duracao, Responsavel, Local.
2. Salvar com sucesso e refletir no calendario.
3. Confirmar barra superior atualizada apos salvar.
4. Criar evento para horario futuro e validar status.
5. Simular vencimento e validar migracao para Ultima Acao.

## 6.3 Resiliencia

1. Erro de rede no salvar (toast + manter draft).
2. Conflito de atualizacao (nao perder edicao local).
3. Troca de conversa durante edicao (estado preservado).

## 6.4 Regressao

1. Conversas sem modo planilha continuam normais.
2. Calendario sem quebra de criar/editar/arquivar evento.
3. Dashboard sem impacto colateral.

---

## 7) Criterios de aceite (Definition of Done)

1. Alinhamento perfeito de header e linhas em 3 resolucoes-alvo.
2. Nenhum reset de campo durante edicao normal.
3. Salvar linha atualiza calendario + barra + linha sem divergencia.
4. Evento vencido nao permanece em Proxima Acao.
5. Sem erro em console durante fluxo principal.
6. Build e typecheck verdes.
7. Deploy validado em producao com smoke test.

---

## 8) Risco, rollback e operacao

## Riscos principais

1. Refactor estrutural afetar fluxo de conversa atual.
2. Divergencia de estado entre otimista e re-fetch.

## Mitigacao

1. Branch isolada + testes de regressao.
2. Feature flag interna para fallback rapido.
3. Rollback por imagem/tag anterior no Portainer.

## Plano de rollback

1. Reverter service image para ultima tag estavel.
2. Invalidar cache do frontend.
3. Reexecutar smoke de Conversas e Calendario.

---

## 9) Sequencia de implementacao recomendada (ordem exata)

1. Fase 0
2. Fase 1
3. Fase 2
4. Fase 3
5. Fase 4
6. Fase 5

Nao pular fases. Nao fazer deploy parcial sem passar pelo bloco de testes.

---

## 10) Resultado esperado

Ao final, a planilha de acoes passa a ser um workspace unico, estavel e vendavel:

1. visual consistente;
2. preenchimento rapido;
3. dados confiaveis;
4. sem comportamento aleatorio;
5. sem regressao nas demais areas.

