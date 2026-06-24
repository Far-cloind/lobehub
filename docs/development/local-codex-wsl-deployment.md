# Local Codex Bridge Deployment on Windows and WSL2

This runbook is written for an agent setting up this fork on a new Windows
computer. It covers local builds, source development, LAN access, Windows
firewall rules, and the self-hosted Codex bridge.

## Scope

The supported development topology is:

```text
Phone or LAN browser
        |
        | http://WINDOWS_LAN_IP:3210
        v
Windows portproxy and firewall
        |
        v
WSL2 LobeHub source server
        |
        +-- Next.js: 3210
        +-- Vite:    9876 (development only)
        +-- Codex CLI on the WSL host
        |
        v
Docker dependencies
  PostgreSQL, Redis, RustFS, SearXNG
```

Production builds serve the frontend and backend from port `3210`. Source
development uses both ports:

- `3210`: Next.js, authentication, API, and page entry.
- `9876`: Vite frontend modules and hot reload.

Do not expose `9876` for a production build.

## Security Warning

The local Codex bridge runs Codex as the WSL Linux user that started LobeHub.
Every LobeHub user with permission to create messages can consume the same
Codex account, limits, skills, and filesystem permissions.

Use this configuration only for a personal server or trusted users. Before
allowing untrusted registration, add a user allowlist or a dedicated Codex
permission check.

Never commit:

- `.env` or `.env.development.local`
- `~/.codex/auth.json`
- database directories
- API keys, passwords, or generated secrets

## Prerequisites

Install:

- Windows 11 with WSL2
- Ubuntu in WSL2
- Docker Desktop with WSL integration
- Git
- Node.js 22 through `nvm`
- Bun
- Corepack and pnpm
- Codex CLI

Verify from WSL:

```bash
node --version
bun --version
corepack --version
pnpm --version
docker version
docker compose version
codex --version
codex login status
```

If `pnpm` is not downloaded yet:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
```

If Corepack cannot reach npm, first correct `HTTP_PROXY`, `HTTPS_PROXY`,
`ALL_PROXY`, and `NO_PROXY`. Do not point WSL at a proxy address that is no
longer reachable.

## Clone the Fork

```bash
mkdir -p ~/GitHub
cd ~/GitHub
git clone git@github.com:Far-cloind/lobehub.git
cd lobehub
git switch canary
```

The self-hosted bridge commit must be present:

```bash
git log --oneline --grep='self-hosted local bridge' -n 1
```

## Install Dependencies

From the repository root:

```bash
pnpm install
```

This downloads the monorepo dependencies. The first install can take several
minutes. Subsequent installs reuse the pnpm store unless the lockfile or
dependencies change.

Install Bun if needed:

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

## Start Docker Dependencies

The recommended bridge setup runs only infrastructure in Docker. Do not start
the `lobe` application container while running the source server on port
`3210`.

Create the deployment environment:

```bash
cd ~/GitHub/lobehub/docker-compose/deploy
cp .env.example .env
```

Generate unique values for all placeholders. At minimum configure:

```dotenv
LOBE_PORT=3210
APP_URL=http://WINDOWS_LAN_IP:3210
INTERNAL_APP_URL=http://localhost:3210

KEY_VAULTS_SECRET=GENERATE_A_SECRET
AUTH_SECRET=GENERATE_A_DIFFERENT_SECRET
POSTGRES_PASSWORD=GENERATE_A_DATABASE_PASSWORD
RUSTFS_SECRET_KEY=GENERATE_AN_OBJECT_STORAGE_PASSWORD
```

Start only the dependencies:

```bash
docker compose up -d postgresql redis rustfs rustfs-init searxng
docker compose ps -a
```

Expected containers:

- `lobe-postgres`
- `lobe-redis`
- `lobe-rustfs`
- `lobe-rustfs-init` exits successfully
- `lobe-searxng`

Do not use `docker compose logs -f` from a directory without a Compose file.
Run it from `docker-compose/deploy`, or pass `-f` explicitly.

## Configure Source Development

Create `~/GitHub/lobehub/.env.development.local`. Use fresh secrets and the
actual Windows LAN address:

```dotenv
APP_URL=http://WINDOWS_LAN_IP:3210
VITE_DEV_PUBLIC_ORIGIN=http://WINDOWS_LAN_IP:9876

SSRF_ALLOW_PRIVATE_IP_ADDRESS=1

KEY_VAULTS_SECRET=YOUR_KEY_VAULTS_SECRET
AUTH_SECRET=YOUR_AUTH_SECRET

DATABASE_DRIVER=node
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/lobechat

REDIS_URL=redis://localhost:6379
REDIS_PREFIX=lobechat
REDIS_TLS=0

S3_ACCESS_KEY_ID=admin
S3_SECRET_ACCESS_KEY=YOUR_RUSTFS_PASSWORD
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=lobe
S3_ENABLE_PATH_STYLE=1
S3_SET_ACL=0

LLM_VISION_IMAGE_USE_BASE64=1

ENABLE_LOCAL_CODEX_BRIDGE=1
LOCAL_CODEX_COMMAND=/home/YOUR_USER/.nvm/versions/node/YOUR_NODE_VERSION/bin/codex
LOCAL_CODEX_WORKING_DIR=/home/YOUR_USER/GitHub
```

Find the exact Codex path instead of guessing:

```bash
command -v codex
```

If an HTTP proxy is required, add it to this file. Ensure local services bypass
the proxy:

```dotenv
HTTP_PROXY=http://WINDOWS_LAN_IP:PROXY_PORT
HTTPS_PROXY=http://WINDOWS_LAN_IP:PROXY_PORT
NO_PROXY=localhost,127.0.0.1,::1,postgresql,redis,rustfs,searxng
```

## Start the Source Server

From the repository root:

```bash
cd ~/GitHub/lobehub
PORT=3210 bun run dev
```

Wait until both servers are ready:

```bash
ss -lntp | grep -E ':3210|:9876'
```

Both ports should listen on all WSL interfaces. The first page load after a
restart may take 20 to 60 seconds while Turbopack and Vite compile.

## Configure Windows LAN Forwarding

WSL2 normally receives a dynamic private IP after every restart. Get the
current WSL address:

```bash
hostname -I | awk '{print $1}'
```

Get the Windows Wi-Fi address from PowerShell:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.InterfaceAlias -eq 'WLAN' -and
    $_.IPAddress -notlike '169.254*'
  } |
  Select-Object InterfaceAlias, IPAddress
```

Open an elevated PowerShell and replace `WSL_IP` below:

```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=3210
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3210 connectaddress=WSL_IP connectport=3210

netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=9876
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9876 connectaddress=WSL_IP connectport=9876

Restart-Service iphlpsvc
```

Port `9876` is required only for `bun run dev`. Remove that rule when switching
to a production build.

Check the rules:

```powershell
netsh interface portproxy show all
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 3210, 9876 } |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

## Configure Windows Firewall

Run in elevated PowerShell:

```powershell
Remove-NetFirewallRule -DisplayName lobehub -ErrorAction SilentlyContinue
New-NetFirewallRule `
  -DisplayName lobehub `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 3210 `
  -Profile Any `
  -EdgeTraversalPolicy Allow

Remove-NetFirewallRule -DisplayName lobehub-vite -ErrorAction SilentlyContinue
New-NetFirewallRule `
  -DisplayName lobehub-vite `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 9876 `
  -Profile Any `
  -EdgeTraversalPolicy Allow
```

The Vite rule is development-only.

## Verify LAN Access

From WSL, bypass proxy variables:

```bash
curl --noproxy '*' -I http://127.0.0.1:3210/
curl --noproxy '*' -I http://WSL_IP:3210/
```

From Windows PowerShell:

```powershell
Invoke-WebRequest -UseBasicParsing http://WINDOWS_LAN_IP:3210
Invoke-WebRequest -UseBasicParsing http://WINDOWS_LAN_IP:9876/@vite/client
```

For an unauthenticated request, the `3210` response should redirect to:

```text
http://WINDOWS_LAN_IP:3210/signin?callbackUrl=http://WINDOWS_LAN_IP:3210/
```

Inspect the returned development HTML:

```bash
curl --noproxy '*' -L http://WINDOWS_LAN_IP:3210/ \
  | grep -o 'http://[^" <]*' \
  | sort -u
```

All Vite URLs must use `WINDOWS_LAN_IP:9876`. If they contain
`localhost:9876`, check `VITE_DEV_PUBLIC_ORIGIN` and restart `bun run dev`.

On the phone:

1. Connect to the same Wi-Fi as the Windows computer.
2. Disable mobile data temporarily.
3. Confirm the phone address is in the same subnet, for example
   `192.168.31.x`.
4. Open `http://WINDOWS_LAN_IP:3210`.
5. Use a private tab after changing `APP_URL` to avoid cached redirects.

If the phone cannot connect while Windows can, check the router for AP
isolation, client isolation, guest Wi-Fi isolation, or separate VLANs.

## WSL Restart Recovery

After Windows or WSL restarts:

1. Start Docker Desktop.
2. Run `hostname -I` in WSL.
3. Compare the result with `netsh interface portproxy show all`.
4. Recreate both `portproxy` rules if the WSL IP changed.
5. Start Docker dependencies.
6. Start LobeHub with `PORT=3210 bun run dev`.

An elevated PowerShell helper can update both rules:

```powershell
$wslIp = (wsl.exe hostname -I).Trim().Split(' ')[0]

foreach ($port in 3210, 9876) {
  netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port
  netsh interface portproxy add v4tov4 `
    listenaddress=0.0.0.0 `
    listenport=$port `
    connectaddress=$wslIp `
    connectport=$port
}

Restart-Service iphlpsvc
netsh interface portproxy show all
```

## Local Production Build

### Build a Docker image

From `docker-compose/deploy`:

```bash
docker compose build lobe
```

For the China npm mirror:

```bash
USE_CN_MIRROR=true docker compose build lobe
```

The first build can take 10 to 20 minutes because it downloads dependencies
and compiles the full application. Later builds reuse Docker layers when
`package.json`, the lockfile, and dependency installation layers are unchanged.

Start the complete Compose deployment:

```bash
docker compose up -d
docker compose ps -a
docker compose logs -f lobe
```

For a production image, expose only Windows port `3210`.

### Codex bridge caveat in Docker

The local bridge launches `LOCAL_CODEX_COMMAND` inside the LobeHub process.
When LobeHub runs inside Docker, it cannot automatically use the Codex binary
or login session installed in WSL.

To enable the bridge inside a container, the deployment must provide all of:

- a Linux Codex executable usable inside the container
- the Codex home directory, including authentication and skills
- the intended working directories
- matching container paths in `LOCAL_CODEX_COMMAND`,
  `LOCAL_CODEX_WORKING_DIR`, and `CODEX_HOME`

Do not mount the host Docker socket or broad filesystem paths merely to make
this work. The current recommended Codex topology remains:

```text
Docker: PostgreSQL + Redis + RustFS + SearXNG
WSL host: LobeHub source server + Codex CLI
```

## Common Failures

### `no configuration file provided`

Run Compose from `docker-compose/deploy`, or use:

```bash
docker compose -f ~/GitHub/lobehub/docker-compose/deploy/docker-compose.yml ps -a
```

### Page shows the LobeHub loading shell forever

In development mode, inspect the HTML for `localhost:9876`. Configure
`VITE_DEV_PUBLIC_ORIGIN`, expose port `9876`, and reopen the page in a private
tab.

### Sign-in redirects to `localhost:3210`

Set the repository-root `.env.development.local`:

```dotenv
APP_URL=http://WINDOWS_LAN_IP:3210
```

Then restart the source server. Editing only
`docker-compose/deploy/.env` does not affect `bun run dev`.

### `pnpm` or Corepack downloads time out

Check whether Node is using a stale proxy:

```bash
env | grep -i proxy
curl --noproxy '*' -I https://registry.npmjs.org/
```

Update the proxy address or temporarily unset it.

### `ffmpeg-static install: Failed`

This is usually a dependency download failure during `pnpm install` in the
Docker build. Verify Docker proxy build arguments, retry with the mirror, and
retain build cache instead of rebuilding with `--no-cache`.

### Yellow spinner remains after Codex stops

Confirm the latest bridge code is present and inspect topics whose persisted
status is still `running`. Do not change a running topic to `active` unless
`metadata.runningOperation` is null.

## Agent Handoff Checklist

Before declaring the setup complete, the configuring agent must verify:

- `docker compose ps -a` shows healthy dependencies.
- `codex login status` succeeds as the same WSL user running LobeHub.
- `command -v codex` matches `LOCAL_CODEX_COMMAND`.
- ports `3210` and `9876` listen inside WSL in development.
- Windows listens on `0.0.0.0:3210` and `0.0.0.0:9876`.
- both firewall rules are enabled.
- the sign-in callback uses the Windows LAN address.
- returned HTML uses the Windows LAN address for Vite assets.
- the phone can load and sign in from the same Wi-Fi.
- a Codex agent can send a message and receive a streamed reply.
- `/model`, `/skills`, and `/status` return normal conversation messages.
- the runtime strip shows model, context remaining, 5-hour remaining, and
  weekly remaining.
