# 固定风格：机位与两套配色

不需要找参考广告图：机位和配色都已经定好，所有产品都用这一套。用户要调整时，只改下面列出的参数。

## 机位（`motion/timeline.mjs`）

| 名称 | 参数 | 用在 |
|---|---|---|
| `HERO` 产品机位 | yaw −27.186°，pitch 54.53°，roll 9.49°，zoom 2.687，panX 17.8，panY 18.3 | 开场、收尾 |
| `EXV` 爆炸机位 | yaw −20°，pitch 24°，zoom 1.0，panX 70（主体右移，左边留给字卡） | 爆炸、合拢 |
| 特写 | yaw −34°→−40°，pitch 18–20°，zoom = 0.5 × radius ÷ hero.size（限制在 2–14） | part |
| 动作 | yaw −55°→−60°，pitch 12°，zoom = 特写 × 1.47 | action |
| 阵列 | yaw −48°→−14°，pitch 16–22°，zoom = 2.0 × radius ÷ 阵列宽（限制在 1.4–8），panX −120 | array |
| 夹层 | yaw −62°→−40°，pitch 9–12°，zoom = 3.5 × radius ÷ 产品宽（限制在 1.5–8），panX −90 | stack |

- **透视**：在等轴测的基础上，按每帧的比例尺加一层透视：焦距 3.63 × 1003 px（以 1920 宽为准），相机最近不小于 450 mm × radius/270，避免特写变形太大。HERO 机位当初是按一张产品广告照片的透视反推出来的，之后固定不变。
- 所有 zoom 都相对 `FILM.radius`，所以只要 radius ≈ 0.8 × 包围盒对角线，构图大小在不同产品之间是一致的。
- **单个镜头微调**：在 `story.mjs` 里给 beat 加 `cam: { yaw, pitch, zoom, panX, panY }`，覆盖这个镜头结束时的机位。
  - 高的产品（音箱、杯子）：HERO 的 pitch 可以降到 35–45°。
  - 很扁的产品（卡片、面板）：pitch 可以升到 60°。

## 两套配色

### 橙色版（`--look split`）
- 桌面在三维里绘制：每个像素反投影回 z = 底面的桌面平面，再按一条斜线分成浅灰和橙色两块。
  - 灰色从左上 #f7f7f7 渐变到 #d5d5d5。
  - 橙色由三色渐变：亮 #f68658、中 #e86840、暗 #cd5032；物体下方有一块阴影。
- 物体投影：三层暖色 drop-shadow（`motion/look-split.css`）。
- 桌上有两个 U 形参照小方块（`rig.props()`），尺寸和位置按 radius 缩放。
- 分割线和方块位置都写在 `render_film.py` 的 `LA/LB` 和 `rig.props()` 里（以 radius 270 为基准）。

### 黑色版（`--look dark`）
- 屏幕空间的深色底 #07080b，四块柔光：左上青绿、右侧蓝紫、左下暗紫、中央微亮。
- 物体加一圈冷色亮边：`drop-shadow(0 0 0.8px rgba(215,225,255,.75)) drop-shadow(0 0 7px rgba(130,150,230,.22))`（`motion/look-dark.css`）。
- 没有桌子，也没有参照方块。
- 字卡和标注改用白色。

## 改配色时动哪里

| 想改 | 改哪里 |
|---|---|
| 产品零件颜色 | `geometry.mjs` 里各零件的 `material`；新颜色用 `add-material.mjs` |
| 橙色换成别的品牌色 | `render_film.py` → `table_image()` 里的 `light/mid/dk` 三个颜色 |
| 灰色桌面的深浅 | 同一函数里的 `grey` |
| 黑色版的柔光颜色 | `dark_image()` 里四个 `glow(...)` 的颜色 |
| 投影 / 亮边 | `motion/look-split.css`、`motion/look-dark.css` |
| 去掉参照方块 | `geometry.mjs` 里删掉 `rig.props()` |

用户偏好：不要深绿、深紫色系的大面积配色；强调色只用一个。
