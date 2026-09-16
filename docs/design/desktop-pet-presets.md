# 三位内置桌面伙伴

保留奶油猫「小薪」，新增垂耳兔「米粒」和水豚「缓缓」。三位角色都提供工作、摸鱼、加班、休息、摸摸、庆祝六组动作，每组八张姿势，共 144 张。收入汇报、休息提醒、专注、里程碑和暖心鼓励沿用已有业务状态。

米粒用桃色蝴蝶结、抱萝卜、垂耳入睡和抱星星庆祝表现元气感。缓缓用头顶小叶子、抱橘子躺平、递温茶和趴着休息表现松弛感。小薪的原有形象与动作不变。两套新增动作使用已绘制的独立肢体姿势，复用有限次互动和分段循环的时间轴；角色提示词按实际道具和身体特征适配。

「我的桌宠」顶部可点击三张卡片预览六种动作，点击「就选…」后切换。预览取消不会替换当前角色或动作包。保存的 presetId 默认兼容旧版本小薪，未知值回退小薪；名字为默认角色名时随角色变化，用户自己的昵称保留。选择结果通过原有设置广播同步到桌宠窗口，并写入 desktop-pet.json。

## 素材

- `apps/web/src/pet/assets/mili-atlas-v1.png`：1448 × 1086，RGBA，48 帧。
- `apps/web/src/pet/assets/huanhuan-atlas-v1.png`：1448 × 1086，RGBA，48 帧。
- 对应 JSON 存储逐帧取景和落地线。通过读取 alpha 连通区域确定取景，不改写原 PNG；统一视口容纳耳朵、橘子和横躺姿势。
- 使用 Codex 内置 image_gen 生成；没有使用 CLI/API fallback。最终素材已复制到项目，通过 Vite 内容哈希打包和离线缓存。应用运行期间不调用生成服务，没有用户生成费用。

## 最终生成提示词

### 米粒

```text
Use case: stylized-concept. Create ONE production-ready transparent PNG sprite atlas for an offline desktop pet, exactly 8 columns x 6 rows (48 poses), 2048x1536 canvas. Subject SAME adorable plush white LOP-EARED BUNNY in all cells, soft long floppy ears hanging on either side, round mochi body, tiny chocolate eyes, rosy cheeks, distinctive pale peach neck bow. Premium soft dimensional storybook illustration, fine fur, warm light, restrained detail, appealing at 160px. True transparent alpha, no fake checkerboard, no text/grid/labels. Each cell equal size, generous 14% safe margins, ears/props MUST stay inside own cell. Consistent character scale and baseline, no overlap. Each row eight progressive different limb/body/expression poses left to right. Row1 WORK: sits at small peach laptop, looks at screen, alternates left/right paws typing, ears gently lift with interest, thinking blink, smiles, back to typing. Row2 SLACK: looks left then right, reaches for orange carrot plush, lifts it, hugs with both paws, cheek nuzzles carrot, leans back, lies cuddling carrot. Row3 OVERTIME: sleepy eyes, one paw rubs eye, lowers paw, reaches for peach mug, holds warm mug, extends mug with both paws toward viewer kindly, sips, settles. Row4 REST: yawns, head lowers, folds paws, ears settle like blanket, lies curled asleep, then three slightly different sleeping breathing poses. Row5 PETTING: sits, looks up, tilts head, closes eyes, nuzzles upwards, folds ears happily, stretches paws, returns seated. Row6 CELEBRATE: crouches, raises paws, jumps, paws overhead ears bouncing, lands squashed, holds golden star badge, hugs star proudly eyes shut, content holding star. Actual drawn pose changes, not rotated static images. Tiny soft alpha contact shadow only, no scenery. Keep each pose fully isolated. Output exactly one complete 48-pose atlas.
```

### 缓缓

```text
Use case: stylized-concept. Create ONE production-ready transparent PNG desktop pet animation sprite atlas, exactly 8 columns x 6 rows, 48 poses. Canvas 2048x1536. Subject same cute CAPYBARA in every cell, warm caramel brown plush fur, rounded rectangular broad snout, tiny round ears, relaxed dark eyes, stubby limbs and round belly, tiny sage leaf resting on head. Recognizably capybara, no cat ears, no bunny ears, no tail. Premium soft dimensional storybook illustration like adorable plush collectible with subtle furry edges and warm shading, readable at160px. True transparent alpha background, no fake checkerboard, text, grid, labels or scenery. Even cells with at least12% transparent safe space, consistent scale and feet baseline; isolate every pose and prop in own cell. Each row EIGHT progressive actual drawn pose changes left to right. Row1 WORK: seated at small teal laptop, gazes at screen, left paw types, right paw types, pauses thinking with paw near snout, slow blink, relaxed smile, resumes. Row2 SLACK: glances left, glances right, reaches for mandarin orange, lifts orange with both paws, holds orange against cheek, sniffs delighted, leans back with orange on belly, lies relaxed orange on belly. Row3 OVERTIME: sleepy, rubs eye with paw, lowers paw, reaches for rounded sage ceramic teacup, holds cup, extends both paws offering tea to viewer, sips, rests holding cup. Row4 REST: yawns, head nods, paws fold, body lowers, lies curled asleep, then three slight breathing variations asleep. Row5 PETTING: alert sitting, looks up, tilts head, eyes close, lifts chin for a scratch, cuddly cheek nuzzle, stretches both forepaws, settles content. Row6 CELEBRATE: crouches, lifts paws, little hop, both paws overhead, lands belly squashed, holds golden coin, hugs coin eyes closed, content with coin. Keep distinctive snout and leaf consistent in all48 poses. All props fully illustrated no emoji. Soft alpha contact shadows only. No cut-off ears or props. Output one complete atlas.
```

## 验证结果（0.4.5）

- npm test：720 项通过（Web 680、桌面 25、core 15）。
- Web TypeScript、生产构建、PWA 资源校验通过。
- 桌面集成测试：三角色预览与确认、六组动作、页面重载、保存状态、昵称保留、原有动作包流程和桌面贴边/透明区点击穿透通过。
- Windows x64 安装包内程序三次实际启动：照片提取、动作包保存重启、切换米粒再重启、包内 PNG 读取均通过。
- 本次本机安装包：MoneyDance-0.4.5-windows-x64.exe；其他架构沿用仓库跨平台构建配置，本次未重新构建。

## 后续多平台安装包更新

0.4.5 的 Windows ARM64、Mac M 系列、Mac Intel 安装包已由 GitHub Actions 完成构建，并通过对应原生平台的安装、三次启动和桌宠集成验证。构建与安装说明见 ../DESKTOP_BUILDS.md。

## 0.4.6 换肤修复

桌边搭子页面原先使用固定奶油绿颜色，角色卡片又通过内联背景覆盖 CSS。现已统一使用应用的 paper、control、accent、line、ink 等主题变量，覆盖卡片、预览场景、气泡、动作按钮、导入区域、开关、表单和状态提示；删除预制角色数据中的界面背景色。角色 PNG 素材保持原样。

在独立临时用户目录中通过真实换肤面板逐个选择全部 12 套主题，核对卡片、主按钮、选中角色、开关、背景渐变的实际计算颜色，以及刷新后的主题保留；全部通过。主题、可读性与角色相关测试 189 项通过，Web 构建与 PWA 校验通过。本次提供 Windows x64 0.4.6 修复安装包，其他架构的现有安装包仍为 0.4.5。
