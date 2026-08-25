# SalaryFlow — Deployment

## 1. Backend: Vercel

推荐在 Vercel 创建项目并连接本仓库：

- Root Directory: `apps/api`
- Framework: Hono / auto-detected
- Node: 22
- Environment: `CORS_ORIGIN=<Cloudflare Pages production origin>`

Vercel 当前对 Hono 提供一等 Node backend 支持，入口 `server.ts` 直接 `export default app`，无需旧式 rewrite 配置。

部署后验证：

```text
GET https://salary-flow-api.vercel.app/api/health
```

应返回 `ok: true`。

## 2. Frontend: Cloudflare Pages

Git Integration 推荐：

- Production branch: `main`
- Root directory: repository root
- Build command: `npm run build -w @salary-flow/core && npm run build -w @salary-flow/web`
- Build output directory: `apps/web/dist`

也可使用仓库内 GitHub Action。需设置：

Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Repository variable:

- `VITE_API_BASE_URL`

当前 MVP 前端核心功能不依赖 API 才能运行，因此即使 API 暂时不可用，实时薪资/换算/摸鱼/物品仍可正常使用。

## 3. 发布顺序

1. 合并 main。
2. 部署 Vercel API。
3. 获取 API production URL。
4. Cloudflare 设置 `VITE_API_BASE_URL`。
5. 部署 Pages。
6. Vercel 将 `CORS_ORIGIN` 更新为 Pages production origin。
7. 验证桌面和手机端。


## 当前已部署

- Vercel API Production: `https://salary-flow-api.vercel.app`
- Health check: `https://salary-flow-api.vercel.app/api/health`

前端 Cloudflare Pages 尚需 Cloudflare 授权/连接器或在仓库创建后由内置 GitHub Action 使用 Cloudflare Secrets 发布。
