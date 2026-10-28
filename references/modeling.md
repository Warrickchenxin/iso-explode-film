# 建模：凸块零件 + 通用骨架

## 零件规则

- **只用凸块**：长方体、带圆角的平面多边形柱（`prismZ` + `roundedRect`）、圆柱（`cylX/Y/Z`）、旋转体（`round`）。
  - L 形、U 形、环形要拆成几块凸块。
  - 圆角外壳的转角，用"圆弧 + 弦"围成的凸弓形块（示范里的 `ring()`）。
- **零件之间不许穿插**，只能贴面。kit 靠两两之间的分离平面来排遮挡顺序，穿插的两件排不出来，画面就会闪。
- **共面也危险**：两个零件的大面落在同一平面又互相重叠（例如传感器贴在 PCB 顶面），让它高出 0.05–0.3 mm。
- **数量**：150–500 件最合适。超过 200 件时，阵列必须按圈分组（rig 已经这样做），不然姿态预计算会爆内存。键盘案例 480 件，7 GB 内存够用。
- **细节**：靠真实零件和面上的印刷（`planeTop` 的 SVG），不要加噪点或贴图。

## rig 接口（`object/rig.mjs`）

```js
const rig = makeRig(T, { layer });
const g = rig.layer("pcb");                         // SPEC.layers 里的一层，一层一个组
rig.array("cells", { cx, cy, hx, hy });             // 先声明阵列的中心和半宽（物体坐标）
const ga = rig.arrayGroup("cells", X, Y, { element: k });   // 每个元素按位置归到 8 扇区 × 3 圈
const H = rig.hero({ x, y, z });                    // 核心零件：H.out，H.step[i] 对应 SPEC.hero.steps[i]
const m = rig.mech(0, H.step[0], [0, 0, -1]);       // 机构滑块，由 act 通道驱动
rig.box(name, group, [X0, X1], [y0, y1], [z0, z1], { material, r, tone })
rig.cylY(name, group, X, zCentre, y0, y1, r, { material })
rig.prismZ(name, group, polygonInWorldXY, z0, z1, { material })
rig.planeTop(part, X, Y, zTop, svg)                 // 面上印刷：走线、丝印、字、指示灯
if (process.env.ISO_LOOK === "split") rig.props();  // 橙色版桌上的两个参照方块
return rig.finish({ sampleStates });                // 锚点、标注点、要预算的姿态
```

### 层（layers）
- `SPEC.layers` 从上到下排。爆炸时按这个顺序一层一层抬起：最上层飞得最高，最下层略微下沉。
- 默认行程 = radius × (0.1 + 1.3 × 剩余比例^1.1)，可以用 `travel` 指定某一层。
- 一个零件只属于一层。壳体侧壁和顶板放同一层，PCB 上的元件跟 PCB 同层。

### 阵列（arrays）
- 每个元素按相对阵列中心的角度归到 8 个扇区之一，按距离归到 3 圈之一。
- 每个"扇区 × 圈"是一个滑块：沿"斜向外 + 向上"的方向飞出，外圈飞得更远、更偏向侧面。
- `rise`：飞多高（mm）。`spread`：侧向比例。
- `from`：默认 `"edge"`，外圈先走，零件挤得很紧时不会互相碰；`"centre"` 是中心先走，零件间距大时更好看。
- `wave: true`：每个元素再套一个小滑块，开场镜头可以让它们从左到右波浪起伏（键盘的按键波浪）。元素多时会增加组数，注意内存。
- 一个阵列元素由几件组成（轴体的外壳、上盖、轴心），就都挂在同一个 `arrayGroup` 下。

### 核心零件（hero）和机构（mech）
- `SPEC.hero = { layer, array?, size, pull, hover, steps }`：
  - `pull`：特写镜头里整体抽出的高度；
  - `steps[i]`：第 i 个子件拆开时上移的距离；
  - `hover`：action 镜头里回落的距离；
  - `size`：决定特写的放大倍数。
- 核心零件在某个阵列里面时（键盘的那颗磁轴），写上 `array: "switches"`，它会跟着阵列一起飞散。
- 子件挂在 `H.step[i]` 下；不动的底座挂在 `H.out` 下。
- 机构：`rig.mech(i, parent, dir)`，行程写在 `SPEC.mech[i].travel`。滑块要放在被按的那一件的路径上，例如 `H.out → H.step[0] → M.0 → 键帽`。
- **动作要留间隙**：按压行程不能让零件顶进下面的零件。键帽底面和下面零件之间的空隙要大于 `mech.travel`。

## 材质

- kit 自带：`alu, aludark, alublack, keywhite, keygrey, keyink, keyblack, foam, foamdark, pcb, pcbblack, chrome, steel, gunmetal, gold, brass, copper, rubber, glass, signal, limesw, magnet, pipe, cube, porcelain, lavender…`
- 新颜色：`node scripts/add-material.mjs <工程目录> 名字 #rrggbb [名字 #rrggbb…]`，生成 19 个色阶写进 `kit/turn.mjs`。
- **配色规则**：
  - 外壳用一个主色；
  - 内部件用 2–3 个中性色，再加一个功能色（电芯蓝、轴体绿、PCB 黑金）；
  - **只给一个零件用强调色**（键盘的红色 Esc、移动电源的红色按键）。

## 预算姿态（防闪烁的关键）

- 遮挡顺序必须按姿态预先算好。`rig.finish({ sampleStates })` 会把整部片每 0.1 秒的特征状态采样、去重后全部预算，另外再加一组粗网格。
- 改了分镜或时长以后要重新 build：姿态是按当前分镜采样的。
- `node motion/scan.mjs` 每秒检查 60 帧，会列出两类问题：
  - **forced picks**：某帧的遮挡顺序没有预算到，会闪。处理：缩短采样间隔，或者在 `finish` 里补那个时刻的状态。
  - **passing through each other**：两件零件互相穿过去了，会列出零件名、时间段和穿入深度。处理：
    - 从 0 秒起就穿插：几何本身重叠了，改尺寸。
    - 只在某段动作里穿插：调动画顺序。比如先收阵列、再合层；或者让阵列在层分开以后再飞散。时间线已经按这个顺序处理，自己加镜头时也照这个顺序。
