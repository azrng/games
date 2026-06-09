## ADDED Requirements

### Requirement: 猜拳后棋盘显示
猜拳结束后，系统 SHALL 正常显示游戏棋盘，让玩家可以开始游戏。

#### Scenario: 猜拳后棋盘正常显示
- **WHEN** 猜拳结束，游戏进入 play 阶段
- **THEN** 系统 SHALL 正常显示 4x4 棋盘，所有卡牌可见

#### Scenario: 状态正确切换
- **WHEN** 猜拳判定出胜负
- **THEN** 系统 SHALL 正确切换到 play 阶段，并渲染棋盘
