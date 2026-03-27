# 本次目标

修复 GitHub Pages 工作流发布失败问题，移除对自定义 token 推送 `gh-pages` 分支的依赖。

# 核心改动

- 将 `.github/workflows/deploy-docs.yml` 改为 GitHub 官方 Pages 工作流
- 使用内置 `GITHUB_TOKEN` 所需权限和官方 `deploy-pages` 发布动作
- 发布前自动补齐 `.nojekyll`
- 在 `TASK.md` 记录本次任务

# 修改文件

- `.github/workflows/deploy-docs.yml`
- `TASK.md`

# 校验情况

- 已检查工作流 YAML 结构、触发条件、权限和发布步骤
- 未在 GitHub Actions 远端环境实际执行，暂未验证仓库 Pages 设置

# 风险或遗留项

- 需要在仓库 `Settings > Pages` 中确认 Source 为 `GitHub Actions`
- 若仓库工作流权限受限，需要确认默认 `GITHUB_TOKEN` 拥有 Pages 部署权限
