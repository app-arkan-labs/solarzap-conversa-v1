# 📋 AJUSTES DE SEGURANÇA - PLANO DE RECUPERAÇÃO P0/P1/P2

**Versão:** 1.1  
**Data:** 21 de Fevereiro de 2026  
**Status:** Ajustes de Segurança em Aplicação

---

## ✅ AJUSTES JÁ REALIZADOS NO PLANO PRINCIPAL

### 1. ✅ Migration Auto-Apply Removido (P0.3)
**Antes:**
```bash
# Se NÃO foi applied, rodar:
supabase db push
```

**Depois:**
```bash
# ❌ NÃO RORAR AUTOMATICAMENTE: supabase db push
# ⚠️ SE NÃO APLICADA: Criar subplano separado com:
#    1) Backup RDS completo
#    2) Aplicar migration em STAGING primeiro
#    3) Testar 24h
#    4) Rollback playbook documentado
#    5) Aprovação manual antes de PRODUÇÃO
```

**Motivo:** Migrations nunca devem ser auto-deployadas em plano executável.

---

## ⚠️ AJUSTES PENDENTES NO ARQUIVO PRINCIPAL

### 2. **PENDENTE:** Smoke Tests URLs Hardcodeadas → {{STAGING_URL}}

**Arquivo:** `PLANO_RECUPERACAO_P0_P1_P2.md`

**Seções a Ajustar:**

#### P0.1 - Smoke Tests Backend (linhas ~310-335)
**Encontrar:**
```bash
curl -X POST https://app.solarzap.com/functions/v1/evolution-proxy/instance/fetchInstances \
```

**Substituir por:**
```bash
curl -X POST {{STAGING_URL}}/functions/v1/evolution-proxy/instance/fetchInstances \
```

**Todas as references a:**
- `https://app.solarzap.com` → `{{STAGING_URL}}`
- `--project-ref` → `--project-ref {{PROJECT_REF_STAGING}}`

---

### 3. **PENDENTE:** Webhook Secret Validation - Query Param → Header Only (P0.2)

**Arquivo:** `PLANO_RECUPERACAO_P0_P1_P2.md`

**Seção:** P0.2 AC2 (linhas ~370)

**Encontrar:**
```
- ✅ AC2: Valida secret (header `x-arkan-webhook-secret` OU query param)
```

**Substituir por:**
```
- ✅ AC2: Valida secret **SOMENTE via header** `x-arkan-webhook-secret` (em PRODUÇÃO)
- ✅ AC2b: Query param apenas em DEV (se necessário para testes locais com flag)
```

---

### 4. **PENDENTE:** Evolution-proxy Architecture - org_id from JWT Only (P0.1)

**Arquivo:** `PLANO_RECUPERACAO_P0_P1_P2.md`

**Seção:** P0.1 "Arquivos a Tocar" (linhas ~250-280)

**Encontrar:**
```typescript
3. `supabase/functions/evolution-proxy/index.ts`
   - ✅ Verificado: já existe e valida JWT
   - AJUSTAR: `org_id` pode aceitar do body
   - Validar: instância pertence à org
```

**Substituir por:**
```typescript
3. `supabase/functions/evolution-proxy/index.ts`
   - ✅ Verificado: já existe e valida JWT
   - AJUSTAR: `org_id` **NUNCA** aceitar do body
   - OBRIGATÓRIO: derivar `org_id` do claim JWT (`sub` + lookup na tabela `org_members`)
   - Validar: instância pertence à org do token (cross-org guard)
   - Rejeitar com 403 se mismatch
```

---

### 5. **PENDENTE:** Feature Flags Default OFF (P1.1, P1.2, P1.3)

**Arquivo:**`PLANO_RECUPERACAO_P0_P1_P2.md`

**Seções a Ajustar:**

#### P1.1 AC7 (Visit Modal)
**Encontrar:**
```
- ✅ AC7: Feature flag (se necessário) — default ON
```

**Substituir por:**
```
- ✅ AC1: Modal **default OFF** via feature-flag
- ✅ AC8: Feature flag pode ser ativado por org (admin toggle ou code config per org_id)
```

#### P1.2 & P1.3 - Adicionar AC sobre defaults
Ambas faltam AC explícito de "default OFF". Recomendado adicionar em cada:
```
- AC for feature toggles: **TODOS default OFF** (nunca ON por padrão)
```

---

### 6. **JÁ PRESENTE:** Notification Event Sources Mapping (P1.3)

✅ **CONFIRMADO:** Seção "Event Sources Mapping" já está no arquivo (linhas ~820-834)

Inclui:
- Lead respondeu
- Proposta visualizada
- Proposta aceita
- Stage mudou
- Appointment próxima

**Status:** Completa e correta.

---

## 🔧 EXECUÇÃO RECOMENDADA

### Abordagem Manual (Segura)

1. Abrir `PLANO_RECUPERACAO_P0_P1_P2.md` em VS Code
2. Use Find & Replace (Ctrl+H ou Cmd+Option+F) para cada ajuste:
   - Find: `https://app.solarzap.com` → Replace: `{{STAGING_URL}}`
   - Find: `project-ref` standalone → Replace: `project-ref {{PROJECT_REF_STAGING}}`
   - Find: `default ON` (features) → Replace: `default OFF`
   - Find: `valida secret (header ... OU query param)` → Replace: (ver item 3 acima)
   - Find: "org_id pode aceitar do body" → Replace: "org_id **NUNCA** aceitar do body" (ver item 4)

### Automático (Via Tool)

Posso usar multi_replace_string_in_file novamente com contexto mais específico se precisar.

---

## ✅ VALIDAÇÃO PÓS-AJUSTE

Após fazer os ajustes, verificar:

1. **Arquivo modificado:**
   ```bash
   # No VS Code Terminal:
   grep -n "https://app.solarzap.com" PLANO_RECUPERACAO_P0_P1_P2.md
   # Esperado: 0 matches (nenhuma menção direta)
   
   grep -n "{{STAGING_URL}}" PLANO_RECUPERACAO_P0_P1_P2.md
   # Esperado: 5+ matches (em todos smoke tests)
   
   grep -n "default ON" PLANO_RECUPERACAO_P0_P1_P2.md
   # Esperado: 0 matches
   
   grep -n "default OFF" PLANO_RECUPERACAO_P0_P1_P2.md
   # Esperado: 3+ matches (em P1.1, P1.2, P1.3)
   ```

2. **Lógica de negócio:**
   - [ ] Nenhum auto-deploy em plan (só verificações)
   - [ ] org_id é derivado do JWT, nunca do body
   - [ ] Webhook secret é header-only em produção
   - [ ] Todos feature flags default OFF
   - [ ] Event sources mapeadas com clareza

---

## 📝 PRÓXIMOS PASSOS

Após ajustes de segurança serem aplicados:

1. ✅ Executar P0.1: Remover credenciais hardcoded Evolution
2. ✅ Validar build sem erros TypeScript
3. ✅ Aplicar commits em sequência (vide Sprint 0, Sprint 1... no plano)
4. ✅ Testar em staging com checklist de smoke tests
5. ✅ Aprovação manual antes de produção

---

## 🎯 SEGURANÇA: RESUMO

| Gap | Status | Correção |
|---|---|---|
| Auto-deploy migrations | ✅ AJUSTADO | Removido "supabase db push" automático |
| URLs hardcodeadas | ⏳ PENDENTE | Trocar por {{STAGING_URL}} |
| org_id da body | ⏳ PENDENTE | Documentar que deve vir do JWT |
| Query param secret | ⏳ PENDENTE | Restringir a header em produção |
| Feature flags ON | ⏳ PENDENTE | Mudar todos para OFF |
| Event sources | ✅ JÁ PRESENTE | Seção completa no arquivo |

---

**Aprovado para:**
- ✅ Execução de P0 após ajustes
- ✅ Staging validation (não produção direto)
- ✅ Rollback procedures in place
