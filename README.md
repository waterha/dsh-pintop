# dsh-pintop
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
**简体中文** | [English](README.en.md)

为 DeepSeek Harness 提供 Windows 窗口置顶功能的独立插件。按钮位于左侧边栏底部：展开时显示「窗口置顶 / 取消置顶」，收起时显示图钉图标，并保留无障碍标签。

## 运行前置

- Windows。
- PowerShell 7，命令名为 `pwsh.exe`，并已加入 `PATH`。
- 插件默认使用当前 Harness 宿主进程的可执行文件路径，不依赖固定安装目录。移动或重新安装 Harness 后无需修改插件。

如果宿主环境无法通过 `process.execPath` 提供正确的 `DeepSeek Harness.exe` 路径，可在插件配置中设置 `executablePath`，或设置 `DSH_PINTOP_EXECUTABLE` 环境变量。路径必须是实际存在的 `DeepSeek Harness.exe` 的绝对路径。

## 安装
方法一：<br>
在deepseek harness对话框中输入：“请帮我安装这个插件https://github.com/waterha/dsh-pintop.git”
等待安装完毕重启dsh即可正常使用

方法二：
```powershell
dsh plugin --profile web add dsh-pintop
```

在正在运行的 Harness **插件管理器**中，使用本地包路径安装。将以下示例替换为你的实际克隆路径：

```text
file:C:/path/to/dsh-pintop
```


## 许可证

[MIT](LICENSE)
