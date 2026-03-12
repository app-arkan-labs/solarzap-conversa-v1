# Plano de Execução One-Shot (Ancorado no `plan.md`, Stripe-first)

## Resumo
Executar integralmente o blueprint do `plan.md` em ondas com gate de qualidade por fase, sem avançar com pendência.  
Fluxo obrigatório por etapa: implementar -> testar alvo da etapa -> rodar regressão -> corrigir falhas -> retestar até ficar 100% verde -> só então avançar.  
Escopo fixo: Stripe apenas, AbacatePay fora.

## Implementação por Fase (espelho do blueprint do `plan.md`)
1. **Fase 0 — Modelo comercial + Stripe operacional**
- Fixar modelo comercial único: sem free tier, trial com cartão obrigatório, bootstrap em `pending_checkout`.
- Consolidar fluxo de billing ponta a ponta: `signup -> checkout -> trialing -> active -> past_due -> read_only -> blocked -> recovery`.
- Validar catálogo e mapeamento de `price_id` por plano, webhook idempotente, portal e timeline de eventos.
- Gate da fase: todos os cenários de billing em staging + 1 piloto live controlado concluído com evidência.

2. **Fase 1 — Bloqueios arquiteturais**
- Migrar disparos do client para worker backend com fila/claim/idempotência/retry/retomada.
- Transformar automações de `localStorage` em persistência por organização no backend (multiusuário consistente).
- Fechar KB documental fim a fim: upload -> `pending` -> ingestão -> `processing/ready/error` -> reprocessamento.
- Gate da fase: disparo continua com navegador fechado; automações sincronizam entre usuários; KB atualiza status corretamente em todo ciclo.

3. **Fase 2 — Segurança e hardening**
- Validar MFA sem exposição de segredo em claro (reveal explícito e cópia segura).
- Endurecer segredo de IA: remover dependência operacional de `openai_api_key` em tabela e padronizar segredo seguro por ambiente/Vault.
- Garantir fail-closed nas funções críticas: allowlist CORS, env obrigatória no startup, respostas sem vazamento excessivo.
- Gate da fase: testes de segurança/hardening verdes + revisão manual de rotas críticas.

4. **Fase 3 — Operação e confiabilidade**
- Implantar alertas mínimos: falha Stripe webhook, worker de disparos, WhatsApp desconectado, erro de IA anômalo.
- Consolidar runbooks operacionais (cobrança, webhook, disparo, IA sem chave, restore).
- Fechar política de backup/restore/retenção com teste real de restore.
- Gate da fase: alertas testados por injeção controlada de falha + restore validado.

5. **Fase 4 — UX comercial e performance**
- Responsividade mínima obrigatória: navegação, conversas, pipeline, calendário, propostas/modais críticos.
- Onboarding focado no primeiro valor (conectar WhatsApp, importar leads, configurar empresa, gerar 1ª proposta, ativar IA/automação).
- Performance: code splitting nas áreas pesadas e redução do custo de carregamento inicial.
- Gate da fase: smoke mobile aprovado + meta de performance acordada atingida em staging.

6. **Fase 5 — Qualidade e validação final**
- Adicionar/ajustar E2E faltantes de billing e worker de disparos.
- Executar matriz final completa em staging (unit, integração, E2E, smoke operacional).
- Executar piloto live controlado e validar monitoramento pós-liberação.
- Gate da fase: suíte final 100% verde e checklist final sem pendências abertas.

## Mudanças importantes em interfaces/APIs/tipos
- Fluxo de disparos deixa de ser executor no frontend e passa a ser orquestrado por backend worker; frontend vira controle/monitoramento.
- Configuração de automações passa a ser contrato persistido por organização (não mais estado local volátil).
- Pipeline KB passa a expor estados operacionais claros (`pending`, `processing`, `ready`, `error`) e ação de reprocessamento.
- Contrato de billing fica estritamente dirigido por Stripe e estados de acesso (`full`, `read_only`, `blocked`) sem ambiguidade de bootstrap.
- Fluxo de IA elimina dependência funcional de segredo em tabela operacional.

## Plano de testes (etapa por etapa, com loop de correção)
- Gate técnico padrão em **toda** fase: `typecheck`, `build`, suíte de testes, regressão alvo da fase.
- Se qualquer teste falhar: corrigir imediatamente dentro da fase, rerodar a mesma bateria, repetir até verde.
- Cenários obrigatórios: billing completo (incluindo `past_due/read_only/blocked`), disparos resilientes, automações multiusuário, KB ingestão completa, segurança de segredos, smoke mobile, smoke operacional.
- Staging obrigatório em todas as fases; fechamento final exige staging completo + piloto live controlado.

## Critério de aceite final (100% satisfatório)
- Todas as fases 0–5 concluídas com gates aprovados.
- Nenhuma regressão aberta em funcionalidades críticas.
- Monitoramento, alertas e runbooks operacionais ativos e testados.
- Piloto live Stripe concluído com sucesso e evidências registradas.
- Entrega final inclui relatório executivo de validação com evidências de testes e correções aplicadas.

## Assunções e defaults travados
- Fonte única do plano: `plan.md` ativo (sem usar outro blueprint).
- Billing provider: Stripe somente.
- Estratégia de validação final: staging completo + piloto live controlado.
- AbacatePay totalmente fora de escopo.
