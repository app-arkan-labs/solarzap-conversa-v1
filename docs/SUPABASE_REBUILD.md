# Reconstrução do SolarZap no Supabase

A instalação parte de um projeto Supabase vazio com PostgreSQL 17. As migrations instalam o CRM, o CRM interno, as políticas de organização, o catálogo, os buckets e a publicação Realtime. Usuários anteriores, registros comerciais e arquivos de clientes exigem um backup da origem.

## Ambiente local

Com o Docker em execução no diretório do repositório, execute:

```powershell
npx supabase start
```

Use a URL da API e a chave pública exibidas por `npx supabase status` em `.env.rebuild.local`. Defina `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_DEV_ACCOUNT=false`. Inicie o frontend com `npm run dev -- --mode rebuild`.

Crie e confirme um usuário de teste pelo Auth local. O SolarZap cria a organização pelo fluxo de bootstrap após o login. O plano ilimitado pode ser atribuído à organização de teste no painel de administração ou por uma atualização de `organizations.plan` no banco local.

## Projeto hospedado

Crie um projeto exclusivo para o SolarZap e confira a referência no Dashboard. Use a referência do novo projeto nos comandos:

```powershell
npx supabase link --project-ref $solarzapRef
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy --project-ref $solarzapRef
```

As migrations são preparadas para instalação do zero. A migration histórica `20260218` passou a usar a versão `20260218000000` para executar antes dos backfills. Em um banco que já registrou a versão anterior, concilie o histórico antes de aplicar este conjunto.

Mantenha `public` e `internal_crm` entre os schemas expostos na Data API. Configure a URL pública do aplicativo e as URLs de retorno no Supabase Auth. Inclua os domínios do aplicativo no segredo `ALLOWED_ORIGINS` das Edge Functions. Use as chaves públicas desse projeto no build do frontend e mantenha chaves privilegiadas nos serviços de backend.

Os workers HTTP consultam o Vault do projeto. Defina `solarzap_functions_url` com a URL base terminada em `/functions/v1` e `solarzap_worker_bearer` com o JWT de serviço aceito pelos workers. O resolvedor de mídia do CRM interno consulta `internal_crm_media_resolver_bearer`. Sem os segredos de destino e autenticação, os jobs de banco seguem instalados e os workers HTTP aguardam configuração.

Cadastre credenciais válidas dos provedores no destino e atualize os callbacks externos para o novo projeto. Configure o Evolution para o WhatsApp e o DeepSeek para o agente de conversas. Google, Meta, Stripe e Resend exigem credenciais quando usados. A configuração OAuth em `public.provider_configs` é acessível pelo backend.

Valide com duas organizações de teste. Confira login, persistência de lead, conversa, proposta e agendamento, leitura dos buckets e isolamento entre as organizações. Faça a homologação dos provedores com credenciais e destinatários de teste.
