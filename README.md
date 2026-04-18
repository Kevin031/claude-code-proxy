# API 代理服务器

一个基于 Node.js 的通用 API 代理服务器，用于转发请求至目标 API，并记录完整的请求和响应日志。

## 功能特性

- 通用代理功能，支持任意路径转发
- 默认配置转发至 GLM Anthropic 兼容端点
- 完整的请求-响应日志记录（YAML 格式）
- 按日期自动组织日志文件
- 健康检查端点
- 错误处理和日志记录
- 安全头部配置（Helmet）
- CORS 支持

## 技术栈

- Node.js
- Express.js
- Axios
- js-yaml
- UUID
- dotenv

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env` 并根据需要修改配置：

```bash
cp .env.example .env
```

配置项说明：

- `PORT`: 服务器端口（默认: 3000）
- `NODE_ENV`: 运行环境（development/production）
- `TARGET_API_URL`: 目标 API 地址（默认: https://open.bigmodel.cn/api/anthropic）
- `LOG_DIR`: 日志目录路径（默认: ./logs）
- `TIMEOUT`: 请求超时时间，单位毫秒（默认: 30000）

### 启动服务

开发模式（支持热重载）：

```bash
npm run dev
```

生产模式：

```bash
npm start
```

## 使用示例

### 健康检查

```bash
curl http://localhost:3000/health
```

### 代理请求

```bash
# POST 请求示例
curl -X POST http://localhost:3000/api/endpoint \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'

# GET 请求示例
curl http://localhost:3000/api/endpoint?param=value
```

## 日志格式

日志文件按日期组织在 `logs/` 目录下：

```
logs/
└── 2024-04-18/
    └── 1713420000000-abc123-def456.yaml
```

每个日志文件包含完整的请求-响应对（YAML 格式）：

```yaml
requestId: abc123-def456
timestamp: "2024-04-18T10:30:00.000Z"
request:
  method: POST
  path: /api/endpoint
  headers:
    content-type: application/json
    user-agent: Mozilla/5.0
  query:
    param1: value1
  body:
    key: value
    data: test
response:
  timestamp: "2024-04-18T10:30:01.234Z"
  statusCode: 200
  headers:
    content-type: application/json
  body:
    result: success
    data: response_data
  responseTime: 1234
error: null
```

## 项目结构

```
claude-proxy/
├── src/
│   ├── index.js              # 服务入口
│   ├── proxy/
│   │   └── proxy.js          # 代理核心逻辑
│   ├── middleware/
│   │   ├── logger.js         # 日志中间件
│   │   └── errorHandler.js   # 错误处理
│   ├── utils/
│   │   └── logger.js         # 日志工具类
│   └── config/
│       └── index.js          # 配置管理
├── logs/                     # 日志目录
├── .env                      # 环境变量
├── .env.example
├── .gitignore
└── package.json
```

## 开发

### 代码风格

- 使用 ES6+ 语法
- 优先使用中文注释
- 遵循 Airbnb JavaScript 风格指南

### 测试

```bash
npm test
```

## 部署

### 使用 PM2

```bash
npm install -g pm2
pm2 start src/index.js --name claude-proxy
pm2 save
pm2 startup
```

### 使用 Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "src/index.js"]
```

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
