<div align="center">

# 💸 MoneyDance

**今天的时间，正在变成钱。**

实时薪资 · 心愿清单 · 摸鱼 · 加班 · 账本 · 薪苦日历 · 物品持有成本

[🌐 在线体验](https://money-dance-6gl.pages.dev/) · [📱 Android v0.2.22（Cloudflare R2）](https://money-dance-6gl.pages.dev/download/releases/money-dance-v0.2.22.apk) · [📦 版本记录](https://github.com/cshouuu/money-dance/releases) · [🛠️ GitHub Actions](https://github.com/cshouuu/money-dance/actions)

![CI](https://github.com/cshouuu/money-dance/actions/workflows/ci.yml/badge.svg)
![Android APK](https://github.com/cshouuu/money-dance/actions/workflows/build-android-apk.yml/badge.svg)
![Cloudflare Pages](https://github.com/cshouuu/money-dance/actions/workflows/deploy-cloudflare-pages.yml/badge.svg)

</div>

---

## MoneyDance 是什么？

MoneyDance 是一个围绕「时间 × 工资 × 消费」构建的 local-first 个人财务工具。

它把工资从月底才出现的一串数字，拆成日薪、时薪、分钟薪资和秒薪，让你随时看到今天已经赚了多少钱；也能把心愿价格换算成需要工作的时间，记录摸鱼和加班的真实收益，并通过账本与薪苦日历还原每一天的收入、支出和出勤。

项目不要求注册账号。薪资设置、计时记录、心愿、物品、出勤和账本数据默认保存在当前设备本地。

**当前稳定版：v0.2.22**

## 当前功能

| 模块 | 能做什么 |
| --- | --- |
| 💰 今日 | 根据薪资、作息、午休、生活成本和出勤情况，实时计算今日已赚金额与工作进度 |
| 🕘 固定 / 弹性上班 | 固定作息自动计薪；弹性作息可在实际开工时开始，也能只调整当天的计薪方式 |
| 🎯 心愿清单 | 把价格换算成连续纯工时和实际工作日；首页只展示心愿，增删改在清单页面完成 |
| 🐟 摸鱼 | 开始、结束和删除摸鱼记录，统计每次及历史摸鱼收益 |
| 💼 加班 | 记录无加班费、工资倍率或固定金额的加班；支持历史记录与收益统计 |
| 📒 账本 | 按日 / 月 / 年查看收入、支出和结余，通过收支日历筛选明细，并手工新增、编辑或删除记录 |
| 📅 薪苦日历 | 调整每天的正常上班、请假 / 特殊出勤或放假状态，并同步重算历史工作收入 |
| ⚡ 意外收支 | 记录不会改变工资速度、但需要进入账本统计的临时收入或花费 |
| 📦 我的好物 | 记录已购买物品及持有时间，持续观察每小时使用成本 |
| 📱 多端使用 | 支持 Web、iPhone / iPad PWA 和 Android APK |
| 🔄 Android 更新 | 应用内检查新版本，通过 Cloudflare R2 下载 APK，并由 Android 系统确认覆盖安装 |

## 关键业务规则

这些规则是当前产品行为，也是后续开发需要保持一致的基线：

- 所有业务日期按用户设备的本地日期计算，不使用 UTC 日期直接归档。
- 固定作息会按用户设置的工作日自动计薪；休息日不会在首页自动计算工资。
- 弹性作息既可设为默认，也可只对当天临时启用；工作中按实际计薪时长实时增长，时薪用户提前结束时按实际时长结算，月薪 / 年薪 / 日薪用户提前结束时可选择按实际时长、正常出勤全天工资或前往薪苦日历调整。
- 固定工作周支持每周 1–7 个工作日；修改后自动推荐对应的月平均工作日，用户仍可手工调整。
- 大小周按“大周周六上班、小周周末休息”自动交替，并推荐月平均工作日。
- 薪资设置可选择是否应用至历史；启用后由用户指定历史生效开始日期。
- 历史日期只要存在手工出勤或固定金额调整，就应进入账本计算，不受“薪资是否应用至历史”限制。
- 薪苦日历中的手工出勤设置优先于自动工作日判断，并会重新计算账本中的对应工资收入；正常出勤可使用默认工资，也可按标准日薪倍率或固定金额覆盖当天工资。
- 请假 / 特殊出勤支持事假、病假、年假、调休、婚假、产假、产检假、陪产假、育儿假、丧假和远程工作。
- 放假支持带薪假和无薪假；计薪时可按工资倍率或固定金额计算。
- 加班收入统一归属到加班开始当天，不因跨日而拆分到多个日期。
- 用户手工编辑或删除过的历史账本明细不会被自动迁移逻辑强行覆盖。
- 删除记录、清空历史和删除物品等破坏性操作必须经过二次确认。

## 直接使用

### Web

直接打开：

**https://money-dance-6gl.pages.dev/**

### iPhone / iPad

无需 App Store：

1. 使用 Safari 打开 `https://money-dance-6gl.pages.dev/`
2. 点击「分享」
3. 选择「添加到主屏幕」
4. 从桌面打开 MoneyDance

普通页面与功能更新后不需要重新添加到主屏幕，重新打开应用会优先获取最新线上版本。

### Android

国内用户推荐通过 Cloudflare R2 下载当前正式版：

**https://money-dance-6gl.pages.dev/download/releases/money-dance-v0.2.22.apk**

也可以在 [GitHub Releases](https://github.com/cshouuu/money-dance/releases/latest) 查看版本说明和校验文件。

正式 APK 使用固定 Release keystore 签名。安装固定签名版本后，后续版本可以直接覆盖升级，无需卸载。应用会自动检查更新，也可以在「我的 → 应用更新」中手动检查。

> 早期测试 APK 使用临时 debug 签名。如果设备仍安装旧 debug APK，第一次迁移到正式固定签名版本时需要先卸载一次；此后即可持续覆盖升级。

## 工作方式与账本关系

~~~text
薪资与工作时间设置
        │
        ├── 固定工作周 / 大小周
        ├── 固定作息 / 弹性作息
        └── 历史薪资生效日期
                 │
                 ▼
           每日工作收入
                 │
薪苦日历调整 ────┤
摸鱼 / 加班 ─────┤
心愿购买 / 意外 ─┤
手工收支明细 ────┘
                 │
                 ▼
          日 / 月 / 年账本
~~~

账本中的工作收入会根据薪资配置、工作周安排和薪苦日历动态生成；用户手工录入的收支明细、加班收入、心愿购买支出与意外收支则作为独立账目参与统计。

## 技术架构

~~~text
MoneyDance
├── apps/web                 React + Vite + TypeScript
│   ├── Web / PWA
│   ├── Cloudflare Pages Functions（R2 下载代理）
│   └── Capacitor Android UI + 原生更新桥接
│
├── apps/api                 Hono + TypeScript
│   └── Vercel
│
├── packages/core            前后端共享计算规则与类型
│
├── docs                     产品、计算规则与移动端文档
│
└── .github/workflows        CI、Web 部署与 Android 发布
~~~

### 技术栈

- React 19
- TypeScript
- Vite
- Vitest
- Capacitor 8
- Hono
- npm workspaces
- Cloudflare Pages + R2
- Vercel
- GitHub Actions

## 本地开发

要求：Node.js 20+。

~~~bash
git clone https://github.com/cshouuu/money-dance.git
cd money-dance
npm ci
npm run dev:web
~~~

默认 Web 地址：

~~~text
http://localhost:5173
~~~

单独启动 API：

~~~bash
npm run dev:api
~~~

## 测试与构建

~~~bash
npm test
npm run typecheck
npm run build
npm audit
~~~

主分支和 Pull Request 会通过 GitHub Actions 自动执行依赖审计、测试、类型检查和构建。

## Android APK

Android 复用现有 React / Vite 前端作为唯一 UI，通过 Capacitor 生成原生 Android 工程，不维护另一套 React Native 或 Flutter 代码。

原生层只承担 Android 专属能力，包括读取应用版本、下载安装包、校验下载来源以及调用系统安装器。详细说明见 [`docs/MOBILE.md`](docs/MOBILE.md)。

## 发布流程

### Web

`main` 更新后，GitHub Actions 自动构建并部署到 Cloudflare Pages。

### Android

Android 使用 Git Tag 驱动正式发布，Tag 必须符合 `vMAJOR.MINOR.PATCH`。

例如：

~~~bash
git checkout main
git pull
git tag -a v0.2.23 -m "MoneyDance v0.2.23"
git push origin v0.2.23
~~~

发布流水线会自动完成：

~~~text
Tag v0.2.23
   ↓
解析 versionName / versionCode
   ↓
构建 Web + Capacitor Android
   ↓
恢复固定 Release keystore
   ↓
生成并校验签名 APK + SHA-256
   ↓
上传 APK 与 latest.json 到 Cloudflare R2
   ↓
通过 Cloudflare Pages 验证清单版本与 APK 下载响应
   ↓
创建 GitHub Release 并上传 APK、SHA-256 与更新清单
   ↓
已安装的 MoneyDance 检测到新版本
~~~

R2 最多保留最近 10 个正式 APK，旧版本由发布流水线自动清理。

### 发布所需 Secrets

Android 固定签名：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Cloudflare R2：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

缺少签名或 R2 发布凭据时，正式发布会失败，避免产生无法覆盖升级或无法下载的错误版本。

## 部署

### Web — Cloudflare Pages

- Build command：`npm run build -w @salary-flow/core && npm run build -w @salary-flow/web`
- Output：`apps/web/dist`
- Production：`https://money-dance-6gl.pages.dev/`
- R2 bucket：`money-dance-releases`

### API — Vercel

- Root Directory：`apps/api`
- Production API：`https://salary-flow-api.vercel.app`

仓库内部部分 workspace 包名和 API 地址仍保留早期的 `salary-flow` 标识，这是技术兼容名称；对外产品品牌统一使用 **MoneyDance**。

## 数据与隐私

MoneyDance 当前采用 local-first 策略，以下数据默认保存在当前浏览器、PWA 或 Android WebView 的本地存储中：

- 薪资、生活成本与工作时间设置
- 固定工作周 / 大小周和弹性作息状态
- 心愿清单与已购买记录
- 摸鱼和加班记录
- 出勤、请假与放假调整
- 意外收支与手工账本明细
- 物品及持有成本记录

这些数据不会因为打开 Web 页面就自动上传到服务器。

Web、iPhone PWA 和 Android APK 属于不同的本地存储容器，目前不会自动跨设备同步。卸载应用、清除浏览器数据或更换设备前，请留意本地数据可能丢失。

## 开发协作基线

- 功能开发通过独立分支和 Pull Request 合入 `main`。
- 任何薪资、出勤、跨日和账本逻辑变更，都需要同时覆盖本地日期与历史数据场景。
- 移动端弹窗必须锁定页面滚动和底部导航，支持点击遮罩关闭，且新增 / 编辑表单不应默认唤起输入法。
- 破坏性操作必须有语义明确的二次确认。
- 发布 Android 前必须确认 Tag 指向最新 `main`，并等待 APK、R2、更新清单和 GitHub Release 全部验证成功。

## Roadmap

- [x] 实时薪资、固定 / 弹性作息和生活成本
- [x] 心愿清单、摸鱼、加班、账本与薪苦日历
- [x] 固定工作周、大小周和历史收入重算
- [x] Android 固定签名、应用内更新和 Cloudflare R2 分发
- [ ] 数据导入 / 导出
- [ ] 可选云同步
- [ ] Android 桌面小组件与实时金额展示
- [ ] 更完整的 iOS 原生能力

---

<div align="center">

**Time is money. Money should dance.**

</div>
