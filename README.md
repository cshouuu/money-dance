# Money Dance / 薪流

把工资变成一个实时流动的数字：实时薪资、购买时间换算、摸鱼收益、物品持有成本。

## Monorepo

- `apps/web` — React + Vite + TypeScript，面向 Cloudflare Pages
- `apps/api` — Hono + TypeScript，面向 Vercel
- `packages/core` — 前后端共享计算规则与类型
- `docs` — PRD、信息架构、页面原型与异常场景

## 本地开发

```bash
npm install
npm run dev:web
npm run dev:api
```

Web 默认 `http://localhost:5173`，API 使用 Hono/Vercel 本地方式运行。

## 构建与测试

```bash
npm test
npm run typecheck
npm run build
```

## 部署

### Frontend — Cloudflare Pages

- Root directory: repository root (`/`)
- Build command: `npm run build -w @salary-flow/core && npm run build -w @salary-flow/web`
- Build output: `apps/web/dist`
- Environment: `VITE_API_BASE_URL=https://salary-flow-api.vercel.app`

仓库已包含 GitHub Actions 工作流；配置 Cloudflare 凭证后会自动确保 `money-dance` Pages 项目存在并部署。手动部署命令：

```bash
npx wrangler pages deploy dist --project-name=money-dance
```

### Backend — Vercel

Vercel 项目 Root Directory 设为 `apps/api`。Vercel 的 monorepo 安装会解析根目录 npm workspace，Hono 可作为 Node backend 部署。生产环境建议配置：

- `CORS_ORIGIN=https://<your-cloudflare-pages-domain>`

## MVP 数据策略

MVP 采用 local-first：工资配置、摸鱼记录、想买物品和已购物品默认存储在用户浏览器 localStorage，不需要注册，也不会把薪资主动上传服务器。API 仅用于共享计算校验/健康检查，并为后续账号与云同步预留接口。

## Production API

`https://salary-flow-api.vercel.app`
