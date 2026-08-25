# SalaryFlow — 技术设计

## 技术栈

- Web: React + Vite + TypeScript
- API: Hono + TypeScript on Vercel
- Shared Core: TypeScript package
- Persistence: localStorage (MVP)
- Frontend Hosting: Cloudflare Pages
- Backend Hosting: Vercel

## Monorepo

```text
salary-flow/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   └── core/
├── docs/
└── .github/workflows/
```

## 设计原则

1. 核心计算只写一次，位于 `@salary-flow/core`。
2. UI 只负责呈现与本地状态。
3. API 可复用相同 core 做服务端校验。
4. 所有实时数字都由时间戳推导。
5. local-first 避免 MVP 被数据库/账号系统绑架。

## API

### GET /api/health

用于部署存活检查。

### POST /api/calculate/rates

输入 SalaryProfile，返回日/时/分/秒薪资。

### POST /api/calculate/work-time

输入价格与 SalaryProfile，返回所需工作秒数。

## 后续云同步

推荐增加：

- POST /api/auth/*
- GET/PUT /api/profile
- CRUD /api/wishes
- CRUD /api/slacking-sessions
- CRUD /api/assets

数据库建议 PostgreSQL。表必须以 `user_id` 隔离，历史摸鱼记录保存当时 salary rate snapshot。
