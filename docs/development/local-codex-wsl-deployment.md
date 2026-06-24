# Windows 与 WSL2 本地 Codex Bridge 部署手册

本文档供新电脑上的 Agent 阅读和执行，涵盖本地编译、源码开发、局域网访问、Windows 防火墙规则，以及自托管 Codex Bridge 的配置。

## 部署架构

推荐的开发架构如下：

```text
手机或局域网浏览器
        |
        | http://WINDOWS_LAN_IP:3210
        v
Windows portproxy 与防火墙
        |
        v
WSL2 中运行的 LobeHub 源码服务
        |
        +-- Next.js: 3210
        +-- Vite:    9876（仅开发模式）
        +-- WSL 宿主机上的 Codex CLI
        |
        v
Docker 依赖服务
  PostgreSQL、Redis、RustFS、SearXNG
```

生产构建通过 `3210` 同时提供前端和后端。源码开发模式使用两个端口：

- `3210`：Next.js、认证、API 和页面入口。
- `9876`：Vite 前端模块和热更新。

生产部署不应开放 `9876`。

## 安全警告

本地 Codex Bridge 会以启动 LobeHub 的 WSL Linux 用户身份运行 Codex。所有拥有消息创建权限的 LobeHub 用户都会共享同一个 Codex 账号、额度、技能目录和文件系统权限。

此配置仅适合个人服务器或完全可信的用户。在允许不可信用户注册前，必须增加用户白名单或独立的 Codex 使用权限检查。

严禁提交以下内容：

- `.env` 或 `.env.development.local`
- `~/.codex/auth.json`
- 数据库数据目录
- API Key、密码或生成的密钥

## 环境要求

安装以下软件：

- Windows 11 与 WSL2
- WSL2 中的 Ubuntu
- 启用 WSL 集成的 Docker Desktop
- Git
- 通过 `nvm` 安装的 Node.js 22
- Bun
- Corepack 与 pnpm
- Codex CLI

在 WSL 中验证：

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

如果尚未下载 pnpm：

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
```

如果 Corepack 无法访问 npm，先检查并修正 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 和 `NO_PROXY`。不要让 WSL 使用已经失效的代理地址。

## 克隆 Fork 仓库

```bash
mkdir -p ~/GitHub
cd ~/GitHub
git clone git@github.com:Far-cloind/lobehub.git
cd lobehub
git switch canary
```

确认仓库包含自托管 Bridge 提交：

```bash
git log --oneline --grep='self-hosted local bridge' -n 1
```

## 安装依赖

在仓库根目录执行：

```bash
pnpm install
```

该命令会下载 monorepo 的全部依赖。首次安装可能需要较长时间；只要 lockfile 和依赖没有变化，后续安装会复用 pnpm 缓存。

如果尚未安装 Bun：

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

## 启动 Docker 依赖

推荐方案是只在 Docker 中运行基础设施，由 WSL 宿主机运行 LobeHub 源码和 Codex CLI。源码服务占用 `3210` 时，不要同时启动 `lobe` 应用容器。

创建部署环境文件：

```bash
cd ~/GitHub/lobehub/docker-compose/deploy
cp .env.example .env
```

为所有占位符生成独立密钥，至少配置：

```dotenv
LOBE_PORT=3210
APP_URL=http://WINDOWS_LAN_IP:3210
INTERNAL_APP_URL=http://localhost:3210

KEY_VAULTS_SECRET=GENERATE_A_SECRET
AUTH_SECRET=GENERATE_A_DIFFERENT_SECRET
POSTGRES_PASSWORD=GENERATE_A_DATABASE_PASSWORD
RUSTFS_SECRET_KEY=GENERATE_AN_OBJECT_STORAGE_PASSWORD
```

只启动依赖服务：

```bash
docker compose up -d postgresql redis rustfs rustfs-init searxng
docker compose ps -a
```

预期容器：

- `lobe-postgres`
- `lobe-redis`
- `lobe-rustfs`
- `lobe-rustfs-init` 成功执行后退出
- `lobe-searxng`

不要在没有 Compose 文件的目录中执行 `docker compose logs -f`。应进入 `docker-compose/deploy`，或通过 `-f` 明确指定文件。

## 配置源码开发环境

创建 `~/GitHub/lobehub/.env.development.local`，使用新生成的密钥和 Windows 实际局域网地址：

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

不要猜测 Codex 路径，使用以下命令获取：

```bash
command -v codex
```

如果需要 HTTP 代理，将代理配置加入此文件，并确保本地服务绕过代理：

```dotenv
HTTP_PROXY=http://WINDOWS_LAN_IP:PROXY_PORT
HTTPS_PROXY=http://WINDOWS_LAN_IP:PROXY_PORT
NO_PROXY=localhost,127.0.0.1,::1,postgresql,redis,rustfs,searxng
```

## 启动源码服务

在仓库根目录执行：

```bash
cd ~/GitHub/lobehub
PORT=3210 bun run dev
```

等待两个服务进入监听状态：

```bash
ss -lntp | grep -E ':3210|:9876'
```

两个端口都应监听 WSL 的所有接口。服务重启后的首次页面请求可能需要 20 至 60 秒，因为 Turbopack 和 Vite 需要完成首次编译。

## 配置 Windows 局域网端口转发

WSL2 通常会在重启后获得新的私有 IP。获取当前 WSL 地址：

```bash
hostname -I | awk '{print $1}'
```

在 PowerShell 中获取 Windows Wi-Fi 地址：

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.InterfaceAlias -eq 'WLAN' -and
    $_.IPAddress -notlike '169.254*'
  } |
  Select-Object InterfaceAlias, IPAddress
```

以管理员身份打开 PowerShell，将下列 `WSL_IP` 替换为实际地址：

```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=3210
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3210 connectaddress=WSL_IP connectport=3210

netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=9876
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9876 connectaddress=WSL_IP connectport=9876

Restart-Service iphlpsvc
```

`9876` 只用于 `bun run dev`。切换到生产构建后应删除该规则。

检查转发规则和监听状态：

```powershell
netsh interface portproxy show all
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 3210, 9876 } |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

## 配置 Windows 防火墙

在管理员 PowerShell 中执行：

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

`lobehub-vite` 规则仅用于开发模式。

## 验证局域网访问

从 WSL 测试，并强制绕过代理：

```bash
curl --noproxy '*' -I http://127.0.0.1:3210/
curl --noproxy '*' -I http://WSL_IP:3210/
```

从 Windows PowerShell 测试：

```powershell
Invoke-WebRequest -UseBasicParsing http://WINDOWS_LAN_IP:3210
Invoke-WebRequest -UseBasicParsing http://WINDOWS_LAN_IP:9876/@vite/client
```

未登录请求应重定向到：

```text
http://WINDOWS_LAN_IP:3210/signin?callbackUrl=http://WINDOWS_LAN_IP:3210/
```

检查开发页面返回的资源地址：

```bash
curl --noproxy '*' -L http://WINDOWS_LAN_IP:3210/ \
  | grep -o 'http://[^" <]*' \
  | sort -u
```

所有 Vite URL 都必须使用 `WINDOWS_LAN_IP:9876`。如果出现 `localhost:9876`，检查 `VITE_DEV_PUBLIC_ORIGIN`，然后重启 `bun run dev`。

在手机上：

1. 连接到与 Windows 电脑相同的 Wi-Fi。
2. 临时关闭移动数据。
3. 确认手机地址与电脑处于同一网段，例如 `192.168.31.x`。
4. 打开 `http://WINDOWS_LAN_IP:3210`。
5. 修改 `APP_URL` 后使用无痕窗口，避免旧重定向缓存。

如果 Windows 可以访问但手机不能访问，检查路由器是否启用了 AP 隔离、客户端隔离、访客 Wi-Fi 隔离或不同 VLAN。

## WSL 重启后的恢复流程

Windows 或 WSL 重启后：

1. 启动 Docker Desktop。
2. 在 WSL 中执行 `hostname -I`。
3. 将结果与 `netsh interface portproxy show all` 比较。
4. 如果 WSL IP 已变化，重建两个 `portproxy` 规则。
5. 启动 Docker 依赖服务。
6. 使用 `PORT=3210 bun run dev` 启动 LobeHub。

管理员 PowerShell 可以使用以下脚本自动更新两个规则：

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

## 本地生产构建

### 构建 Docker 镜像

进入 `docker-compose/deploy`：

```bash
docker compose build lobe
```

使用中国大陆 npm 镜像：

```bash
USE_CN_MIRROR=true docker compose build lobe
```

首次构建可能需要 10 至 20 分钟，因为需要下载依赖并编译完整应用。只要 `package.json`、lockfile 和依赖安装层没有变化，后续构建会复用 Docker 缓存。

启动完整 Compose 部署：

```bash
docker compose up -d
docker compose ps -a
docker compose logs -f lobe
```

生产镜像只需对 Windows 开放 `3210`。

### Docker 中使用 Codex Bridge 的限制

本地 Bridge 会在 LobeHub 进程内执行 `LOCAL_CODEX_COMMAND`。当 LobeHub 运行在 Docker 容器中时，容器无法自动使用安装在 WSL 中的 Codex 二进制文件和登录会话。

要在容器内启用 Bridge，部署必须提供：

- 容器内可执行的 Linux Codex 程序
- 包含认证信息和技能的 Codex Home 目录
- 需要访问的工作目录
- 与容器路径匹配的 `LOCAL_CODEX_COMMAND`、`LOCAL_CODEX_WORKING_DIR` 和 `CODEX_HOME`

不要为了实现该功能而挂载宿主机 Docker Socket 或过大的文件系统目录。当前推荐架构仍然是：

```text
Docker：PostgreSQL + Redis + RustFS + SearXNG
WSL 宿主机：LobeHub 源码服务 + Codex CLI
```

## 常见问题

### `no configuration file provided`

进入 `docker-compose/deploy` 后再运行 Compose，或明确指定文件：

```bash
docker compose -f ~/GitHub/lobehub/docker-compose/deploy/docker-compose.yml ps -a
```

### 页面一直显示 LobeHub 加载界面

在开发模式中检查 HTML 是否包含 `localhost:9876`。正确设置 `VITE_DEV_PUBLIC_ORIGIN`、开放 `9876`，并使用无痕窗口重新访问。

### 登录重定向到 `localhost:3210`

在仓库根目录的 `.env.development.local` 中设置：

```dotenv
APP_URL=http://WINDOWS_LAN_IP:3210
```

然后重启源码服务。只修改 `docker-compose/deploy/.env` 不会影响 `bun run dev`。

### pnpm 或 Corepack 下载超时

检查 Node 是否使用了失效代理：

```bash
env | grep -i proxy
curl --noproxy '*' -I https://registry.npmjs.org/
```

更新代理地址或临时取消代理变量。

### `ffmpeg-static install: Failed`

这通常是 Docker 构建中的 `pnpm install` 无法下载依赖。检查 Docker 的代理构建参数，尝试启用镜像，并保留构建缓存，不要直接使用 `--no-cache` 重建。

### Codex 停止后话题仍显示黄色加载圆圈

确认已经拉取最新 Bridge 代码，并检查状态仍为 `running` 的话题。只有在 `metadata.runningOperation` 为 `null` 时，才可以将话题状态改为 `active`。

## Agent 交接检查清单

配置 Agent 在宣布部署完成前必须验证：

- `docker compose ps -a` 显示依赖服务健康。
- `codex login status` 在运行 LobeHub 的同一个 WSL 用户下成功。
- `command -v codex` 与 `LOCAL_CODEX_COMMAND` 一致。
- 开发模式下 WSL 正在监听 `3210` 和 `9876`。
- Windows 正在监听 `0.0.0.0:3210` 和 `0.0.0.0:9876`。
- 两条防火墙规则均已启用。
- 登录回调使用 Windows 局域网地址。
- 返回的 HTML 使用 Windows 局域网地址加载 Vite 资源。
- 手机可以通过同一 Wi-Fi 加载页面并登录。
- Codex 助理可以发送消息并收到流式回复。
- `/model`、`/skills` 和 `/status` 通过正常对话消息返回结果。
- 底部状态栏显示当前模型、上下文余量、5 小时余量和每周余量。
