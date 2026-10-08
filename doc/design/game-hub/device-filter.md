---
doc_id: DES-GH002
doc_type: design
module: game-hub
status: approved
last_updated: 2026-10-08
related:
  - doc/requirements/game-hub/device-filter.md
  - doc/design/game-hub/age-filter.md
---

# 游戏平台首页 · 设备筛选 Tab（DES-GH002）

## 需求追溯

- 关联 REQ-GH002，覆盖其全部「本次覆盖」范围。
- 未覆盖项（来自 REQ「本次不覆盖」）：卡片设备徽章、`mobilePath` 机制调整、筛选状态持久化。

## 契约引用

- CON-GH001（已落地为 `src/data/games.js`，最终事实来源）：`meta` 为增量扩展位，本次在 `meta` 对象内新增 `device` 字段，不改条目顶层结构；兜底规则沿用「缺失/非法按 `all`」。
- 设备适配分类的具体取值与归类见 REQ-GH002「关键业务对象」；代码落地后以 `src/data/games.js` 为准。

## 技术设计

### 模块职责与数据流

```text
data/games.js               js/app.js                              index.html / css
GAME_CATALOG  ──▶  normalizeAge()/normalizeDevice() 兜底 ──▶ renderAllTabs() 两行 Tab
              ──▶  matchesAge && matchesDevice 交集 ──▶ render() 重建卡片 ──▶ .hub-grid
```

- `src/data/games.js`：16 个条目补 `meta.device`（desktop 2 / mobile 7 / all 7），其余字段不动。
- `index.html`：`.hub-tabs#age-tabs` 之后新增 `<div class="hub-tabs" id="device-tabs" role="tablist" aria-label="按设备筛选游戏">` 容器，由 JS 填充。
- `src/js/app.js`：
  - 新增 `DEVICE_TABS` 定义（全部/电脑端/移动端）与单一 UI 状态 `currentDevice = "all"`，不持久化。
  - `normalizeDevice(game)`：按契约兜底读取 `meta.device`，非法值返回 `"all"`。
  - `renderTabs(tabsElement, tabDefs, current, dimension)` 参数化为双维度通用渲染；`dataset` 键按维度写入（`data-age` / `data-device`），计数经 `countGames(age, device)` 独立统计本维度（两行 Tab 互不联动，REQ-GH002 已确认口径）。
  - `matchesDevice(device)`：包含语义，`all → 全量；desktop → desktop || all；mobile → mobile || all`。
  - `render()` 过滤条件改为 `matchesAge && matchesDevice` 交集；空态兜底沿用 `.hub-empty`。
  - 两个容器各自 `addEventListener` 点击更新对应状态后 `renderAllTabs()` + `render()`。
- `src/css/custom.css`：完全复用 `.hub-tabs/.hub-tab/.hub-tab-count` 既有样式；两行间距收窄为 `margin-bottom: 12px`，`.hub-tabs + .hub-grid { margin-top: 16px }` 拉开与卡片区距离；移动端断点同步（10px / 12px）。不用 `:last-of-type`（`.hub-grid` 同为 `div`，会失配——本次开发中实测修正）。

### 技术决策

1. **设备分类放 `meta.device` 而非从 `mobilePath` 推导**：`mobilePath` 是「移动端入口路径」而非「适配声明」（6 款仅手机游戏 mobilePath == path，迷宫无 mobilePath），语义不同，不能复用。
2. **计数独立不联动**：与年龄 Tab 行为保持一致，实现与测试最简；联动计数（交集中数量）作为未来可选项。
3. **`renderTabs` 参数化而非复制**：两行 Tab 结构完全一致，仅 dataset 键与数据源不同，一个函数两个调用点。
4. **初始归类以页面实际适配证据为准**：逐游戏核查触控/键盘/软键盘/虚拟键盘支持与桌面提示层，不凭 desc 文案猜测（找猫咪依赖双指缩放归 mobile，俄罗斯方块无触控代码归 desktop）。
5. **Tab 状态不持久化**：与年龄筛选一致，刷新回默认「全部 / 全部」。

## 界面原型

默认态（桌面宽度）：

```text
┌──────────────────────────────────────────────────────┐
│                     [icon]  游戏平台                  │
│                  选择一款游戏开始游玩                  │
│                                                      │
│           （年龄行） ┌────────┐ ┌────────┐ ┌────────┐  │
│                     │ 全部 16 │ │ 儿童 15 │ │ 成人 11 │  │
│           （设备行） ┌─────────┐ ┌──────────┐ ┌──────────┐
│                     │ 全部 16 │ │ 电脑端 10 │ │ 移动端 14 │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │   🎲     │  │   ♟️     │  │   🧩     │            │
│  └──────────┘  └──────────┘  └──────────┘            │
└──────────────────────────────────────────────────────┘
```

交集筛选态（儿童 + 电脑端，9 款，空态为防御性兜底）：

```text
│   年龄行： 全部 16 │ [儿童 15] │ 成人 11      ← 年龄选中「儿童」 │
│   设备行： 全部 16 │ [电脑端 10] │ 移动端 14    ← 设备选中「电脑端」│
│   卡片区： 9 张（含 tetris/maze，不含 6 款仅移动全龄）           │
│                                                                │
│   交集为空时（如成人 + 仅移动分类下）：该分类下暂无游戏，看看其他分类吧 │
└────────────────────────────────────────────────────────────────┘
```

状态说明：无 loading 态（静态数据同步渲染）；empty 态见上图（交集为空时可达，非防御性）；error 态沿用现状（目录缺失时整页不渲染）。

## 交互与异常

### 操作流程

1. 页面加载 → `renderAllTabs()` 渲染两行 Tab（均默认 `aria-selected="true"`）→ `render()` 渲染全量卡片。
2. 点击任意行 Tab → 更新对应状态 → `renderAllTabs()` 刷新两行选中态 → `render()` 重建交集卡片。同步执行。
3. 键盘：Tab 为原生 `<button>`，聚焦后回车/空格即切换。

### 边界与异常处理

| 场景 | 处理 |
| --- | --- |
| `meta` 为 `null` / 缺 `device` / 非法值 | `normalizeDevice()` 返回 `"all"`，三 Tab 均可见（契约兜底规则） |
| 年龄 + 设备交集为空 | 列表区渲染空态文案，Tab 数量照实显示 |
| 目录为空或加载失败 | 维持现有 early-return：两行 Tab 与卡片均不渲染，无 JS 报错 |
| 窗口缩放 / 移动端 | 两行 Tab 均允许换行，不横向溢出 |

### 验证方式

1. 扩展 `src/js/app.smoke.test.js`（node + vm + assert，沿用既有桩模式）：
   - 场景 A：真实目录默认态，断言两行 Tab 计数 16/15/11 与 16/10/14、年龄筛选行为回归。
   - 场景 B：`meta` 缺失 / 非法 `age` / 非法 `device` 条目在全部 Tab 下兜底可见。
   - 场景 C：儿童+移动端 13 款、儿童+电脑端 9 款、成人+移动端 9 款（不含 tetris/maze）等交集断言。
   - 场景 D：单条目目录下交集为空渲染 `.hub-empty`，且设备 Tab 计数独立于年龄选中态。
   - 场景 E：空目录两行 Tab 与卡片均不渲染。
2. 浏览器 smoke（本次已执行）：默认态/电脑端/移动端/儿童+移动端筛选卡片数与计数一致；390px 视口下两行 Tab 换行正常、间距命中断点样式；无 console 报错；截图存 `gui-test-screenshots/`。
