# DSH Knowledge Studio

[English](README.en.md)

为 DeepSeek Harness 的工作区提供资料驱动的创作与学习工具。直接使用现有文件、对话和模型配置；可选的本地索引与 Wiki 帮助查找和阅读资料，不是使用 Studio 的前置条件。

| Studio | 成果 |
| --- | --- |
| 报告 | 简报、学习指南、自定义报告；DOCX、PDF、Markdown |
| 演示文稿 | 可编辑 PPTX、PDF、HTML |
| 数据表 | XLSX、CSV |
| 思维导图 | 节点浏览、引用和追问 |
| 测验 / 闪卡 | 答题反馈、学习进度、回到对话继续讨论 |
| 音频 / 视频概览 | WAV、MP4、字幕、可选旁白和配乐、视频预览 |

工作区知识区可以折叠；Wiki 有章节目录，成果可以展开阅读，保留原会话与输入草稿。引用来自工作区资料。信息图不在本版范围内。

## 两个独立包

| 包 | 版本 | 职责 |
| --- | --- | --- |
| `@eduwork/dsh-knowledge-studio` | `0.4.0` | 工作区资料、索引/Wiki、Studio 界面与成果 |
| `@eduwork/dsh-artifact-services` | `0.1.0` | Office、语音提供方、媒体渲染、对话工具与六类通用技能 |

Studio 精确依赖共享包，两包版本应配套安装。共享服务也可以供其他应用或插件直接使用，不依赖 Studio、Memory、校园登录或 ChatECNU Work。

## 安装

需要 **Node.js 22.19+ 或 24、DSH 0.1.2-rc.1**。使用 npm 分发的版本时，在已有 DSH Profile 中安装：

```sh
dsh plugin --profile web add @eduwork/dsh-knowledge-studio@0.4.0
```

从源码构建：

```sh
npm ci
npm run build
npm run pack:release
```

将 `dist/packages/` 中两个压缩包复制到目标 Profile 项目，再在该项目中一起安装：

```sh
npm install ./eduwork-dsh-artifact-services-0.1.0.tgz ./eduwork-dsh-knowledge-studio-0.4.0.tgz
```

安装本地 tarball 不会自动启用目标 Profile；启用步骤、独立 Web 启动及运行环境配置见 [使用指南](docs/USAGE.md)。加载 Studio bundle 时会注册共享服务；不要另装第二份共享服务或旧 Office 执行插件。

Office 需要另行准备 Python 3.12+ 和共享包的 `python/requirements.txt`，以 `DSH_OFFICE_PYTHON` 指向解释器。PDF、视频使用 Chromium；可注入已准备的运行时，独立模式首次使用会准备 Remotion 浏览器。Windows 自带语音可离线使用，音色以本机实际安装为准；其他系统或厂商可通过统一接口注册语音提供方。详见 [扩展接口](docs/ARCHITECTURE.md)。

## 开发与边界

[开发和测试](docs/DEVELOPMENT.md) · [架构](docs/ARCHITECTURE.md) · [迁移](docs/MIGRATION.md) · [版本记录](CHANGELOG.md) · [发布流程](https://github.com/freedomkk-qfeng/dsh-knowledge-studio/blob/main/docs/RELEASING.md)

索引和检索在本机运行。生成 Wiki、报告或媒体脚本会调用用户配置的模型并发送所需资料；费用和数据处理由该模型服务决定。知识准备需单独确认，不自动扫描或生成全工作区知识。

Office 处理支持文档中列出的结构化功能，不承诺完整 Office 排版、宏、公式计算或演示动画编辑。字幕按实际语音片段同步，不承诺逐字时间戳。可编辑视频工程会执行工作区 React 代码，只应渲染可信工程。

项目代码按 [MIT](LICENSE) 提供。Remotion、Chromium、PDF.js 和其他依赖保留自己的许可；MIT 不覆盖它们的全部使用条件。见 [第三方说明](THIRD_PARTY_NOTICES.md) 和 [配乐来源](https://github.com/freedomkk-qfeng/dsh-knowledge-studio/blob/main/packages/artifact-services/media/BGM-USAGE.md)。
