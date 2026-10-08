# 游戏平台需求文档（兼容入口）

> **迁移说明（2026-10-08）**：本文件原为四款游戏的合体需求文档。按模块拆分如下，后续需求一律写入 `doc/requirements/<module>/<feature>.md`，本文件不再追加新章节。
>
> | 原章节 | 迁移后 | 需求 ID |
> | --- | --- | --- |
> | 一、色觉挑战（Kuku Kube） | [doc/requirements/color-challenge/core-game.md](requirements/color-challenge/core-game.md) | REQ-CC001 |
> | 二、数字华容道（Sliding Puzzle） | [doc/requirements/sliding-puzzle/core-game.md](requirements/sliding-puzzle/core-game.md) | REQ-SP001 |
> | 三、找猫咪（Hidden Cats） | [doc/requirements/hidden-cats/core-game.md](requirements/hidden-cats/core-game.md) | REQ-HC001 |
> | 五、动物翻翻棋（DouShou Qi – Flip Card） | [doc/requirements/animal-flip-chess/core-game.md](requirements/animal-flip-chess/core-game.md) | REQ-AFC001 |
>
> 以下「全局约定」继续生效，供各模块需求共同引用。

## 全局约定

### 技术栈
- 纯 HTML + CSS + JavaScript，无框架依赖。
- 游戏独立目录，每个游戏一个文件夹，包含 `index.html` 及其资源。
- 通过首页 `data/games.js` 统一注册到游戏清单。

### 数据存储
- 所有持久化数据使用 localStorage，前缀格式：`{游戏slug}-{数据名}`。
- 不使用 Cookie、IndexedDB 或服务端存储。

### 样式规范
- 遵循项目 `design-system.yaml` 中定义的设计 token（颜色、间距、圆角、字体）。
- 统一使用项目 `css/variables.css` 中的 CSS 变量。
- 移动端优先，触控目标最小 44×44px。

### 首页集成
- 游戏开发完成后，在 `data/games.js` 的 `catalog` 数组中追加一条元数据。
- 字段包括：`slug`、`title`、`path`、`icon`、`desc`。

