# Deploy VPS - SolarZap (Docker + Caddy)

Data: 2026-02-28

## 1) Pre-requisitos (Ubuntu 22.04+)
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Logout/login apos `usermod`, ou rode com `sudo`.

## 2) Firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

## 3) DNS
Criar os registros `A` apontando para o mesmo `IP_PUBLICO_DA_VPS`:
- `solarzap.arkanlabs.com.br`
- `crm.solarzap.com.br`
- `app.solarzap.com.br`

Aguarde propagacao antes do SSL automatico do Caddy.

## 4) Copiar repo para VPS
```bash
sudo mkdir -p /opt/solarzap
sudo chown -R $USER:$USER /opt/solarzap
cd /opt/solarzap
git clone <URL_DO_REPO> .
```

## 5) Variaveis de ambiente de producao
```bash
cd /opt/solarzap
cp .env.production.example .env.production
nano .env.production
```

Preencher no minimo:
- `SOLARZAP_DOMAINS=solarzap.arkanlabs.com.br, crm.solarzap.com.br, app.solarzap.com.br`
- `CADDY_EMAIL=seu-email@dominio.com`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 6) Subir stack
```bash
cd /opt/solarzap
docker compose --env-file .env.production -f docker-compose.vps.yml up -d --build
docker compose -f docker-compose.vps.yml ps
```

## 7) Verificacao
1. HTTP por IP:
```bash
curl -I http://IP_PUBLICO_DA_VPS
```
2. HTTPS por dominio:
```bash
curl -I https://solarzap.arkanlabs.com.br
curl -I https://crm.solarzap.com.br
curl -I https://app.solarzap.com.br
```
3. Login manual no app e carga de dashboard.

## 8) Pos-deploy Supabase Auth
No Supabase Dashboard (`Authentication -> URL Configuration`):
- `Site URL`: `https://solarzap.arkanlabs.com.br`
- `Redirect URLs`: adicionar os dominios:
  - `https://solarzap.arkanlabs.com.br`
  - `https://crm.solarzap.com.br`
  - `https://app.solarzap.com.br`

## 9) Deploy com Portainer
Se voce gerencia a VPS com Portainer, siga [DEPLOY_PORTAINER.md](./DEPLOY_PORTAINER.md).

## 10) Rollback rapido
```bash
cd /opt/solarzap
docker compose -f docker-compose.vps.yml down
git fetch --tags
git checkout <tag_ou_commit_estavel>
docker compose --env-file .env.production -f docker-compose.vps.yml up -d --build
```

## 11) Comandos de operacao
```bash
docker compose -f docker-compose.vps.yml logs -f web
docker compose -f docker-compose.vps.yml restart web
docker compose -f docker-compose.vps.yml down
```
