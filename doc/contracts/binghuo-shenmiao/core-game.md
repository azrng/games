---
doc_id: CON-BH001
doc_type: contract
module: binghuo-shenmiao
status: draft
last_updated: 2026-10-13
related:
  - doc/requirements/binghuo-shenmiao/core-game.md
  - doc/design/binghuo-shenmiao/core-game.md
---

# 冰火神庙 · web 版存储适配契约（草案）

> 状态：draft。接口形状的最终事实来源为 fw-temples `src/shared/ipc-types.ts` 的 `IpcSdk`（桌面版已落地），本契约只声明 web 侧映射与差异，不复制完整字段结构。

## 映射总表

| IpcSdk 方法 | localStorage 键 | web 行为差异 |
| --- | --- | --- |
| ping | — | 返回 `{ pong: true, appVersion, electronVersion: 'web' }` |
| quitApp | — | no-op，返回 ok |
| progressList | `app_game_binghuo-shenmiao_progress` | 结构：`{ [gameId]: { [levelId]: LevelProgressSummary } }` |
| progressRecord | 同上 | 合并写入：completed 置真、解锁 nextLevelId、bestTimeMs 取最小、红/蓝钻取历史并集；返回该关最新进度 |
| progressReset | 同上 + history 键 | 清空全部四包进度与对局历史；settings 键保留 |
| settingsGet | `app_game_binghuo-shenmiao_settings` | `{ musicVolume, sfxVolume }`，缺省 100 |
| settingsSet | 同上 | 部分字段合并，返回全量 |
| historyList | `app_game_binghuo-shenmiao_history` | 结构：`{ [gameId]: PlayRecord[] }`，新记录前插，各包截断 20 条 |

## 语义对齐约束

- 进度合并、解锁、重置语义与桌面版主进程实现一致；`LevelProgressSummary` / `PlayRecord` / `GameSettings` 字段含义见源型契约，不在本文件重复。
- 所有方法返回 `IpcResult<T>` 信封；localStorage 抛异常（配额/隐私模式）时返回 `{ ok: false, error: { code: 'SAVE_OPEN_FAILED' } }`，错误码沿用桌面版既有值。
- 键值 JSON 损坏按空档重建，不抛错。

## 落地

阶段 1 落地为 fw-temples `src/renderer/src/lib/ipc/web-ipc.ts`，届时代码为最终事实来源，本契约转 `superseded`。
