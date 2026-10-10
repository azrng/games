---
doc_id: DES-SN001
doc_type: design
module: snake
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/snake/core-game.md
---

# 贪吃蛇 · 技术设计（DES-SN001）

## 需求追溯

实现 REQ-SN001 全部验收标准；无契约文档（存储结构简单，落地为代码内常量）。

## 技术设计

**文件结构**（对齐 `src/lights-out/` 四件套惯例）：`src/snake/` 下 `index.html`、`style.css`、`script.js`、`smoke.test.js`。

**script.js 架构**：
- IIFE `(function setupSnake(windowObject, documentObject) { ... })(window, document)`，首行 `// @ts-check`，全中文注释。
- 顶部常量：`SLUG = "snake"`、存档键 `snake-best`、棋盘 20×20、初始间隔 150ms、提速步长 8ms、下限 70ms、每 4 食提速一次。
- 纯函数（供 smoke 断言，挂 `window.Snake` 导出）：
  - `nextDirection(current, queued)`：从缓冲队列取下一个合法方向（跳过与当前相同或相反的项）。
  - `stepSnake(snake, direction, food)`：返回 `{ snake, ate, dead }`——头部新坐标入列；撞墙（越界）或撞身 `dead: true`；吃到食物 `ate: true` 且尾部不出列。
  - `spawnFood(snake, width, height, random)`：在空格中随机生成食物坐标。
  - `readBest()` / `writeBest(score)`：try/catch + 内存兜底的存档读写。
- 渲染：canvas 2D，每帧重绘棋盘底、食物、蛇身（蛇头高亮）；`requestAnimationFrame` + 累积时间驱动步进（掉帧安全）。
- 输入：`keydown`（Arrow/WASD，preventDefault 防滚动）入缓冲队列（最多 2）；棋盘 `touchstart/touchend` 计算位移向量（阈值 24px）判定滑动方向。
- 状态机：`idle | running | paused | over`；空格与按钮触发开始/暂停/重开。

**存档**：键 `snake-best`（数字字符串）。

## 界面原型

```text
┌──────────────────────────────────────┐
│ SNAKE                    最佳 120    │  ← eyebrow + h1 + 最高分胶囊
│            贪 吃 蛇                  │
├──────────────────────────────────────┤
│  [得分 40] [长度 9] [最高 120]       │  ← scoreboard 三卡
│  ┌────────────────────────────┐      │
│  │  ■■■●        🍎            │      │
│  │        ■■■                 │      │  ← 棋盘 canvas
│  │                            │      │
│  └────────────────────────────┘      │
│  方向键/WASD 或滑动转向               │
│  [开始] [暂停] [重开]                │  ← action-bar ghost 按钮
└──────────────────────────────────────┘
结束弹窗：本局得分 / 最高分 / (破纪录！) / [再来一局]
待机态：棋盘中央提示"点开始或按空格"；暂停态：遮罩"已暂停"；
异常态：本地存储不可用时最高分卡显示"—"并继续可玩。
```

## 交互与异常

- 待机/暂停/结束时输入方向无效；运行中 `preventDefault` 阻止方向键滚动页面。
- 滑动仅在棋盘 canvas 上监听，页面不滚动；`touch-action: manipulation`。
- 步进掉帧补齐：按真实时间累积驱动，最多连补 3 步防追帧卡死。
- 本地存储读写全部 try/catch，失败静默降级为内存值。
