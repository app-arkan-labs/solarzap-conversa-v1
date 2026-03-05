# Google Ads OAuth Migration

## Inventario de arquivos

### Criados
- `src/pages/PrivacyPolicy.tsx`
- `src/pages/TermsOfService.tsx`
- `supabase/migrations/20260305000000_google_ads_oauth_fields.sql`
- `supabase/functions/google-ads-oauth/index.ts`
- `supabase/functions/google-ads-callback/index.ts`
- `tests/unit/googleAdsOAuthState.test.ts`
- `tests/unit/googleAdsApiHelpers.test.ts`
- `docs/GOOGLE_ADS_OAUTH_MIGRATION.md`
- `docs/GOOGLE_ADS_OAUTH_SETUP_REPORT.md`

### Modificados
- `src/App.tsx`
- `src/components/solarzap/TrackingView.tsx`
- `supabase/functions/tracking-credentials/index.ts`
- `supabase/functions/conversion-dispatcher/index.ts`

## Fluxo OAuth

1. Usuario clica em **Conectar Google Ads** no card de Tracking.
2. Frontend chama `google-ads-oauth` com `org_id`.
3. `google-ads-oauth` valida JWT, valida membership em `organization_members` e retorna `authUrl`.
4. Usuario autentica e concede permissao no Google.
5. Google redireciona para `google-ads-callback` com `code` e `state`.
6. Callback troca `code` por tokens no endpoint OAuth do Google.
7. `refresh_token` e salvo no Vault (`vault.secrets`).
8. `ad_platform_credentials` e atualizado com `google_refresh_token_vault_id`, `google_ads_connected_at` e `google_ads_account_email`.
9. Frontend recebe `?google_ads_status=success`, recarrega painel e habilita selecao de MCC/Conta/Conversao.

## Fallback legado

- O card principal de Google Ads agora usa OAuth.
- Se houver configuracao manual antiga no form (campos legados), a UI exibe um bloco **Configuracao manual (legado)** colapsado.
- Esse fallback preserva `savePlatform('google_ads')` e `testPlatform('google_ads')` para compatibilidade temporaria.

## Plano de corte (90 dias)

1. Medir adocao do OAuth por organizacao.
2. Congelar criacao de novas configuracoes manuais.
3. Migrar contas restantes para OAuth com checklist de suporte.
4. Remover campos legados da UI principal.
5. Remover gravação de `google_client_secret_vault_id` e `google_developer_token_vault_id` por organizacao (manter apenas env global).
6. Limpar codigo legado em `TrackingView` e `tracking-credentials`.

## Diagrama

```text
User
  -> Button (TrackingView)
  -> Edge Function: google-ads-oauth
  -> Google OAuth Consent
  -> Edge Function: google-ads-callback
  -> Vault (refresh token)
  -> ad_platform_credentials (DB)
```
