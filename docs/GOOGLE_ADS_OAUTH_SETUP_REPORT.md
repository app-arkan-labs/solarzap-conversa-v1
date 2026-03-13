# Google Ads OAuth Setup Report

> Preencha este relatorio apos concluir o setup no Google Cloud Console.

## 1. Projeto GCP

- Project Name:
- Project ID:
- Organization/Folder:
- Ambiente: (Testing / Production)

## 2. OAuth Client

- Client Type: Web application
- OAuth Client ID (sem secret):
- Consent Screen User Type: (Internal / External)
- App name exibido ao usuario:
- Support email:

## 3. URIs configuradas

### Authorized JavaScript origins
- `http://localhost:5173`
- `https://solarzap.com.br`
- `https://app.solarzap.com.br`
- `https://crm.solarzap.com.br`
- `https://solarzap.arkanlabs.com.br`

### Authorized redirect URIs
- `https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/google-ads-callback`

## 4. Operacao em dev vs prod

- Dev: iniciar OAuth do frontend local (`http://localhost:5173`) e confirmar retorno com `google_ads_status=success`.
- Prod: iniciar OAuth apenas pelos dominios oficiais, com consent screen e branding revisados.
- Segredos: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN` no ambiente Supabase.

## 5. Verificacao OAuth (saida de Testing)

- Confirmar dominios e politica de privacidade/termos publicados.
- Preparar demonstracao de uso do escopo `https://www.googleapis.com/auth/adwords`.
- Submeter app para verificacao e acompanhar pendencias do Google.

## 6. Developer Token

- MCC ID associado:
- Status atual do token: (test / basic / standard)
- Formulario: https://support.google.com/google-ads/contact/developer_token
- Estrategia: operar em token de teste durante homologacao e solicitar upgrade apos validar fluxo em producao.

## 7. Limitacoes com token de teste

- Pode restringir contas acessiveis e operacoes de upload.
- Pode bloquear cenarios de producao com grande volume.
- Exige validacao adicional antes de escalar rollout.
