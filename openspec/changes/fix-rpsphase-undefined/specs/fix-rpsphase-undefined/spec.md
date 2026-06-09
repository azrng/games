## ADDED Requirements

### Requirement: 游戏初始化无错误
游戏初始化过程 SHALL 完成所有必要的状态变量声明，确保不抛出 ReferenceError 错误。

#### Scenario: 正常初始化
- **WHEN** 用户加载游戏页面
- **THEN** 系统 SHALL 完成 initGame() 函数执行，不抛出任何 ReferenceError 错误

#### Scenario: rpsPhase 变量可用
- **WHEN** initGame() 函数执行
- **THEN** 系统 SHALL 能够正确访问和赋值 rpsPhase 变量

### Requirement: 棋盘正常渲染
游戏初始化后 SHALL 正常显示 4x4 棋盘，所有卡牌可见。

#### Scenario: 棋盘渲染成功
- **WHEN** initGame() 函数完成
- **THEN** 系统 SHALL 成功调用 renderBoard()，显示 16 张卡牌
