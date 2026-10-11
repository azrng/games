---
doc_id: DES-GH003
doc_type: design
module: game-hub
status: approved
last_updated: 2026-10-11
related:
  - doc/requirements/game-hub/first-play-tip.md
---

# 游戏平台 · 游戏页首次进入玩法提示（DES-GH003）

## 需求追溯

- 关联 REQ-GH003，覆盖其全部「本次覆盖」范围（11 款游戏已全量接入）。
- 未覆盖项（来自 REQ「本次不覆盖」）：memory-match 既有提示保留、常驻说明游戏的对齐、玩法通识游戏接入。

## 契约引用

- 无独立数据契约；存储键命名沿用 `src/js/store.js` 的 `buildGameKey` 约定（`app_game_<slug>_<field>`），最终事实来源为组件内常量拼接。
- 共享脚本注入范式的事实来源为 `src/js/game-back.js`（全部游戏页已在用）。

## 技术设计

### 模块职责与数据流

```text
src/<slug>/index.html            src/js/game-tip.js（IIFE 自执行）                 localStorage
<script data-slug data-text> ──▶ currentScript.dataset 读配置 ──▶ 注入样式+提示条+「?」
                                 首次（无 howto_seen）自动展开 ──▶ 「知道了」──▶ 写 app_game_<slug>_howto_seen='1'
                                 「?」点击 ──▶ 重新展开（不改存档语义）
```

- **配置方式**：组件从 `document.currentScript.dataset` 读取 `data-slug`（存档隔离键）与 `data-text`（玩法文案）。游戏 `script.js` 不感知组件、不做任何调用。
- **DOM 注入**：
  - 提示条 `<section class="game-first-tip" role="note" aria-label="玩法说明">` 插入 `main` 首位（继承游戏内容宽度），无 `main` 时兜底挂 `body` 首位。
  - 「?」按钮优先插入 `.game-header` 行尾（flex 布局自然排进页头右侧控件组）；无页头时回退右上角浮层（`is-floating`，`z-index: 15` 低于各游戏弹窗遮罩 ≥20）。
  - 防重复引入：`querySelector('.game-first-tip')` 命中即整体跳过。
- **存档读写**：try/catch 包裹 localStorage，不可用时退回模块内内存对象（当次会话有效），页面加载与关闭操作均不报错。
- **样式自包含**：组件样式随脚本注入 `<style>`，游戏页无需引额外 CSS；暖色中性配色（琥珀描边提示条 + 米黄底），与 memory-match 既有提示条视觉同族。

### 技术决策

1. **自初始化 + dataset 配置，而非游戏脚本调用组件**：各游戏 smoke harness 是只加载自身 `script.js` 的 VM 桩环境，游戏逻辑零耦合意味着 11+ 款游戏测试基建零改动；组件行为集中在一个专属 smoke 里验证。
2. **提示条非弹窗**：不阻断进入、不被「拦住第一屏」的负体验拖累，形态直接复用 memory-match 已上线验证的样式；同时保留「?」常驻入口补足「错过就没了」的短板。
3. **「?」放页头行尾而非固定浮层**：抽查 6 款首批游戏页头右上角均有真实控件（关卡胶囊 / 撤销按钮组 / 重开按钮），固定浮层必遮挡；插入 `.game-header` 随布局自适应，无页头才回退浮层。
4. **组件测试集中一处**：`src/js/game-tip.smoke.test.js`（8 项：首次展示 / 关闭记档 / 二次进入隐藏 / 问号重开聚焦 / 存储异常兜底 / 缺配置跳过 / 防重复注入 / 页头与浮层两种挂载），游戏侧只回归既有 smoke，不为接入改 harness。
5. **文案由接入方核对交互后定稿**：组件只负责展示，文案准确性（按钮名、手势、过关条件）由接入各游戏时对照 `script.js` 实际交互确认，避免组件与游戏演进脱节。

## 界面原型

首次进入（自动展开，桌面上限与移动端一致靠 main 内容宽度）：

```text
┌──────────────────────────────────────────────┐
│ EYEBROW          第 1 关          (?)        │ ← .game-header 行尾挂「?」
├──────────────────────────────────────────────┤
│ ╭─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─╮     │
│ │ 看价签算应付金额，点选纸币硬币凑钱付款； │     │ ← .game-first-tip（虚线描边提示条）
│ │ 付对了再点出找零。          [知道了]  │     │
│ ╰─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─╯     │
│ ┌────────────┐  ┌────────────┐               │
│ │  游戏主体   │  │  （不被遮挡）│              │
└──────────────────────────────────────────────┘
```

已关闭后进入：提示条不出现，仅页头保留「?」；点「?」重新展开同一条提示条。

状态说明：无 loading / empty / error 态（同步注入）；异常路径见下。

## 交互与异常

### 操作流程

1. 进入游戏页 → 组件同步执行（body 末尾脚本），首帧渲染前完成注入，无闪烁。
2. 「知道了」→ 隐藏 + 写档 + `aria-expanded=false`。
3. 「?」→ 展开 + `aria-expanded=true` + 焦点移至「知道了」（键盘可闭环）。

### 边界与异常

| 场景 | 行为 |
| --- | --- |
| 缺 `data-slug` / `data-text` | `console.warn` 后跳过注入，页面不受影响 |
| 重复引入脚本 | 首个 `.game-first-tip` 命中即跳过，不重复注入 |
| 无 `main` | 提示条挂 `body` 首位 |
| 无 `.game-header` | 「?」回退右上角浮层（低层级不遮弹窗） |
| localStorage 不可用 | 内存兜底：当次会话内关闭生效，下次进入重新展示，全程不抛错 |
| 弹窗（胜利/关卡）打开期间 | 提示条在文档流中被遮罩覆盖；浮层形态 z-index 低于遮罩 |

### 接入清单

| 批次 | 游戏 | 说明 |
| --- | --- | --- |
| 首批 | 一笔画 yibihua / 天平称重 balance-scale / 倒水谜题 water-pour / 编程小机器人 code-robot / 购物小掌柜 shopping-cashier / 动物翻翻棋 animal-flip-chess | script 标签 + 文案核对 |
| 补接（同日晚间，T061 收口后） | 七巧板 tangram / 时钟认知 clock-learning / 图案找规律 pattern-quest / 数织 nonogram / 汉字拼字 hanzi-parts | 因与 T061 修复批次同批文件而延后，接入方式零差异 |
| 不接入 | memory-match（已有自有提示条）；2048 / 打字大炮 / 点字成诗等（已有常驻说明，后续统一时再议） | — |
