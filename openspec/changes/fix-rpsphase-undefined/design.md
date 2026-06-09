## Context

在动物翻翻棋游戏的 script.js 中，`initGame()` 函数在第 65 行使用了变量 `rpsPhase`，但该变量从未在状态变量声明部分用 `let` 声明。这导致 JavaScript 抛出 `ReferenceError: rpsPhase is not defined` 错误，使 `initGame()` 函数崩溃，后续的棋盘渲染也无法执行。

## Goals / Non-Goals

**Goals:**
- 修复 `rpsPhase` 变量未定义的错误
- 确保游戏能正常初始化和运行

**Non-Goals:**
- 不改变游戏的核心逻辑
- 不重构整个状态管理系统

## Decisions

### 1. 在状态变量声明部分添加 rpsPhase 声明

**选择**: 在 script.js 的状态变量声明区域（约第 33 行附近）添加 `let rpsPhase = 'a-turn';`

**理由**: 这是最直接的修复方式，与其他状态变量（如 `currentPlayer`, `phase` 等）的声明方式保持一致。

**替代方案**: 
- 在 `initGame()` 内部声明：会导致变量作用域过窄，其他函数可能无法访问
- 使用 `window.rpsPhase`：不符合模块化编程最佳实践

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 无明显风险 | 这是一个简单的变量声明修复 |
