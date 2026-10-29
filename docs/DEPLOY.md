# Hospedagem

## Local (padrão)
`npm run setup && npm run build && npm start`. Hub em `:4000`, Trilhas em `:4300`. Os dados ficam em `hub/data` e `trilhas/data`: faça backup dessas pastas (não estão no git).

## Num servidor Linux (systemd)
Dois serviços, ambos ouvindo só em `127.0.0.1` (exponha por VPN ou proxy reverso com HTTPS):

```ini
# /etc/systemd/system/lifehub.service
[Unit]
Description=Life Hub
After=network.target
[Service]
User=SEU_USUARIO
WorkingDirectory=/caminho/hub
Environment=NODE_ENV=production
Environment=PATH=/home/SEU_USUARIO/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/caminho/hub/node_modules/.bin/next start -p 4000 -H 127.0.0.1
Restart=always
[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/trilhas.service
[Unit]
Description=Trilhas
After=network.target
[Service]
User=SEU_USUARIO
WorkingDirectory=/caminho/trilhas
Environment=PORT=4300 HOST=127.0.0.1
Environment=PATH=/home/SEU_USUARIO/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/node server/index.js
Restart=always
[Install]
WantedBy=multi-user.target
```

O `PATH` precisa incluir onde está o `claude` (Claude Code logado **com o mesmo usuário** do serviço). Se o Hub ficar em outro caminho/porta que o padrão, defina no serviço do Trilhas `HUB_URL` e `HUB_ENV_FILE` (arquivo `.env.local` do Hub) para as notas do Mentor irem para o cofre do Hub.

## Acesso de fora de casa
Preferir **Tailscale** (rede privada): `tailscale serve --bg --https=443 http://127.0.0.1:4000` dá HTTPS dentro da sua tailnet. Evite expor o Hub na internet pública: ele tem um agente com acesso a arquivos e (na rota `/dev`) a comandos. Se for inevitável, coloque uma segunda camada (Cloudflare Access, por exemplo), use senha forte e considere remover o `/dev` (`docs/MODULES.md`).

## Atualizar
`git pull && npm run build` e reinicie os serviços. O proxy `/trilhas-app` precisa que o Trilhas esteja de pé na porta configurada (`TRILHAS_URL`).
