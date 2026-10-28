# 渲染

## 管线

1. `motion/build.mjs --look split|dark` 生成两样东西：
   - 一个网页，里面是整部片的动画，按时间取一帧；
   - `film/plan.json`：时长、镜头、字卡、标注、余量、音效提示。
2. `film/render_film.py` 逐帧处理：
   - 网页只画物体（透明背景）。镜头缩小 M 倍多渲染一圈（M = 1.45；低机位的 array、stack 镜头 2.1–2.7），边缘做 9% 宽的羽化，零件出画时淡出，不会被切成硬边。
   - 用一个单应矩阵把等轴测画面变换到透视。
   - 合成背景：桌面逐像素反投影，或者用暗底。
   - 运动模糊：按画面移动速度决定子帧数，n = ceil(速度 ÷ 7)，最多 12。
   - 叠上字卡和层标注。
3. `film/synth.py` 生成配乐。
4. ffmpeg 输出 H.264（CRF 16，veryfast，yuv420p）和 AAC 256k。另外出一版无声的。

## 一条命令

```bash
bash film/run_render.sh both [进程数]          # split + dark
bash film/run_render.sh dark 6                 # 只出黑色版
DURATION=15 bash film/run_render.sh split      # 整体伸缩到 15 秒
```

- 输出在 `out/`：`<型号>_split.mp4`、`<型号>_dark.mp4`、对应的 `_silent.mp4`、`check_split.jpg`、`check_dark.jpg`。
- 每个进程是一个 Chromium 加一个 Python 进程，渲染第 k、k+N、k+2N… 帧。已经存在的帧会跳过，断了直接重跑。
- 先在本机出 9–12 张样帧检查，确认没问题再整片渲染。

## 三种跑法

| 环境 | 进程数 | 30 秒两版（900 帧 × 2）大约 |
|---|---|---|
| 本机 CPU（8 核笔记本） | 6–7 | 1.5–2 小时 |
| 云端工作区（2 核） | 2–4 | 一般只出样帧和短片；整片 4 小时以上 |
| AutoDL 等云服务器（16 核） | 橙色版 10 + 黑色版 6，两版同时跑 | 约 30 分钟 |

渲染主要吃 CPU（Chromium 光栅化和 numpy 合成），用不上 GPU。租服务器时看 CPU 核数和内存（每个进程约 0.6 GB），显卡随便。

### 在 AutoDL 上

1. 打包工程，不要带 `node_modules`、`out`、`film/fonts`：
   ```bash
   tar cJf film.txz --exclude node_modules --exclude out --exclude film/fonts <工程目录>
   ```
   通过 JupyterLab 上传。
2. 在服务器上解压，然后：
   - `npm install`；
   - pip 用清华镜像：`pip install -i https://pypi.tuna.tsinghua.edu.cn/simple playwright numpy scipy pillow opencv-python-headless fonttools brotli`；
   - Chromium：`PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright python3 -m playwright install chromium`，再装系统依赖 `python3 -m playwright install-deps chromium`；
   - 下载字体：`bash film/get_fonts.sh`。
3. **后台任务用 screen**：`screen -dmS film bash film/run_render.sh both 14`。用 nohup 跑的任务在终端断开后会被杀掉。
4. 进度：`ls out/frames-split | wc -l`。完成后从 JupyterLab 下载 `out/*.mp4`。
5. 用完关机。数据盘的数据关机后还在。

## 常见问题

- **出现 `No Chrome found`**：设置 `CHROME_PATH`，或者装 Playwright 自带的 Chromium（`browser.mjs` 会自动去找）。
- **画面边缘有一条直线切掉了零件**：那个镜头的余量 M 不够。在 `timeline.mjs` 里给这个时间段加 `MARGINS0`，2.1–2.7。
- **标注指错层**：确认标注点用的是同一个单应矩阵（`draw_labels` 收到的 `H_mid`），并且 `labelItems[i].follow` 包含了这一层所有在动的组。
- **build 时内存不够（exit 137）**：零件或组太多。减少波浪元素、合并阵列的圈，或者把采样间隔从 0.1 秒放宽到 0.2 秒。
