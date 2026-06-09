## ADDED Requirements

### Requirement: 卡牌所有者视觉区分
翻开的卡牌 SHALL 通过明显的视觉样式区分所有者。

#### Scenario: 玩家 A 的卡牌样式
- **WHEN** 卡牌被翻开且归属玩家 A
- **THEN** 卡牌 SHALL 显示浅红色背景和红色边框

#### Scenario: 玩家 B 的卡牌样式
- **WHEN** 卡牌被翻开且归属玩家 B
- **THEN** 卡牌 SHALL 显示浅蓝色背景和蓝色边框

#### Scenario: 无归属卡牌样式
- **WHEN** 卡牌已翻开但无归属（如刚翻开未战斗）
- **THEN** 卡牌 SHALL 显示默认白色背景

### Requirement: 卡牌内容清晰可见
卡牌上的动物图标和名称 SHALL 在任何背景下都清晰可读。

#### Scenario: 图标可见性
- **WHEN** 卡牌显示所有者背景色
- **THEN** 动物图标和名称 SHALL 保持足够的对比度，清晰可见
