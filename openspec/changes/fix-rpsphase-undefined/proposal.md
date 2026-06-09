## Why

游戏启动时报错 `rpsPhase is not defined`，导致 `initGame()` 函数在第 65 行崩溃，后续的棋盘渲染也无法执行。这是因为变量 `rpsPhase` 在 `initGame()` 中被使用，但在状态变量声明部分从未用 `let` 声明。

## What Changes

- 在 script.js 的状态变量声明部分添加 `rpsPhase` 变量声明
- 确保 `initGame()` 中对 `rpsPhase` 的赋值不会报错

## Capabilities

### New Capabilities
- `fix-rpsphase-undefined`: 修复 rpsPhase 变量未定义导致的游戏初始化崩溃

### Modified Capabilities
<!-- 无现有规范需要修改 -->

## Impact

- 修改 `animal-flip-chess/script.js` 中的状态变量声明部分
- 修复游戏初始化流程，使棋盘能正常渲染
