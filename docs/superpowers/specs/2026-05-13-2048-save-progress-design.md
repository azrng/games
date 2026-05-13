# 2048 游戏进度存储设计

## 目标

2048 游戏支持将游戏进度保存到浏览器 localStorage，关闭页面重新打开时自动恢复进度。

## 约束

- 游戏结束（Game Over）或胜利后不保存进度，下次打开重新开始
- 复用现有 `AppStore` 存储工具（`window.AppStore`）
- 仅修改 `2048/script.js`

## 保存内容

通过 `AppStore.setGameJSON('2048', 'game_state', state)` 存储：

```json
{
  "grid": [[null, 2, null, 4], ...],
  "score": 1234,
  "over": false,
  "won": false,
  "keepPlayingAfterWin": false
}
```

## 保存时机

- **每次移动后**：`move()` 成功且游戏未结束时保存
- **游戏结束时**：清除已保存的状态
- **新游戏时**：清除已保存的状态

## 恢复时机

- **构造函数**：尝试读取已保存状态，有则恢复棋盘和分数
- 无有效存档时走正常的 `startGame()` 流程

## 改动点

仅 `2048/script.js`，约 3 处：

1. 构造函数增加 `restoreGameState()` 调用
2. 新增 `restoreGameState()` 方法
3. `move()` 成功后调用 `persistState()` / 游戏结束时调用 `clearPersistedState()`
4. `startGame()` 中清除旧存档
