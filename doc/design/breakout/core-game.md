---
doc_id: DES-BK001
doc_type: design
module: breakout
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/breakout/core-game.md
---

# 打砖块 · 技术设计（DES-BK001）

## 需求追溯

实现 REQ-BK001 全部验收标准；存储结构简单，无契约文档。

## 技术设计

**文件结构**：`src/breakout/` 四件套（对齐 `src/lights-out/` 惯例；canvas 渲染参考 `src/zh-poem/script.js` 的 rAF 循环写法）。

**script.js 架构**：
- IIFE + 首行 `// @ts-check` + 全中文注释；常量：`SLUG = "breakout"`、存档键 `breakout-unlocked-level` / `breakout-best`、逻辑画布 480×640、共 6 关。
- 纯函数（挂 `window.Breakout` 导出）：
  - `mulberry32(seed)` + `generateLayout(level, seedBase)`：确定性生成 `{ rows, cols, bricks }`（bricks 为布尔阵；行数 min(3+level, 7)，密度 0.55+level×0.06，第 2 行起隔行留空道避免不可击穿死角）。
  - `reflectAngle(offset)`：offset ∈ [-1,1]（命中点相对挡板中心）→ 出射角弧度，范围 [30°,150°]，垂直分量下限防水平死循环。
  - `stepBall(state)`：位移分片推进（每片 ≤ 砖厚/2），返回碰撞结果 `{ brickHit: {row,col,axis} | null, paddleHit | null, bottom | bool }`——轴判定用进入前位置比较（x 越界反 x 轴，y 越界反 y 轴）。
  - `readUnlocked()/writeUnlocked(level)`、`readBest()/writeBest(score)`：try/catch + 内存兜底。
- 渲染：canvas 按容器宽度等比缩放（CSS 宽 100%，绘制坐标乘 dpr 与缩放比）；挡板/球/砖圆角矩形，砖色按行渐变。
- 循环：`requestAnimationFrame` + dt 累积；球速 = 基础 320px/s × (1+0.06×(level-1))，随存活时间缓增至上限 560px/s。
- 输入：`mousemove` / 方向键持续按住 / `touchmove` 拖动映射挡板中心（`getBoundingClientRect` 换算，钳制边界）；空格或点击发射/暂停切换。

**状态机**：`idle | ready(球贴板待发) | running | over`；弹窗复用 lights-out 的 overlay-modal 结构。

## 界面原型

```text
┌──────────────────────────────────────┐
│ BREAKOUT                 第 2/6 关   │
│            打 砖 块                  │
├──────────────────────────────────────┤
│  [总分 320] [本关剩 18] [命 ●●○]     │
│  ┌────────────────────────────┐      │
│  │ ▦▦▦▦▦▦▦▦▦▦                │      │
│  │ ▦▦▦▦▦▦▦▦▦▦                │      │  ← 砖阵（按关卡种子生成）
│  │      ●                     │      │  ← 球
│  │ ▬▬▬▬▬▬▬                   │      │  ← 挡板
│  └────────────────────────────┘      │
│  移动鼠标或拖动控板，点击发射          │
│  [开始/暂停] [重开] [选关]           │
└──────────────────────────────────────┘
弹窗三种：过关（下一关）/ 通关（庆祝+总分）/ 失败（总分+最高+破纪录）+ 选关列表弹窗。
待机/待发态：棋盘中央提示；异常态：存储不可用时选关与最高分降级为"-"仍可玩。
```

## 交互与异常

- running 中空格为暂停，ready 中空格为发射；暂停遮罩提示。
- 高速球分片步进防穿透（见 REQ 边界）；挡板碰撞只在球下行时生效，防粘连。
- touchmove 上 `preventDefault`，页面不滚动；`touch-action: none` 仅作用于 canvas。
- 存储读写 try/catch 静默降级。
