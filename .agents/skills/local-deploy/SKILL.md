---
name: local-deploy
description: 'Build, deploy, restart local LobeHub self-hosted instance. Use when making code changes that need to take effect, deploying after edits, rebuilding SPA/Next.js, restarting the dev server, or any task that touches src/ and needs the running app updated. Triggers on: build, deploy, compile, restart, rebuild, 构建, 部署, 编译, 重启, 生效, 更新服务.'
argument-hint: '[--skip-mobile | --dry-run]'
---

# Local Deploy — LobeHub Self-Hosted Build & Restart

Standard workflow for building and deploying code changes to the local LobeHub instance running on WSL2 + Docker, exposed via rathole.

## Environment Overview

```
Docker (docker-compose/deploy):            WSL2 Host:
├── PostgreSQL  (5432 → host)              ├── Redis         (6379, native)
├── nginx-cors  (9000 → RustFS:9000)       ├── LobeHub Next.js (3210, production)
├── RustFS      (9001 admin, 9000 internal)├── Vite SPA assets (public/_spa/)
└── SearXNG     (8180 → 8080)              └── Codex CLI

rathole: cloud-server→home:2333 tunnel
  app1 → 127.0.0.1:3210
  app2 → 127.0.0.1:9000
```

## Pre-flight Checks (MANDATORY - run before any build)

### 1. Database Safety Check

**NEVER run `bun run db:migrate` without explicit user approval.** It creates tables if missing but won't delete data. However, always verify first:

```bash
# Check tables exist and have data
docker exec lobe-postgres psql -U postgres -d lobechat -c "
  SELECT schemaname, tablename, n_live_tup
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY n_live_tup DESC
  LIMIT 10;
"

# If "Did not find any relations" → tables missing, needs migration
# If tables exist but empty → schema OK, just no data yet
# If tables exist WITH data → DO NOT TOUCH, confirm with user
```

**Rule**: If `users` table has rows, ask before any migration. If empty or missing, migration is safe but still confirm.

### 2. Docker Services Check

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Expected: `lobe-postgres`, `lobe-rustfs`, `lobe-nginx-cors`, `lobe-searxng` all `Up` and healthy.

If any are down:

```bash
cd ~/GitHub/lobehub/docker-compose/deploy
docker compose up -d postgresql rustfs rustfs-init nginx-cors searxng
```

### 3. WSL IP & Windows Networking Check

WSL2 IP can change after reboot. Verify portproxy rules match:

```bash
echo "WSL IP: $(hostname -I | awk '{print $1}')"
netsh.exe interface portproxy show all | grep -E '3210|9000'
```

If mismatched, update:

```powershell
# Run in admin PowerShell:
$wslIp = (wsl.exe hostname -I).Trim().Split(' ')[0]
foreach ($port in 3210, 9000) {
  netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port
  netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$port connectaddress=$wslIp connectport=$port
}
```

### 4. Firewall Rules Check

```bash
netsh.exe advfirewall firewall show rule name=lobehub | grep Enabled
netsh.exe advfirewall firewall show rule name=lobehub-s3 | grep Enabled
```

If missing, recreate (admin PowerShell):

```powershell
New-NetFirewallRule -DisplayName lobehub -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3210 -Profile Any
New-NetFirewallRule -DisplayName lobehub-s3 -Direction Inbound -Action Allow -Protocol TCP -LocalPort 9000 -Profile Any
```

### 5. External Access Check

```bash
curl --noproxy '*' -sI --connect-timeout 5 http://82.157.33.107:3210/ | head -3
curl --noproxy '*' -sI --connect-timeout 5 http://82.157.33.107:9000/health | head -3
```

Both should respond. If not, check rathole:

```bash
# Client side (Windows service)
powershell.exe -Command "Get-Service -Name rathole | Select-Object Status"
# Config: C:\Users\z5462\Desktop\client.toml
# Tokens must match server: /etc/rathole/server.toml on cloud VM
```

## Build Pipeline

### Determining what to rebuild

| Changed files                                                                      | What to rebuild                    |
| ---------------------------------------------------------------------------------- | ---------------------------------- |
| `src/routes/`, `src/features/`, `src/components/`, `src/store/` (any `.tsx`/`.ts`) | Mobile SPA + Desktop SPA + Next.js |
| `src/app/`, `src/server/`, `src/libs/` (Next.js server-side)                       | Next.js only                       |
| `packages/`                                                                        | Mobile SPA + Desktop SPA + Next.js |
| `public/`, static assets                                                           | Copy step only                     |
| `docker-compose/`, Docker configs                                                  | Docker restart only                |

### Full Build (most common)

```bash
cd ~/GitHub/lobehub

# 1. Build mobile SPA (includes all mobile routes + features)
MOBILE=true npx vite build

# 2. Build desktop/web SPA (used by desktop browsers)
npx vite build

# 3. Regenerate SPA HTML templates (uses local build instead of CDN)
bun run build:spa:copy

# 4. Rebuild Next.js server
bun run build:next
```

Each step is independent — if a step fails, fix and re-run only that step.

### Quick Build (Next.js only, no SPA changes)

```bash
cd ~/GitHub/lobehub
bun run build:next
```

### Mobile-only Build

```bash
cd ~/GitHub/lobehub
MOBILE=true npx vite build
bun run build:spa:copy
bun run build:next
```

## Restart Server

**IMPORTANT**: The shell has `no_proxy=*` set by Claude Code's wrapper. Starting `next start` directly inherits this, killing Codex API access. Source `.env.production.local` to override with correct proxy settings, and add `AUTH_TRUSTED_ORIGINS` to allow login from local network IPs:

```bash
# Kill old process on port 3210 (force if needed)
fuser -k 3210/tcp 2> /dev/null
sleep 2

# Start server with env from .env.production.local.
# AUTH_TRUSTED_ORIGINS must include public IP, local network IP, and localhost
# so BetterAuth's CSRF check doesn't reject login from any access point.
cd ~/GitHub/lobehub
nohup bash -c '
  set -a
  source .env.production.local
  AUTH_TRUSTED_ORIGINS="http://82.157.33.107:3210,http://192.168.31.150:3210,http://localhost:3210"
  npx next start -p 3210
' > /tmp/lobehub-next.log 2>&1 &

# Verify server is up
sleep 8
ss -lntp | grep 3210
tail -5 /tmp/lobehub-next.log
```

### Config Files That Must Include AUTH_TRUSTED_ORIGINS

- **`.env.production.local`** — for direct `next start` (WSL host)
- **`docker-compose/deploy/.env`** — for Docker-based deployment

Both must include:

```
AUTH_TRUSTED_ORIGINS=http://82.157.33.107:3210,http://192.168.31.150:3210,http://localhost:3210
```

## Post-deployment Verification

```bash
# 1. Local access
curl --noproxy '*' -sI http://127.0.0.1:3210/ | grep HTTP

# 2. Public access
curl --noproxy '*' -sI http://82.157.33.107:3210/ | grep HTTP

# 3. S3/CORS
curl --noproxy '*' -sI -X OPTIONS http://localhost:9000/ | grep Access-Control

# 4. Check for errors in recent logs
tail -30 /tmp/lobehub-next.log | grep -i 'error\|fail' | grep -v 'composio\|qstash\|market.getMcp'
```

## Data Safety Rules (CRITICAL)

1. **Never drop or truncate tables** — not even "empty" ones
2. **Never run `db:migrate` without asking** — check `users` row count first
3. **Never delete Docker volumes** (`docker compose down -v`)
4. **Never modify `DATABASE_URL`** or point to a different database
5. **Backup `.env.development.local` before editing** — `cp .env.development.local .env.development.local.bak`
6. **If a build step fails**, fix the code and re-run — don't skip steps
7. **After any config change** (`.env`, `docker-compose.yml`, rathole), verify external access still works

## Common Issues

### "relation does not exist" after migration

Tables were just created — expected if database was empty. No data was lost because no data existed.

### Page doesn't load after build

Check if Next.js is listening: `ss -lntp | grep 3210`. Check logs: `tail -20 /tmp/lobehub-next.log`.

### Mobile SPA showing CDN assets instead of local

The `build:spa:copy` step was skipped. The template must say `mobile from build`, not `mobile from source`. Re-run `bun run build:spa:copy`.

### WSL IP changed after reboot

Run the portproxy update script in pre-flight check #3. Don't forget to also restart rathole if the WSL IP change affects tunnel routing.

### 登录被跳转到 /verify-email（实际不是邮箱验证问题）

**症状**: 从局域网 IP（如 192.168.31.150:3210）登录时跳转到 `/verify-email`。
**根因**: BetterAuth CSRF 检测到请求 Origin 不在 `trustedOrigins` 中，返回 403。前端 `useSignIn.ts` 将所有 403 错误当作 "邮箱未验证" 处理。
**修复**: 确保 `AUTH_TRUSTED_ORIGINS` 包含所有访问入口的 origin，重启服务器。
**验证**: 检查 `tail -50 /tmp/lobehub-next.log | grep "Invalid origin"`，如果有匹配说明还有遗漏的 origin。

### WSL 内存占用虚高（Windows 任务管理器显示很高，WSL 内 free 正常）

**根因**: WSL2 Linux 内核将空闲内存用作缓存（buff/cache），不主动归还给 Windows。WSL 内 `free -h` 显示 available 充足，但 Windows 看到的是已分配总量。
**释放缓存**:

```bash
echo <password> | sudo -S sh -c 'sync && echo 3 > /proc/sys/vm/drop_caches'
```

**长期限制**: 编辑 Windows 上 `C:\Users\<user>\.wslconfig`，设置 `memory=6GB`，然后 `wsl --shutdown` 重启。

### Docker 构建残留进程

**症状**: `docker compose up` 失败后，`pnpm i` 或 `corepack` 进程仍在后台消耗 CPU 和内存。
**修复**:

```bash
# 查找并杀掉残留
ps aux --sort=-%mem | grep -E "corepack|pnpm|docker.compose" | grep -v grep
kill -9 <PID>
```
