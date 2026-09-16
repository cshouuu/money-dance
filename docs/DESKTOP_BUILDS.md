# Windows 与 macOS 安装包

从 0.4.4 开始提供四个独立构建目标：

| 设备 | 安装文件 | 标准 GitHub runner |
| --- | --- | --- |
| Windows 10/11，Intel / AMD 64 位 | `MoneyDance-0.4.7-windows-x64.exe` | `windows-latest` |
| Windows 11 ARM，骁龙等 ARM64 电脑 | `MoneyDance-0.4.7-windows-arm64.exe` | `windows-11-arm` |
| macOS 14+，Apple M 系列 | `MoneyDance-0.4.7-macos-arm64.dmg` | `macos-15` |
| macOS 14+，Intel Mac | `MoneyDance-0.4.7-macos-x64.dmg` | `macos-15-intel` |

每个 Mac 构建同时生成 ZIP，便于传输完整 `.app`。不要将 M 系列版和 Intel 版混用。Windows x64 原有安装与升级方式不变。

## 更新已有安装（无需先卸载）

更新前从托盘或应用菜单选择「退出 MoneyDance」。只关闭主窗口会继续在后台运行，不等于退出。

- **Windows x64 / ARM64**：下载与设备架构匹配的新版 `.exe`，直接运行安装器，沿用原安装位置即可。安装器会识别同一产品并替换旧程序，无需先去系统设置卸载。不要把新版安装到用户数据文件夹里。
- **Mac M 系列 / Intel**：下载匹配芯片的新版 DMG，打开后把 `MoneyDance.app` 拖入原来的“应用程序”位置，提示同名应用时选择「替换」，再启动。不要同时保留多个副本作为日常启动入口。未签名、公证版本仍可能触发系统安全检查，处理方法见下文。

安装目录只保存程序，用户数据独立保存在：

| 系统 | 数据目录 |
| --- | --- |
| Windows | `%APPDATA%\MoneyDance` |
| macOS | `~/Library/Application Support/MoneyDance` |

工资设置、心愿和记录使用此目录中的浏览器存储；桌宠设置、导入的动作包等也保存在此目录。覆盖安装不会主动删除它们。更新前如需额外备份，请先彻底退出应用，再复制整个数据目录到另一处，不要只复制 `desktop-pet.json`。还原同样需要先退出应用；旧版不一定能读取新版数据，不建议随意降级。

当前支持的是「下载新版后手动覆盖安装」，尚未接入桌面端自动检查、下载及安装更新，也尚未实现付费档位的更新授权限制。

### 发布时保持数据兼容

后续版本必须保持 `appId = com.moneydance.desktop`、产品名称 `MoneyDance`、用户数据目录、默认持久化会话和本地页面来源 `moneydance://app` 稳定。Windows 安装器继续使用 `deleteAppDataOnUninstall: false`；不要在安装/卸载钩子里清理用户目录。数据结构变化必须做兼容迁移，不能通过清空存储处理。

打包验证会在独立临时用户目录中测试工资、发薪日、桌宠动作包和角色设置重启保留。还可以传入新旧版本的可执行文件，验证旧版写入、新版读取：

```sh
node apps/desktop/scripts/verify-package.cjs "新版可执行文件路径" "旧版可执行文件路径"
```

该测试不执行系统安装器，不能替代 Windows 安装器覆盖安装和 Mac Finder 替换应用的实际验收。

2026-09-16 本机验证：从 Windows x64 0.4.6 安装包提取的旧程序写入测试数据，0.4.7 程序连续启动两次，工资 19000、发薪日 10、导入动作包及绑定、桌宠昵称、金额隐藏设置均保留；切换预制角色后再次启动也保留选择。测试使用独立临时用户目录，未修改实际用户数据。本次未执行 Mac 或 Windows ARM64 的跨版本实机测试。

## 云端构建与下载

工作流为 `.github/workflows/build-windows.yml`，Actions 中显示为 **Build Desktop Installers**。相关 PR、当前 feature 分支的代码推送或手动运行均可触发。使用公开仓库的标准 runner，没有大型付费 runner，也不会自动发布 Release。

四个任务在各自平台和架构上安装依赖、运行测试、构建、启动真正的安装包内应用、验证本地抠图、动作包导入和三位内置桌宠，并退出重启确认动作包、角色选择与昵称保留。桌宠集成测试覆盖真实窗口的贴边、气泡、透明像素命中、后台计薪及动作包互动。架构断言防止用 x64 模拟进程冒充 ARM64 验证。

成功后，在该次 Actions 运行页面下载 `money-dance-windows-arm64`、`money-dance-macos-arm64`、`money-dance-macos-x64` 等 artifact；包含安装器、SHA-256 校验文件和集成截图。产物保留 **7 天**，应及时下载。Actions 产物下载通常需要登录 GitHub；长期对外下载应在明确发布版本时将安装器上传到 GitHub Releases。

## Mac 首次安装

1. 下载匹配芯片的 DMG，将 MoneyDance 拖入“应用程序”，推出磁盘映像。
2. 首次尝试打开。此测试版没有 Apple Developer ID 身份签名，也没有 Apple 公证，系统可能拦截。
3. 确认来自本项目且校验值一致后，可按照 [Apple 官方说明](https://support.apple.com/zh-cn/102445)，进入“系统设置 → 隐私与安全性 → 仍要打开”，确认启动。

构建使用免费 ad-hoc 代码签名，满足 Apple Silicon 的代码完整性要求；它不认证开发者身份，也不消除 Gatekeeper 提醒。无需购买开发者账号即可构建。不要要求用户全局关闭 Gatekeeper。若提示损坏或恶意软件，应检查构建、签名和下载完整性，不能直接视为普通的未知开发者提示。组织管理的电脑可能不允许手动放行。

自动验证不能代替不同 macOS 版本、多显示器、Spaces、全屏应用和 Gatekeeper 首次下载流程的人工验收。

## 平台行为

- macOS 有标准编辑菜单和快捷键，点击 Dock 图标重新打开主窗口。关闭主窗口后仍在菜单栏和桌宠中运行；从应用菜单或菜单栏选择退出才结束。
- 桌宠保持透明、置顶，可在不同工作区显示。屏幕工作区遵循菜单栏与 Dock 的占用范围。
- 开机启动默认关闭，登录启动时隐藏主窗口。Mac 请先移动到“应用程序”，再打开登录启动设置。
- 系统通知依赖系统权限，默认关闭。桌宠气泡不需要系统通知权限。
- Mac 数据保存在 `~/Library/Application Support/MoneyDance`；Windows 在 `%APPDATA%/MoneyDance`。各设备数据独立，不自动同步。
- 自定义桌宠优先导入本地动作包，无生成服务与按次费用。图片抠图同样离线：Windows 与 M 系列使用 ONNX Runtime 原生 CPU 库，Intel Mac 使用同版本 WASM CPU 库，因为上游 1.24 起不再提供 Intel Mac 原生二进制。Intel 首次抠图可能稍慢，放在独立工作线程中执行，保留取消和超时处理。

## 本机构建

Node.js 22.12+，运行 `npm ci`，然后：

```sh
npm run build -w @salary-flow/core
npm run build -w @salary-flow/web
npm run build -w @salary-flow/desktop
# 按目标选择一条，推荐在相同 OS / 架构运行：
npm run dist:win -w @salary-flow/desktop
npm run dist:win:arm64 -w @salary-flow/desktop
npm run dist:mac:arm64 -w @salary-flow/desktop
npm run dist:mac:x64 -w @salary-flow/desktop
node apps/desktop/scripts/verify-package.cjs
node apps/desktop/scripts/checksums.cjs
```

Windows 可以交叉生成 ARM64 安装包，但不能在 x64 电脑上验证 ARM64 原生运行。Mac DMG 与 ad-hoc 签名由 macOS CI 完成。工作流明确 `publish: never`，不需要 Apple 密钥或发布令牌。


## 0.4.5 多平台验证

2026-09-15 已在 Windows ARM64、Apple Silicon 与 Intel Mac 原生 runner 上完成 0.4.5 构建。三个安装包均包含小薪、米粒、缓缓，安装后的三次启动验证和桌宠集成测试全部通过，下载后的 SHA-256 与云端产物一致。

本次构建提交：`1e90867b238cbd1d31e473da6ad0ba43e1c1f379`。构建记录：https://github.com/cshouuu/money-dance/actions/runs/34941485128 。实际文件摘要及来源保存在本地 `apps/desktop/release/BUILD-INFO-0.4.5.json`。

修正了测试程序在访问 `/pet` 后仍用首页 URL 识别 Mac 主窗口的问题。现在通过窗口 ID 验证隐藏后 Dock 能恢复同一窗口；没有跳过 Dock 检查。


## 0.4.7 多平台同步

2026-09-16 已将 Windows ARM64、Mac M 系列和 Mac Intel 同步到 0.4.7，包含桌边搭子页面主题同步修复及 72px 收起侧栏调整。四个平台的原生构建、包内运行、三次启动和桌宠集成测试均通过。

构建提交：`1e2c526c396a4d2c5b7f6e32095ca15fd8a24110`。构建记录：https://github.com/cshouuu/money-dance/actions/runs/35045660460 。安装包与校验文件保存于 `apps/desktop/release/`，来源摘要见 `BUILD-INFO-0.4.7.json`。
