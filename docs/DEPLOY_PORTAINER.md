# Deploy no Portainer - SolarZap

Data: 2026-02-28

## 1) Pre-check rapido na VPS
- Portas `80` e `443` liberadas no firewall.
- Nenhum outro container escutando `80/443`.
- Docker endpoint do Portainer ativo.

## 2) DNS (obrigatorio antes do SSL)
Crie os registros `A` apontando para o IP publico da VPS:
- `solarzap.arkanlabs.com.br`
- `solarzap.com.br`

## 3) Criar stack no Portainer
No Portainer:
1. `Stacks` -> `Add stack`
2. `Name`: `solarzap`
3. Metodo recomendado: `Repository`
4. `Repository URL`: URL do seu repositorio
5. `Compose path`: `docker-compose.vps.yml`

## 4) Variaveis de ambiente da stack
No bloco `Environment variables` do Portainer, configure:
- `SOLARZAP_DOMAINS=solarzap.arkanlabs.com.br, solarzap.com.br`
- `CADDY_EMAIL=seu-email@dominio.com`
- `VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co`
- `VITE_SUPABASE_ANON_KEY=SEU_ANON_KEY`
- `VITE_GOOGLE_CLIENT_ID=` (se usar Google OAuth)
- `VITE_EVOLUTION_API_URL=https://evo.seudominio.com.br` (se usar integracao)

## 5) Deploy
Clique em `Deploy the stack`.

O container vai:
- buildar o app React (`npm run build`)
- subir Caddy com TLS automatico (Let's Encrypt)
- responder nos dois dominios

## 6) Validacao
No terminal da VPS ou no proprio host:
```bash
curl -I https://solarzap.arkanlabs.com.br
curl -I https://solarzap.com.br
```

Esperado: status `200` (ou `301/308` seguido de `200`).

## 7) Ajuste no Supabase Auth
No Supabase Dashboard (`Authentication -> URL Configuration`):
- `Site URL`: `https://solarzap.arkanlabs.com.br`
- `Redirect URLs`:
  - `https://solarzap.arkanlabs.com.br`
  - `https://solarzap.com.br`

## 8) Operacao e troubleshooting
- Ver logs: `Containers` -> `solarzap-web` -> `Logs`
- Reiniciar: `Containers` -> `solarzap-web` -> `Restart`
- Erro de certificado:
  - confirme DNS apontando para a VPS
  - confirme portas `80/443` publicas
  - confirme ausencia de outro proxy ocupando as portas
