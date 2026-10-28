---
name: iso-explode-film
description: 等轴爆炸大片：把任何实体产品（CAD/STEP、STL/OBJ/GLB、图纸或照片）做成 30 秒等轴测科技拆装广告片——固定广告机位、橙色桌面与黑色发光两版、几百个零件分层爆炸、核心零件特写、参数字卡、卡点配乐。用户要做产品爆炸图视频、拆解广告片、等轴测拆装大片时使用。
---

# 等轴爆炸大片（iso-explode-film）

把一个实体产品拆成几百个凸块零件，做成 16:9、30 fps、带运动模糊的等轴测拆装广告片：
产品亮相 → 分层爆炸（带层标注）→ 核心零件特写拆开 → 机构动作 → 阵列零件飞散 → 夹层推镜 → 一层层合拢 → 型号收尾。
同一套动画出两版：**橙色桌面版**（灰橙分割桌面、暖色投影、两个参照方块）和**黑色版**（深色渐变底、柔光、冷色亮边）。

`template/` 是一个完整可运行的工程，示范物体是一块移动电源（7 层、84 个零件）。键盘案例（Keychron Q1 HE 8K，480 个零件）的规格和分镜写在 `references/case-keyboard.md`。

## 代码包

脚本和工程模板在这个 skill 文件夹的 `scripts/`、`template/` 里。如果当前环境里只有这份说明、没有这两个文件夹，就向用户要 `iso-explode-film.zip`（完整 skill 包），解压后再用。

## 先读

| 文件 | 什么时候读 |
|---|---|
| `references/inputs.md` | 开工第一步：四档输入怎么处理，产品规格单怎么写 |
| `references/modeling.md` | 建模前：零件规则、rig 接口、层/阵列/核心零件/机构怎么挂 |
| `references/look.md` | 固定机位和两套配色，要改时看 |
| `references/storyboard.md` | 写分镜：镜头库、时长模板、字卡规则、分镜文档格式 |
| `references/animation.md` | 动画规则，时间线生成器做了什么、怎么覆盖 |
| `references/type-sound.md` | 字卡、层标注、配乐和音效 |
| `references/render.md` | 渲染：本机 CPU / 云端 / AutoDL 等服务器 |
| `references/qa.md` | 自检清单（每条都有检查方法） |
| `references/case-keyboard.md` | 完整案例，复现时对照 |

## 流程

1. **定输入和规格单**（`inputs.md`）。按 A/B/C/D 四档判断手里有什么：
   - A 档 STEP/IGES：`python3 scripts/cad_inventory.py model.step inv/`
   - B 档网格：`python3 scripts/mesh_inventory.py model.glb inv/`
   - 读 `inv/summary.txt` 和 `plan.png`、`side.png`。

   写一份**产品规格单**：总尺寸、从上到下的层、重复阵列、核心零件、机构动作、要打的参数。**给用户确认后再建模**。
2. **起工程**：`node scripts/new-project.mjs <dir>`。这一步会复制模板、装依赖、下字体，构建示范物体并自检，用来证明这台机器的工具链能跑通。
3. **写 SPEC**：`object/film.mjs` 顶部的 `FILM`（标题、radius ≈ 0.8 × 包围盒对角线、包围盒）和 `SPEC`（layers / arrays / hero / mech）。
4. **建模**：`object/geometry.mjs`。用 rig 的方法挂零件，零件之间不许互相穿插。
   - 材质不够用：`node scripts/add-material.mjs <dir> 名字 #rrggbb`。
   - 反复跑 `node motion/build.mjs --look split && node motion/scan.mjs`，直到输出 `every frame clean`。
5. **写分镜**（`storyboard.md`）：
   - 先写分镜文档（镜头、时长、字卡、音效），**给用户确认**。
   - 确认后填进 `motion/story.mjs`。
6. **出样帧**：
   - `npm run stills`（或 `python3 film/render_film.py out/s --look split --frames …`）
   - `python3 film/contact_sheet.py out/s.jpg out/s/*.jpg`
   - 看图，对照 `qa.md` 逐条查。两个 look 都要看。
7. **整片渲染**（`render.md`）：`bash film/run_render.sh both [进程数]`。本机、云端工作区、AutoDL 都是这一条命令，断了重跑会接着渲。
8. **检查成片**：
   - 看 `out/check_split.jpg`、`out/check_dark.jpg`（从 MP4 本身抽帧拼的图）。
   - 甩镜中间帧单独抽查。
9. **交付**：
   - 两版带声 MP4 和两版无声 MP4
   - 爆炸图、产品全貌两张海报静帧（从帧里挑）
   - 交互拆解页（`npm run figure`）
   - 说明哪些没验证。

## 硬规则

- **几何即一切**：画面里只有代码搭的凸块零件。不贴图，不描照片，印刷和文字画在零件面上（`planeTop`）。
- **真实尺寸**：零件数、层级、开合方式都按真实产品做。D 档估算的尺寸，要在交付说明里写清楚。
- **零件不穿插**：`motion/scan.mjs` 每帧都要 clean。穿插就移动或拆分零件，不要放宽检查。
- **一镜到底**：换镜头用约 0.25 秒的甩镜；停留时镜头也要缓慢漂移；只有最后半秒完全静止。
- **固定风格**：机位、两套配色、字体、字卡位置都是定好的。用户要改时，按 `look.md` 改参数，不要另起一套。
- **声音**：代码合成，不用叮当类提示音。
- **授权**：用别人的 CAD 时，不分发由它导出的模型数据，片尾不放对方 logo 和商标，只打型号。

## 文件

| 路径 | 内容 |
|---|---|
| `scripts/new-project.mjs` | 起新工程：复制模板、装依赖、下字体、构建并自检 |
| `scripts/cad_inventory.py` | STEP/IGES → 零件清单、层候选、阵列候选、俯视和侧视图 |
| `scripts/mesh_inventory.py` | STL/OBJ/3MF/GLB/PLY → 同格式清单（自动识别米制单位，合并按面拆开的节点） |
| `scripts/add-material.mjs` | 用一个颜色生成材质的 19 个色阶，写进工程的 kit |
| `template/object/film.mjs` | FILM + SPEC（只改这里），以及通用的通道计算 |
| `template/object/rig.mjs` | 通用骨架：lift、层、阵列（8 扇区 × 3 圈）、波浪、核心零件、机构、标注点、需要预算的姿态 |
| `template/object/geometry.mjs` | 物体本身（示范：移动电源） |
| `template/motion/story.mjs` | 分镜（beats） |
| `template/motion/timeline.mjs` | 由分镜生成关键帧、字卡、层标注时间窗、渲染余量、音效提示 |
| `template/motion/build.mjs` | 生成 `motion-split.html` / `motion-dark.html` 和 `film/plan.json` |
| `template/motion/scan.mjs` | 逐帧检查遮挡顺序和穿插 |
| `template/film/render_film.py` | 合成：透视、桌面或暗底、运动模糊、边缘羽化、字卡、层标注 |
| `template/film/synth.py` | 从 plan.json 合成配乐和音效 |
| `template/film/run_render.sh` | 整片并行渲染、混音、出 MP4 和检查图 |
| `template/film/get_fonts.sh` | 下载鸿蒙黑体 SC（Thin / Light / Regular） |
| `template/film/contact_sheet.py` | 帧或 MP4 → 拼图检查 |
| `template/kit/` | Anatomy 等轴测工具包（MIT），加了一批材质 |
