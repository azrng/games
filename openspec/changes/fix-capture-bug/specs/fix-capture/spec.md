## ADDED Requirements

### Requirement: 吃子操作正常响应
玩家选择己方棋子后，点击相邻敌方棋子 SHALL 能正常执行吃子操作。

#### Scenario: 正常吃子
- **WHEN** 玩家选择己方棋子，点击相邻且可战斗的敌方棋子
- **THEN** 系统 SHALL 执行吃子，己方棋子移动到目标位置

#### Scenario: 等级不足无法吃子
- **WHEN** 玩家选择己方棋子，点击相邻但等级更高的敌方棋子
- **THEN** 系统 SHALL 显示操作失败反馈

### Requirement: 操作反馈
系统 SHALL 对玩家操作提供明确的视觉反馈。

#### Scenario: 无效移动反馈
- **WHEN** 玩家尝试无效移动
- **THEN** 系统 SHALL 取消选择并显示提示
