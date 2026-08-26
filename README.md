<div align="center">

# 💸 Money Dance / 薪流

**把工资从一个月末数字，变成此刻正在流动的钱。**

实时薪资 · 心愿清单 · 摸鱼收益 · 收支汇算 · 意外收支 · 物品持有成本

[🌐 在线体验](https://money-dance-6gl.pages.dev/) · [📦 Android 下载](https://github.com/cshouuu/money-dance/releases/latest) · [🛠️ GitHub Actions](https://github.com/cshouuu/money-dance/actions)

![CI](https://github.com/cshouuu/money-dance/actions/workflows/ci.yml/badge.svg)
![Android APK](https://github.com/cshouuu/money-dance/actions/workflows/build-android-apk.yml/badge.svg)
![Cloudflare Pages](https://github.com/cshouuu/money-dance/actions/workflows/deploy-cloudflare-pages.yml/badge.svg)

</div>

---

## Money Dance 是什么？

Money Dance 是一个围绕「时间 × 工资 × 消费」构建的个人财务小工具。

它不只是告诉你月薪是多少，而是把工资拆成日薪、时薪、分钟薪资和秒薪，让你看到今天已经赚了多少钱、一件东西需要工作多久才能买到，以及一次摸鱼到底“赚”了多少钱。

项目采用 **local-first** 设计：核心薪资配置、心愿、摸鱼、物品和账本数据默认保存在你的设备本地，不要求注册账号。

## 功能

| 模块 | 能做什么 |
| --- | --- |
| 💰 实时薪资 | 根据工资、上下班时间、午休和生活成本，实时计算今天已经赚到的钱 |
| ⏱️ 薪资速率 | 自动换算日薪 / 时薪 / 分钟薪资 / 秒薪 |
| 🎯 心愿清单 | 把物品价格换算成连续工时和实际工作日，购买后自动进入支出汇算 |
| 🐟 摸鱼 | 开始 / 结束计时，计算本次摸鱼对应的工资 |
| 📊 汇算 | 按日 / 月 / 年查看收入、支出、结余和每一笔来源 |
| ⚡ 意外 | 记录不影响工资计算的意外收入或意外支出 |
| 📦 我的好物 | 记录已拥有的物品，观察持有时间增长后每小时成本如何下降 |
| 📱 多端使用 | Web、iPhone PWA、Android APK 共用同一套核心产品逻辑 |
| 🔄 Android 更新 | 自动检查 GitHub Release，新版可在 App 内发起下载并由系统确认覆盖安装 |

## 直接使用

### Web

直接打开：

**https://money-dance-6gl.pages.dev/**

### iPhone / iPad

不需要 Apple Developer 账号，也不需要 App Store。

1. 使用 Safari 打开 `https://money-dance-6gl.pages.dev/`
2. 点击「分享」
3. 选择「添加到主屏幕」
4. 从桌面打开 Money Dance

安装一次即可。普通 UI 和功能更新后，不需要重新添加到主屏幕；重新打开应用会优先获取最新线上版本。

### Android

推荐直接从 GitHub Releases 下载最新版 APK：

**https://github.com/cshouuu/money-dance/releases/latest**

下载 `money-dance-vX.Y.Z.apk` 后即可安装，不需要 Google Play。

正式 APK 使用固定 Release keystore 签名。安装首个固定签名版本后，后续版本可以直接覆盖升级而无需卸载。App 会定期检查 GitHub Releases，也可以在「我的 → 应用更新」手动检查；发现新版后可在应用内发起 APK 下载，最后一步仍由 Android 系统安装器要求用户确认。

> 早期测试 APK 使用的是临时 debug 签名。如果设备上装的是旧 debug APK，第一次迁移到正式固定签名版本时需要先卸载旧版一次；此后即可长期覆盖升级。

## 技术架构

```text
Money Dance
├── apps/web                 React + Vite + TypeScript
│   ├── Web / PWA
│   └── Capacitor Android UI + native updater bridge
│
├── apps/api                 Hono + TypeScript
│   └── Vercel
│
├── packages/core            前后端共享计算规则与类型
│
└── docs                     产品与移动端文档
```

### 技术栈

- React
- TypeScript
- Vite
- Capacitor 8
- Hono
- npm workspaces
- Cloudflare Pages
- Vercel
- GitHub Actions

## 本地开发

要求：Node.js 20+。

```bash
npm ci
npm run dev:web
```

启动 API：

```bash
npm run dev:api
```

默认 Web 地址：

```text
http://localhost:5173
```

## 测试与构建

```bash
npm test
npm run typecheck
npm run build
npm audit
```

主分支和 PR 会通过 GitHub Actions 自动执行依赖审计、测试、类型检查和构建。

## Android APK

Android 使用现有 React/Vite 前端作为唯一 UI，通过 Capacitor 生成原生 Android 工程，因此不需要维护另一套 React Native / Flutter 代码。

原生层只承担 Android 专属能力，例如读取 App 版本、APK 下载与调用系统安装器。详细说明见：

[`docs/MOBILE.md`](docs/MOBILE.md)

## 发布新版本

Web 在 `main` 更新后会由 GitHub Actions 自动部署到 Cloudflare Pages。

Android 使用 Git Tag 驱动发布，正式 Tag 必须符合 `vMAJOR.MINOR.PATCH`。

例如发布 `v0.2.0`：

```bash
git checkout main
git pull
git tag v0.2.0
git push origin v0.2.0
```

之后 GitHub Actions 会自动完成：

```text
Tag v0.2.0
   ↓
解析 versionName / versionCode
   ↓
构建 Web + Capacitor Android
   ↓
恢复固定 Release keystore
   ↓
签名 Release APK
   ↓
校验 APK 签名 + SHA-256
   ↓
创建 GitHub Release
   ↓
money-dance-v0.2.0.apk
money-dance-v0.2.0.apk.sha256
   ↓
已安装 Money Dance 自动发现新版
```

固定签名通过以下 GitHub Actions repository secrets 注入，私钥文件不会提交到 Git：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

缺少任何一个签名 Secret 时，Tag 发布会直接失败，避免产生无法继续覆盖升级的错误版本。

## 部署

### Web — Cloudflare Pages

- Build command: `npm run build -w @salary-flow/core && npm run build -w @salary-flow/web`
- Output: `apps/web/dist`
- Production: `https://money-dance-6gl.pages.dev/`

### API — Vercel

- Root Directory: `apps/api`
- Production API: `https://salary-flow-api.vercel.app`

## 数据与隐私

Money Dance 当前采用 local-first 策略。

以下数据默认保存在当前浏览器 / PWA / Android WebView 的本地存储中：

- 薪资与工作时间设置
- 心愿清单
- 摸鱼记录
- 意外收支
- 物品记录
- 汇算账本

这些数据不会因为打开 Web 页面就自动上传到服务器。

需要注意：Web、iPhone PWA 和 Android APK 是不同的本地存储容器，目前不会自动跨设备同步数据。

## Roadmap

- [x] 固定 Android Release 签名与应用内版本检查 / 更新
- [ ] 数据导入 / 导出
- [ ] 可选云同步
- [ ] Android 原生分享 / 触觉反馈 / 通知
- [ ] 更完整的 iOS 原生能力（在具备 Apple Developer 条件后）

---

<div align="center">

**Time is money. Money should dance.**

</div>
