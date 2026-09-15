# MoneyDance 桌宠动作包（v1）

动作包只是用户提供的图片和播放配置，不包含 AI 生成、在线服务或可执行代码。导入和播放均在本地进行，无生成费用。默认小薪仍可直接使用。

## 导入与使用

1. Windows 版「我的桌宠」→「保存示例模板」。解压 ZIP，里面有可直接播放的小薪示例。
2. 用你自己的素材替换图片，修改 `pet.json` 中的名称、素材路径和帧时长。
3. 将 `pet.json` 与素材压缩为 ZIP。可以放在 ZIP 根目录，或同一个外层文件夹中。
4. 点击「选择 ZIP 动作包」。检查预览，调整工作、摸鱼、加班、休息、摸摸和庆祝对应的动作。
5. 点击「就用它，放到桌面」。导入成功前不会替换现有桌宠；确认后应用保存本地副本，原 ZIP 可以移动。

只需 `idle` 待机动作。其他动作可选，未提供时绑定到 `idle`。工作、摸鱼、加班、休息循环播放；摸摸、庆祝播放一遍后回到当前计薪状态。可在界面重新绑定动作，无需重新打包。收入汇报、提醒、专注计时继续使用产品原有数据。

## 基础结构

```json
{
  "version": 1,
  "name": "我的小搭子",
  "author": "素材作者（可选）",
  "animations": {
    "idle": { "file": "idle.gif", "stillFrame": 0 },
    "working": { "file": "working.webp" },
    "love": { "file": "petting.gif" }
  },
  "bindings": { "working": "working", "love": "love" }
}
```

`animations` 可定义 1～16 组动作，键名为小写英文字母开头的 1～24 个英文字母、数字、短横线或下划线，必须包含 `idle`。`bindings` 可省略；自动匹配同名动作，缺少时使用 `idle`。状态键为 `working`、`slacking`、`overtime`、`rest`、`love`、`celebrate`。`idle` 固定对应待机素材。

## 三种素材写法

每组动作只选择一种写法。

**GIF / 动画 WebP / 单张 PNG 或静态 WebP**

```json
{ "file": "actions/idle.gif", "stillFrame": 0 }
```

动画使用原始帧时长，低于 40 毫秒的帧按 40 毫秒播放。可用 `frameDurationMs` 覆盖每帧时长。静态 PNG 也是合法的待机素材，但不会自动产生新姿势。

**PNG / 静态 WebP 连续帧**

```json
{
  "frames": [
    { "file": "love/01.png", "durationMs": 150 },
    { "file": "love/02.png", "durationMs": 300 },
    { "file": "love/03.png", "durationMs": 600 }
  ],
  "stillFrame": 1
}
```

按数组顺序播放。省略 `durationMs` 时使用动作的 `frameDurationMs`，再省略则为 100 毫秒。各帧必须保持相同画布尺寸和角色比例，不要单独裁切每一帧，否则会发生位置跳动。

**规则精灵图（PNG / 静态 WebP）**

```json
{
  "sheet": { "file": "working.png", "frameWidth": 192, "frameHeight": 192, "count": 8 },
  "frameDurationMs": 120,
  "durationsMs": [400, 120, 120, 120, 120, 120, 120, 900],
  "stillFrame": 0
}
```

从左到右、从上到下播放前 `count` 格。图片尺寸必须可被帧尺寸整除。`durationsMs` 可选，提供时数量必须等于 `count`。`stillFrame` 是从 0 开始的帧编号，在应用或系统启用「减少动作」时显示，默认 0。

## 素材建议与限制

- 推荐透明背景、统一画布、脚底基线一致；建议每帧 192×192 或 256×256。大画布会等比缩小到最长边 256，不自动裁切、补画或抠图。
- 非透明素材可以导入，但会提示图片底色也会显示。GIF 的边缘透明质量通常不如透明 WebP 或 PNG。
- ZIP 最大 25 MB；单文件最大 15 MB，解压总计最大 80 MB、520 个条目；`pet.json` 最大 64 KB。
- 每组 1～120 帧，整个包最多 420 帧，每组一次播放最长 60 秒；显式帧时长为 40～10000 毫秒。
- 图片最长边 4096；单个动画解码像素总数最大 4000 万；处理后的所有动作图片总计不超过 32 MB。
- 只允许 PNG、GIF、WebP、JSON、TXT 和 Markdown 文件。不能使用远程 URL、绝对路径、`..`、脚本、HTML 或 SVG。素材路径使用 `/`。
- 只支持上述 MoneyDance v1 格式，不直接兼容其他桌宠软件的动作包。请使用你有权使用的素材。

## 示例模板来源

模板沿用项目已制作的小薪姿势图，仅重新排列为标准帧画布，没有调用新的生成服务。原始美术来源和提示词见 `docs/design/desktop-pet-v2.md`。
