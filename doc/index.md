---
doc_id: DOC-INDEX
doc_type: index
module: global
status: approved
last_updated: 2026-10-08
---

# 文档总索引

> 本文件只做导航，不承载具体方案内容。

## 项目目标

休闲与教育类网页小游戏合集（静态页，vanilla JS，无构建链），托管于 GitHub Pages。

## 模块与文档导航

| 模块 | 功能 | 类型 | 状态 | 路径 |
| --- | --- | --- | --- | --- |
| typing-cannon | 成人词包与词义模式 | 需求 | approved | [doc/requirements/typing-cannon/adult-word-packs.md](../requirements/typing-cannon/adult-word-packs.md) |
| typing-cannon | 成人词包与词义模式 | 设计 | approved | [doc/design/typing-cannon/adult-word-packs.md](design/typing-cannon/adult-word-packs.md) |
| typing-cannon | 词包数据结构 | 契约 | superseded（已落地为 `src/typing-cannon/wordpacks.js`） | [doc/contracts/typing-cannon/word-pack.md](contracts/typing-cannon/word-pack.md) |
| typing-cannon | 错词本（复习局 + 毕业机制） | 需求 | approved | [doc/requirements/typing-cannon/review-book.md](../requirements/typing-cannon/review-book.md) |
| typing-cannon | 错词本（复习局 + 毕业机制） | 设计 | approved | [doc/design/typing-cannon/review-book.md](design/typing-cannon/review-book.md) |
| typing-cannon | 错词本存储 | 契约 | superseded（已落地进 `src/typing-cannon/script.js`） | [doc/contracts/typing-cannon/review-book.md](contracts/typing-cannon/review-book.md) |
| typing-cannon | 听写模式 | 需求 | approved | [doc/requirements/typing-cannon/dictation-mode.md](../requirements/typing-cannon/dictation-mode.md) |
| typing-cannon | 听写模式 | 设计 | approved | [doc/design/typing-cannon/dictation-mode.md](design/typing-cannon/dictation-mode.md) |
| pinyin-typing | 拼音打字乐园核心玩法 | 需求 | approved | [doc/requirements/pinyin-typing/core-game.md](../requirements/pinyin-typing/core-game.md) |
| pinyin-typing | 拼音打字乐园核心玩法 | 设计 | approved | [doc/design/pinyin-typing/core-game.md](design/pinyin-typing/core-game.md) |
| pinyin-typing | 存储与字库结构 | 契约 | superseded（已落地进 `src/pinyin-typing/script.js` 与 `wordbank.js`） | [doc/contracts/pinyin-typing/core-game.md](contracts/pinyin-typing/core-game.md) |
| game-hub | 首页年龄筛选 Tab | 需求 | approved | [doc/requirements/game-hub/age-filter.md](../requirements/game-hub/age-filter.md) |
| game-hub | 首页年龄筛选 Tab | 设计 | approved | [doc/design/game-hub/age-filter.md](design/game-hub/age-filter.md) |
| game-hub | 首页目录适龄分类结构 | 契约 | superseded（已落地为 `src/data/games.js`） | [doc/contracts/game-hub/age-filter.md](contracts/game-hub/age-filter.md) |
| color-challenge | 色觉挑战核心玩法 | 需求 | approved | [doc/requirements/color-challenge/core-game.md](../requirements/color-challenge/core-game.md) |
| sliding-puzzle | 数字华容道核心玩法 | 需求 | approved | [doc/requirements/sliding-puzzle/core-game.md](../requirements/sliding-puzzle/core-game.md) |
| hidden-cats | 找猫咪核心玩法 | 需求 | approved | [doc/requirements/hidden-cats/core-game.md](../requirements/hidden-cats/core-game.md) |
| animal-flip-chess | 动物翻翻棋核心玩法 | 需求 | approved | [doc/requirements/animal-flip-chess/core-game.md](../requirements/animal-flip-chess/core-game.md) |

## 兼容入口

- `doc/requirement.md`：旧版需求合体文档，色觉挑战 / 数字华容道 / 找猫咪 / 动物翻翻棋四章已拆分至 `doc/requirements/<module>/core-game.md`；仅保留迁移说明与全局约定，不追加新章节。
- `doc/design/设计文档.md`：旧版按功能追加的合体设计文档，仅保留历史内容，不追加新章节；新功能一律使用上述模块化结构。
- `doc/devlog/`：按日期记录的开发日志，不属于需求/设计/契约体系。
