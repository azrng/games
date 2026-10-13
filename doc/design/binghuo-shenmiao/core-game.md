---
doc_id: DES-BH001
doc_type: design
module: binghuo-shenmiao
status: draft
last_updated: 2026-10-13
related:
  - doc/requirements/binghuo-shenmiao/core-game.md
  - doc/contracts/binghuo-shenmiao/core-game.md
---

# 冰火神庙：web 版构建与平台接入设计

## 需求追溯

覆盖 REQ-BH001 全部范围内条目：四包 158 关 web 化、localStorage 存档、大厅接入、返回大厅入口。不覆盖：fw-temples 仓库合并、自动同步、移动端触屏。

## 契约引用

- CON-BH001（草案）：`IpcSdk` 8 通道的 localStorage 适配语义。源型契约 = fw-temples `src/shared/ipc-types.ts`（桌面版最终事实来源），本契约只声明 web 侧映射差异。
- 平台清单结构：`src/data/games.js`（CON-GH001 已落地，最终事实来源）。

## 技术设计

### 总体架构

fw-temples 仓库（Gitee，Electron 项目，主链路不动）新增 web 构建目标；产物一次性拷入本仓库 `src/binghuo-shenmiao/`；本仓库保持零构建模式，不引入 Node 构建链。

```
fw-temples（源仓库）
  ├─ vite.web.config.ts            # 新增：root=src/renderer，base='./'
  ├─ src/renderer/src/lib/ipc/web-ipc.ts   # 新增：IpcSdk 的 localStorage 实现
  └─ src/renderer/src/main.tsx     # 唯一改动点：!window.ipc 时安装 web 桥
        ↓ npm run build:web（可重复执行）
本仓库（产物）
  └─ src/binghuo-shenmiao/
      ├─ index.html                # 含 viewport meta
      ├─ assets/                   # React + Phaser bundle
      ├─ sprites/  sounds/         # 素材原样拷贝（约 13.5MB）
      └─ （games.js 注册清单条目）
```

关键决策：渲染层源码零逻辑改动。现有 `ipc()` 函数走 `window.ipc` 单点收敛（Electron 中 preload 注入真桥），web 构建在入口检测 `!window.ipc` 时注入 localStorage 实现同一 `IpcSdk` 接口。同一份源码两种宿主，分支仅在入口装配处。

### 数据流

```
React 页面 ──window.ipc──▶ web-ipc（localStorage 适配层）
   │                            │
   │                     app_game_binghuo-shenmiao_progress   （按 game→level 两级索引）
   │                     app_game_binghuo-shenmiao_settings   （音乐/音效音量）
   │                     app_game_binghuo-shenmiao_history    （按 game 分组，各留 20 条）
   ▼
Phaser 场景（关卡逻辑与桌面版完全一致，不感知存储差异）
```

### 路由与资源

- 桌面版已是 `createHashRouter`（file:// 兼容设计），子路径静态托管零改动。
- vite `base: './'` 相对引用。
- 风险点（实现期首个验证项）：若源码存在写死的 `/sprites/...` 绝对路径，Phaser 加载会断；发现则改为相对路径常量。
- CSP：fw-temples 生产构建已有 tighten 插件（移除 ws:/unsafe-inline），静态托管兼容。

### 技术决策与依赖边界

| 决策 | 理由 |
| --- | --- |
| 不合并仓库 | Pages 工作流整仓上传；发布节奏、质量门槛、工具链两套体系，合并互相污染 |
| 不注入平台 game-back.js | 该脚本面向单页游戏；本游戏自带主菜单/选关导航。返回大厅入口实现于游戏选择页（`GameSelectPage` 按 web 宿主条件渲染「返回大厅」按钮，指向 `../../index.html`；桌面 Electron 宿主经 UA 判定不渲染） |
| quitApp 空实现 | web 无退出语义；保留按钮避免改桌面版 UI 源码 |
| slug 定为 binghuo-shenmiao | 与平台拼音命名风格一致；定后不改（改名=旧链接 404 + 玩家进度丢失） |
| `device: "desktop"` | 双人键盘玩法无触屏按键，与平台 tetris 口径一致 |

## 界面原型

游戏内页面沿用桌面版既有实现（不重设计）。新增元素仅两处：

大厅卡片（平台首页既有网格，样式随平台）：

```
┌──────────────┐
│   [icon]     │
│  冰火神庙     │
│ 四神庙 158 关 │
└──────────────┘
```

游戏选择页底部新增「返回大厅」按钮（web 宿主专属，桌面版不渲染；排在「设置」左侧）：

```
┌────────────────────────────┐
│        冰火神庙             │
│  [森林] [光明] [冰] [水晶]   │
│                            │
│ [返回大厅] [设置] [退出]     │
└────────────────────────────┘
```

状态覆盖：页面 loading / error 态沿用桌面版既有实现（加载骨架、保存失败横幅+重试），本设计不新增状态机。

## 交互与异常

### 操作流程

1. 大厅 → 冰火神庙卡片 → hash 路由 `#/` 游戏选择页。
2. 选包 → 主菜单 → 选关 → 游戏页；返回大厅入口在游戏选择页底部（web 宿主专属）。
3. 过关 → 结算浮层 → `progressRecord` → localStorage 合并写入 + 解锁下一关。
4. 设置页重置 → 二次确认 → `progressReset` 清进度+历史（音量保留）。

### 边界场景与错误处理

| 场景 | 行为 |
| --- | --- |
| localStorage 写入抛异常（隐私模式/配额） | web-ipc 返回 `{ ok: false, error: { code: 'SAVE_OPEN_FAILED', ... } }` 信封，复用桌面版错误横幅 + 重试 UI 语义 |
| JSON 解析失败（键值损坏） | 视为空档初始化重建该键，不抛错 |
| 读到非法数值（越界音量等） | 按桌面版 zod schema 校验语义钳制到合法域（音量缺省 60/80 对齐 SettingsService.DEFAULTS） |
| 直接打开游戏页（无大厅来源） | hash 路由自包含，无来源依赖；返回大厅链接固定指向 `../../index.html` |
| 「退出」点击 | no-op 返回 ok |

### 验证方式

| 层 | 验证 |
| --- | --- |
| fw-temples web 构建 | 本地 preview：选包→选关→进关场景就绪→过关→localStorage 落键→刷新恢复 |
| 平台集成 | audit-games.js 零错误；run-all-smoke.js 全绿；大厅进游戏→返回大厅链路实测 |
| 存档语义 | 过关刷新仍在；重置后回初始解锁态且音量保留；损坏键值不崩溃 |
| 深度抽样 | forest/light/ice/crystal 各抽 2 关（含谜题关）装载+操作+过关判定 |

不重跑 158 关全量巡检：web 与桌面共用同一渲染层，差异仅存储桥，抽样已覆盖差异面。

## 桌面版更新同步流程

平台侧产物为一次性移植，后续 fw-temples 桌面版更新后按以下流程手动重新上架：

1. fw-temples 仓库拉最新并安装依赖；改渲染层后先过桌面回归（`npm run typecheck` + `npm run test`）。
2. `npm run build:web`（vite.web.config.ts，root=src/renderer、base=./、产物 dist-web/；web 存储桥随源码打进 bundle）。
3. 删除平台 `src/binghuo-shenmiao/` 旧产物，整目录拷入 `dist-web/` 内容。
4. 平台回归：`node tools/audit-games.js` 0 错误、`node tools/run-all-smoke.js` 全绿、浏览器走查大厅进出与存档/重置链路。
5. 两仓各自提交，games 侧提交信息注明 fw-temples 源 commit 号（产物可追溯）。
