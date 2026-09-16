# 桌宠 V2：角色与动作重做

用户反馈：默认形象不够好看，原有动作主要是图片晃动与更换图标，没有角色行为。

本次用奶油色绒毛猫咪、鼠尾草绿围巾、短爪与柔和表情重做小薪。默认角色使用 6 组共 48 张姿势帧，分别为工作、摸鱼、加班、睡觉、蹭蹭和庆祝。每组单独编排动作节奏、停顿和循环区间。睡眠不会反复重播入睡，加班不会反复揉眼，蹭蹭与庆祝演一次后归还当前业务状态。

`apps/web/src/pet/motion.ts` 定义每一拍的姿势、时长及行为提示。`usePetMotion.ts` 只在下一拍调度更新，隐藏窗口时停止调度；减少动作时显示有意义的静止姿势。每个姿势的独立取景范围与统一落地线记录在 JSON，避免机械等分图片切掉耳朵、切掉道具或显示相邻帧。原 PNG 没有进行图像重采样或背景修改。

照片主体没有不同肢体姿势，所以照片模式明确标注为“场景陪伴”；不会宣称给任意上传照片自动生成角色动画。照片周围改用项目绘制的电脑、热饮、鱼抱枕、小毯子与金币，不再使用 emoji 配件。

## 素材与来源

- 最终素材：`apps/web/src/pet/assets/xiaoxin-atlas-v2.png`
- 姿势取景：`apps/web/src/pet/assets/xiaoxin-atlas-v2.json`
- 实际素材尺寸：1448 × 1086，RGBA PNG，约 2 MB。8 列 × 6 行，每行是一种行为。
- 生成方式：Codex 内置 `image_gen`，没有使用 CLI/API fallback。
- 原始生成文件：`C:/Users/17286/.codex/generated_images/01a09f88-b939-77f3-8f12-137fbf2c441c/exec-ffe72066-f9fd-48f1-aeb8-fc17209934e6.png`。已复制到项目，运行不依赖此机器路径。
- 素材作为 Vite 导入，带内容哈希并进入离线缓存；Windows 包内直接使用，不调用在线生成服务。

## 最终生成提示词

```text
Use case: stylized-concept. Create ONE production-ready transparent PNG character animation sprite atlas for the MoneyDance desktop pet app. Canvas 2048x1536 pixels; exactly 8 columns by 6 rows, 48 equal 256x256 cells, no margins, no labels, no text, no grid lines, genuine transparent alpha background. Every cell contains the SAME adorable premium illustrated cream kitten called Xiao Xin: a plush rounded mochi silhouette, large round head, small soft triangular ears with peach inside, short chubby body and paws, tiny glossy dark cocoa eyes, tiny simple mouth, subtle apricot cheeks, distinctive little sage green scarf. Warm soft dimensional storybook digital illustration, soft cream light and delicate thin warm brown edges, sophisticated restrained detail readable at 160px. Not an emoji, not thick black vector outlines, no oversized human smile, no clothes except scarf. Character occupies about 75% of each cell with generous 12% safe whitespace, stable camera / scale / position, feet baseline y=230 within each cell. Grid must be mathematically regular for direct sprite rendering. All props are beautifully illustrated in the same style, never emoji. Each row is an EIGHT FRAME animation sequence, left to right. Row 1 WORK: seated at small sage laptop, eyes looking at screen, left/right paws visibly type alternating keys, concentrated blink, tiny satisfied smile, return to neutral typing. Row 2 SLACKING: kitten glances left then right, reaches beside itself, lifts small soft blue fish plush, hugs fish close with BOTH paws, delighted cheek rub, cuddles fish while gently reclined. Row 3 OVERTIME CARE: seated, visibly sleepy drooping eyelids, raises paw and rubs one eye, lowers paw, grasps warm ceramic mug, brings it forward toward viewer with BOTH paws as a caring offering, kind small smile, settles holding mug. Row 4 REST: seated relaxed, yawns with tiny open mouth, lowers head, folds paws under body, curls tail around body, lies curled asleep, breathes softly with closed eyes. Row 5 PETTING: sits alert then looks up, tilts head toward unseen hand, closes eyes delighted, presses cheek upward to nuzzle, ears fold gently, stretches front paws happily, sits back content. No human hand rendered. Row 6 CELEBRATE: crouches with bent legs, paws rise, jumps visibly with feet off baseline, stretches BOTH paws overhead smiling, lands knees bent with squash, stands proud hugging small golden coin, settles. Distinct poses and actual limb/eye/body changes, NOT rotating an unchanged drawing. No ground plane or opaque shadow background; only a tiny soft alpha shadow immediately under each character. The image itself must have a true alpha channel, no white or checkerboard fake background. This is a reusable app sprite asset, not a presentation.
```

输出的实际尺寸与要求不同，因此实现使用实际像素元数据。姿势边缘不完全落在规则网格内，渲染通过逐帧取景处理这一点。
