# Claude Proxy

一个基于 Node.js 的通用 API 代理服务器，支持桌面应用（Electron）和命令行两种运行模式。用于转发请求至目标 API，并记录完整的请求和响应日志。

## 功能特性

- **双模式运行**：支持 Electron 桌面应用和 Node.js 命令行两种启动方式
- **通用代理**：支持任意路径转发，默认指向 GLM Anthropic 兼容端点
- **完整日志**：请求-响应对以 YAML 格式记录，按日期自动组织
- **图形界面**：内置 Vue 3 前端，支持会话浏览、请求详情查看
- **可视化配置**：桌面应用内直接修改端口、目标 API、超时等参数
- **配置持久化**：Electron 模式下配置自动保存，支持默认值回退
- **安全头部**：集成 Helmet、CORS 等安全中间件

## 技术栈

- **后端**：Node.js + Express.js + Axios
- **前端**：Vue 3 + Vite + TypeScript
- **桌面**：Electron + electron-store
- **日志**：js-yaml + UUID

## 快速开始

### 安装依赖

```bash
pnpm install
```

> 国内用户如遇 Electron 下载失败，可设置镜像源：
> ```bash
> export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> ```

### 模式一：Electron 桌面应用（推荐）

#### 启动

```bash
# 生产模式（加载打包后的前端）
pnpm electron

# 开发模式（同时启动后端 + Vite + Electron）
pnpm electron:dev
```

#### 使用

1. 应用启动后自动在后台启动代理服务器
2. 主窗口加载日志查看器界面
3. 点击左上角设置图标可修改配置：
   - **代理端口**：本地服务器监听端口（默认 3088）
   - **目标 API 地址**：请求转发目的地（默认 https://open.bigmodel.cn/api/anthropic）
   - **超时时间**：请求超时毫秒数（默认 30000）
4. 修改配置后点击「重启服务」生效

#### 打包分发

```bash
# 打包当前平台
pnpm build

# 产物目录
release/
├── Claude Proxy-1.0.0.dmg          # macOS
├── Claude Proxy-1.0.0.exe          # Windows
└── Claude Proxy-1.0.0.AppImage     # Linux
```

### 模式二：Node.js 命令行

适用于服务器部署或与现有工作流集成。

#### 配置

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

环境变量说明（均具有默认值，不配置也能运行）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3088 | 服务器监听端口 |
| `NODE_ENV` | development | 运行环境 |
| `TARGET_API_URL` | https://open.bigmodel.cn/api/anthropic | 目标 API 地址 |
| `LOG_DIR` | ./logs | 日志存储目录 |
| `TIMEOUT` | 30000 | 请求超时（毫秒）|

#### 启动

```bash
# 开发模式（热重载）
pnpm dev

# 生产模式
pnpm start
```

#### 前端开发（独立）

如需单独开发前端界面：

```bash
# 同时启动后端和前端
cd web/claude-proxy-web && pnpm dev
```

前端将在 `http://localhost:5173` 运行，并代理 API 请求到 `http://localhost:3088`。

## 使用示例

### 代理请求

所有请求都会自动转发到配置的目标 API：

```bash
# POST 示例
curl -X POST http://localhost:3088/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "claude-3-sonnet",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# GET 示例
curl http://localhost:3088/v1/models
```

### 健康检查

```bash
curl http://localhost:3088/health
```

### 日志查询 API

```bash
# 获取会话列表
curl http://localhost:3088/logs/sessions

# 获取指定日期会话
curl http://localhost:3088/logs/sessions?date=2026-04-20

# 获取会话详情
curl http://localhost:3088/logs/sessions/<session-id>

# 获取请求详情
curl http://localhost:3088/logs/sessions/<session-id>/requests/<request-id>
```

## 日志存储

### Electron 桌面应用

配置和日志存储在系统用户目录下：

| 系统 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/api-proxy/logs/` |
| Windows | `%APPDATA%\api-proxy\logs\` |
| Linux | `~/.config/api-proxy/logs/` |

### 命令行模式

默认存储在项目目录 `./logs/`，可通过 `LOG_DIR` 环境变量修改。

### 日志格式

日志按日期分目录，文件名格式：`YYYYMMDD-HHMMSS-<shortId>.yaml`

```
logs/
└── 2026-04-20/
    ├── 20260420-143052-a1b2c3d.yaml
    └── 20260420-143105-e4f5g6h.yaml
```

单条日志内容示例：

```yaml
requestId: a1b2c3d4-e5f6-7890-abcd-ef1234567890
timestamp: "2026-04-20T14:30:52.123Z"
request:
  method: POST
  path: /v1/messages
  headers:
    content-type: application/json
    authorization: Bearer sk-***
  query: {}
  body:
    model: claude-3-sonnet
    messages:
      - role: user
        content: Hello
response:
  timestamp: "2026-04-20T14:30:53.456Z"
  statusCode: 200
  headers:
    content-type: application/json
  body:
    id: msg_01AbCdEfGhIjKlMn
    content:
      - type: text
        text: Hello! How can I help you today?
  responseTime: 1333
error: null
```

## 配置系统说明

本项目采用三层配置优先级：

1. **环境变量**（最高优先级）—— 用于调试和 CI/CD
2. **用户配置文件**（Electron 模式）—— 通过设置面板修改，自动持久化
3. **硬编码默认值**（最低优先级）—— 确保不配置也能运行

| 配置项 | 默认值 | 范围 | 说明 |
|--------|--------|------|------|
| port | 3088 | 1024-65535 | 本地代理服务器端口 |
| targetApiUrl | https://open.bigmodel.cn/api/anthropic | 任意合法 URL | 请求转发目标 |
| timeout | 30000 | 1000-300000 | 请求超时毫秒数 |
| logDir | ./logs | 任意合法路径 | 日志存储目录 |

## 项目结构

```
claude-proxy/
├── electron/
│   ├── main.js               # Electron 主进程
│   └── preload.js            # 预加载脚本（IPC 安全接口）
├── src/
│   ├── index.js              # Express 入口（导出 startServer）
│   ├── config/
│   │   └── index.js          # 三层配置系统（默认/用户/环境）
│   ├── proxy/
│   │   └── proxy.js          # 代理核心逻辑
│   ├── middleware/
│   │   ├── logger.js         # 请求响应日志中间件
│   │   └── errorHandler.js   # 全局错误处理
│   ├── controllers/
│   │   └── logController.js  # 日志查询接口
│   ├── routes/
│   │   └── logs.js           # 日志路由定义
│   └── utils/
│       ├── logger.js         # YAML 日志写入工具
│       └── logParser.js      # 日志扫描解析工具
├── web/
│   └── claude-proxy-web/     # Vue 3 前端
│       ├── src/
│       │   ├── App.vue
│       │   ├── api.ts        # 前端 API 封装
│       │   └── components/
│       │       ├── SessionList.vue
│       │       ├── RequestPanel.vue
│       │       ├── JsonViewer.vue
│       │       └── SettingsPanel.vue   # 设置面板
│       ├── index.html
│       └── vite.config.ts
├── logs/                     # 命令行模式日志目录
├── .env                      # 环境变量（命令行模式）
├── .env.example
└── package.json
```

## 开发指南

### 启动开发环境

```bash
# 1. 安装依赖
pnpm install

# 2. 启动 Electron 开发模式（推荐）
pnpm electron:dev

# 或分别启动：
# 终端 1：启动后端
pnpm dev

# 终端 2：启动前端
pnpm dev:web
```

### 构建前端

```bash
pnpm build:web
```

产物位于 `web/claude-proxy-web/dist/`。

### 构建桌面应用

```bash
# 当前平台
pnpm build

# 指定平台
npx electron-builder --mac
npx electron-builder --win
npx electron-builder --linux
```

## 部署

### 使用 PM2

```bash
npm install -g pm2
pm2 start src/index.js --name claude-proxy
pm2 save
pm2 startup
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --production
COPY . .
EXPOSE 3088
CMD ["node", "src/index.js"]
```

## 常见问题

### Electron 安装失败

国内网络环境下 Electron 二进制文件下载可能失败，可设置镜像源：

```bash
# npm/pnpm
npm config set electron_mirror https://npmmirror.com/mirrors/electron/

# 或临时环境变量
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
pnpm install
```

### 端口被占用

Electron 模式下若 3088 端口被占用，会自动尝试 3089、3090 等后续端口，并在控制台输出提示。

### 前端无法连接后端

- 开发模式：确保 Vite 配置中的 proxy 指向正确端口
- 生产模式：检查 `web/claude-proxy-web/src/api.ts` 中的 `API_BASE` 是否为 `http://localhost:${port}`

## 许可证

MIT
