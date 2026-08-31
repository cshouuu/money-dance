<div align="center">

# 💸 MoneyDance

**今天的时间，正在变成钱。**

实时薪资 · 心愿清单 · 摸鱼 · 加班 · 账本 · 薪苦日历 · 物品持有成本

[🌐 在线体验](https://money-dance-6gl.pages.dev/) · [📱 Android v0.2.26（Cloudflare R2）](https://money-dance-6gl.pages.dev/download/releases/money-dance-v0.2.26.apk) · [📦 版本记录](https://github.com/cshouuu/money-dance/releases) · [🛠️ GitHub Actions](https://github.com/cshouuu/money-dance/actions)

![CI](https://github.com/cshouuu/money-dance/actions/workflows/ci.yml/badge.svg)
![Android APK](https://github.com/cshouuu/money-dance/actions/workflows/build-android-apk.yml/badge.svg)
![Cloudflare Pages](https://github.com/cshouuu/money-dance/actions/workflows/deploy-cloudflare-pages.yml/badge.svg)

</div>

---

## MoneyDance 是什么？

MoneyDance 是一个围绕「时间 × 工资 × 消费」构建的 local-first 个人财务工具。

它把工资从月底才出现的一串数字，拆成日薪、时薪、分钟薪资和秒薪，让你随时看到今天已经赚了多少钱；也能把心愿价格换算成需要工作的时间，记录摸鱼和加班的真实收益，并通过账本与薪苦日历还原每一天的收入、支出和出勤。

项目不要求注册账号。薪资设置、计时记录、心愿、物品、出勤和账本数据默认保存在当前设备本地。

**当前稳定版：v0.2.26**

## 当前功能

| 模块 | 能做什么 |
| --- | --- |
| 💰 今日 | 根据薪资、作息、午休、生活成本和出勤情况，实时计算今日已赚金额与工作进度 |
| 🕘 固定 / 弹性上班 | 固定作息自动计薪；弹性作息可记录实际起止和预计结束时间，并在结束时分别处理不足与超出目标的工时 |
| 🎯 心愿清单 | 把价格换算成连续纯工时和实际工作日；首页只展示心愿，增删改在清单页面完成 |
| 🐟 摸鱼 | 实时计时或补记遗漏时段，统计每次及历史摸鱼收益；记录图标会随时长变化，并按永久累计时长点亮五级成就勋章 |
| 💼 加班 | 实时计时或补记遗漏时段，可选择无加班费、工资倍率或固定金额；记录图标和永久成就会随时长升级 |
| 📒 账本 | 按日 / 月 / 年查看收入、支出和结余，通过收支日历筛选明细，并手工新增、编辑或删除记录 |
| 📅 薪苦日历 | 自动识别内置的 2025–2026 年中国大陆法定节假日与调休补班（不自动套用加班倍率）；支持正常上班、半天 / 全天请假和放假调整，并同步重算工资 |
| ⚡ 意外收支 | 记录不会改变工资速度、但需要进入账本统计的临时收入或花费 |
| 📦 我的好物 | 记录已购买物品及持有时间，持续观察每小时使用成本 |
| 📱 多端使用 | 支持 Web、iPhone / iPad PWA 和 Android APK |
| 🔄 Android 更新 | 应用内检查新版本，通过 Cloudflare R2 下载 APK，并由 Android 系统确认覆盖安装 |
| 🧩 Android 桌面组件 | 紧凑 4×1 组件展示实时收益，并提供摸鱼 / 加班操作 |

## 关键业务规则

这些规则是当前产品行为，也是后续开发需要保持一致的基线：

- 所有业务日期按用户设备的本地日期计算，不使用 UTC 日期直接归档。
- 固定跨日班次按开始当天判断出勤与节假日；按日生成的工资、生活成本和工资覆盖会保存独立的本地业务日期，设备时区变化不会把这些账目移动到前后一天。
- 固定作息会按用户设置的工作日自动计薪；休息日不会在首页自动计算工资。
- 弹性作息既可设为默认，也可只对当天临时启用；开始时可以填写实际开始时间和预计结束时间。达到预计结束时间后停止继续累计；应用在前台时立即进入结算，若当时在后台，则在下次恢复时进入结算。
- 弹性工作未达到目标工时时，若当天没有薪苦日历工资覆盖，由用户选择按实际时长、完整日薪或前往薪苦日历调整；已有覆盖时直接以薪苦日历结果为准。刚好达到目标时按完整日薪结算；超过目标时正常部分按完整日薪或当天出勤覆盖金额结算，超出部分再选择不计薪、工资倍率或固定金额，并生成独立加班记录。
- 固定工作周支持每周 1–7 个工作日；修改后自动推荐对应的月平均工作日，用户仍可手工调整。
- 大小周按“大周周六上班、小周周末休息”自动交替，并推荐月平均工作日。
- 薪资设置可选择是否应用至历史；启用后由用户指定历史生效开始日期。
- 历史日期只要存在手工出勤或固定金额调整，就应进入账本计算，不受“薪资是否应用至历史”限制。
- 薪苦日历中的手工出勤设置优先于自动工作日判断，并会重新计算账本中的对应工资收入；正常出勤可使用默认工资，也可按标准日薪倍率或固定金额覆盖当天工资。
- 请假 / 特殊出勤支持事假、病假、年假、调休、婚假、产假、产检假、陪产假、育儿假、丧假和远程工作；请假可选择全天、上午或下午。
- 放假支持带薪假和无薪假；计薪时可按工资倍率或固定金额计算。
- 中国大陆节假日日历默认从升级后首次加载该功能的设备本地日期生效，关闭后重新开启则从重新开启当天生效；当前内置 2025 和 2026 年国务院公布安排。手工出勤或当日已保存的工作记录优先于官方日历，官方调休补班优先于固定工作周 / 大小周；未知年份退回用户自己的工作周设置。
- 官方日历不会自动应用 2 倍或 3 倍工资。月薪 / 年薪用户仅法定假日本身保留一倍正常日薪，调休休息日不重复生成工资；日薪 / 时薪用户仍以实际出勤或手工调整为准。
- 生活成本可继续直接从工资速度中扣除，也可按当月天数拆成每日账本支出；每日模式从首次选择当天生效，采用分币分摊保证整月配置不变时合计准确。生活成本模式和金额按本地业务日期保存，后续修改或关闭只影响当天及以后，既不会改写过去工资口径，也会保留过去的每日支出；工资覆盖会记录金额是否已扣生活成本，避免切换模式时重复扣除。
- 加班收入统一归属到加班开始当天，不因跨日而拆分到多个日期。
- 摸鱼和加班采用轻量补时：开始计时时可把实际开始时间回填到现在之前，也可在结束后一次性补记完整起止时段；不支持预约未来时间或由后台自动开始。补记不能与已有或进行中的同类记录重叠，跨日收入仍归属开始日期。
- Android 桌面组件仅面向系统主屏幕（`home_screen`），不扩展到锁屏、iOS 或 PWA；应用在计薪时段同步数据后会自动按秒刷新，用户也可从组件主动开启或停止当日实时模式。未启用实时模式时由系统约每 30 分钟低频刷新。
- 摸鱼可从桌面组件直接开始或结束；开始加班时进入应用并沿用现有计薪方式选择，进行中的加班可从桌面组件直接结束。
- 组件秒级更新依赖 `specialUse` 前台服务和常驻通知；午休等零费率区间会等待到下一计薪时间片，息屏时暂停组件重绘，亮屏后恢复。不同厂商的系统调度和 Launcher 仍可能产生延迟，因此秒级刷新属于尽力保证而非硬实时承诺。
- 摸鱼成就按累计 30 分钟、3 小时、10 小时、30 小时、100 小时分为五级；加班成就按累计 1 小时、10 小时、30 小时、100 小时、300 小时分为五级。
- 成就按历史记录初始化并持续累计；删除摸鱼或加班历史不会扣减累计时长，也不会撤销已点亮的勋章。
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

**https://money-dance-6gl.pages.dev/download/releases/money-dance-v0.2.26.apk**

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
│   └── Capacitor Android UI + 原生更新桥接 + 桌面组件
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

原生层只承担 Android 专属能力，包括读取应用版本、下载安装包、校验下载来源以及调用系统安装器；桌面组件也由原生层负责秒级重绘与桌面操作桥接。详细说明见 [`docs/MOBILE.md`](docs/MOBILE.md)。

## 发布流程

### Web

`main` 更新后，GitHub Actions 自动构建并部署到 Cloudflare Pages。

### Android

Android 使用 Git Tag 驱动正式发布，Tag 必须符合 `vMAJOR.MINOR.PATCH`。

例如：

~~~bash
git checkout main
git pull
git tag -a v0.2.26 -m "MoneyDance v0.2.26"
git push origin refs/tags/v0.2.26
~~~

发布流水线会自动完成：

~~~text
Tag v0.2.26
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
- 摸鱼和加班记录，以及对应的永久成就累计
- 出勤、请假与放假调整
- 意外收支与手工账本明细
- 物品及持有成本记录

这些数据不会因为打开 Web 页面就自动上传到服务器。Android 桌面组件只会把收益时间片和待处理动作保存在应用自己的 `SharedPreferences` 中，不会改变 local-first 边界。

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
- [x] 摸鱼 / 加班五级永久成就与勋章点亮
- [x] Android 4×1 主屏幕组件、按需实时金额与摸鱼 / 加班快捷操作
- [x] 中国大陆节假日 / 调休补班识别与半天请假
- [x] 摸鱼 / 加班遗漏时段补记与弹性工时分段结算
- [ ] 数据导入 / 导出
- [ ] 可选云同步
- [ ] 更完整的 iOS 原生能力

---

<div align="center">

**Time is money. Money should dance.**

</div>
