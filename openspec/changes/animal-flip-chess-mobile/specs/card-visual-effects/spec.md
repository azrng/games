## ADDED Requirements

### Requirement: 动物图案展示
卡片正面 SHALL 使用 SVG 矢量图展示动物图案，确保在不同分辨率下清晰显示。

#### Scenario: 动物图案加载
- **WHEN** 游戏初始化或翻开卡片
- **THEN** 卡片正面 SHALL 显示清晰的 SVG 动物图案（象、狮、虎、豹、狼、狗、猫、鼠）

#### Scenario: 高清屏幕适配
- **WHEN** 用户在高 DPI 屏幕上查看卡片
- **THEN** SVG 图案 SHALL 保持清晰，无模糊或锯齿

### Requirement: 3D 翻转动画
卡片翻开时 SHALL 使用 3D 翻转动画效果，卡片绕 Y 轴旋转 180 度。

#### Scenario: 翻牌动画执行
- **WHEN** 用户点击面朝下的卡片
- **THEN** 卡片 SHALL 执行 3D 翻转动画，持续时间 600ms，动画曲线为 ease-in-out

#### Scenario: 动画流畅性
- **WHEN** 翻牌动画执行过程中
- **THEN** 动画 SHALL 保持 60fps 流畅度，无卡顿或闪烁

### Requirement: 卡片背面花纹设计
卡片背面 SHALL 使用统一的花纹图案，与游戏主题风格一致。

#### Scenario: 背面花纹显示
- **WHEN** 卡片处于未翻开状态
- **THEN** 卡片背面 SHALL 显示统一的花纹图案，颜色和样式与游戏整体风格协调

#### Scenario: 背面图案一致性
- **WHEN** 多张卡片同时显示背面
- **THEN** 所有卡片背面 SHALL 使用相同的花纹图案，保持视觉统一

### Requirement: 卡片状态视觉区分
不同状态的卡片 SHALL 有清晰的视觉区分。

#### Scenario: 选中状态
- **WHEN** 用户选中一个棋子
- **THEN** 选中的卡片 SHALL 显示高亮边框或阴影效果，明确标识选中状态

#### Scenario: 已翻开状态
- **WHEN** 卡片已翻开显示动物
- **THEN** 卡片正面 SHALL 有轻微的背景色或边框，与未翻开卡片区分

#### Scenario: 被吃掉状态
- **WHEN** 棋子在战斗中被吃掉
- **THEN** 被吃掉的卡片 SHALL 显示灰色或半透明效果，表示已退出游戏
