# ACT 工作台

ACT 工作台是一个 Obsidian 仪表盘插件，用于把行动、时间、知识、滴答清单和常用技能入口集中到一个工作台视图中。

## 功能

- 行动指北：查看今日任务、任务推进、下一步行动和进展记录。
- 时间视图：周计划、12 周流程、日志入口。
- 知识视图：主题索引、知识总览、最近写的卡片。
- 滴答清单：读取、创建、编辑、完成和删除滴答清单任务。
- Skill 入口：从 Obsidian 中调用常用本地技能命令。
- GitHub 更新：从 GitHub Releases 下载 `main.js`、`manifest.json`、`styles.css` 完成更新。

## 安装

1. 下载 Release 中的 `act-workspace-x.y.z.zip`。
2. 解压后把文件夹放入 Obsidian Vault 的 `.obsidian/plugins/` 目录。
3. 在 Obsidian 设置 → 社区插件中启用「ACT 工作台」。

## GitHub 更新发布规则

插件配置页支持填写 GitHub 仓库，例如：

```text
owner/act-workspace
```

也可以填写完整地址：

```text
https://github.com/KivenBig/obsidian-act-console
```

自动更新依赖 GitHub 最新 Release 的附件。每次发布 Release 时，请至少上传：

- `main.js`
- `manifest.json`
- `styles.css`

不要上传 `data.json`。它是本地配置文件，可能包含个人路径、Access Token 或其他私有设置。

## 开发

```bash
npm install
npm run build
```

构建脚本会从 `themes/payview-saas.css` 生成 `theme-data.gen.ts`，然后打包 `main.ts` 到 `main.js`。

## 隐私

开源仓库和发布包不应包含：

- `data.json`
- `backups/`
- `.DS_Store`
- 本地绝对路径
- API Token 或个人账号信息
