# dsh-pintop

**简体中文** | [English](README.en.md)

为 DeepSeek Harness 提供 Windows 窗口置顶功能的独立插件。按钮位于左侧边栏底部：展开时显示「窗口置顶 / 取消置顶」，收起时显示图钉图标，并保留无障碍标签。

## 功能

- 将整个 Harness 窗口置顶，再次点击即可取消。
- 支持连续点击：请求期间按钮保持可用，快速点击以最后一次选择为准，旧响应不会覆盖新选择。
- 从 Windows 的 `WS_EX_TOPMOST` 标志读取真实状态；切换失败时显示错误，并恢复最近确认的状态。
- 使用常驻 PowerShell 控制进程，避免每次点击都重新启动进程和编译原生调用。
- 悬停不触发后台查询，也不弹出系统 `title` 提示；焦点变化时的状态查询有频率限制。
- 不使用 localStorage，不修改窗口的位置、尺寸或焦点。

## 环境要求

- Windows。
- DeepSeek Harness **0.2.0-rc.2 或更新版本**。
- PowerShell 7，宿主进程的 `PATH` 中可找到 `pwsh.exe`。

插件本身没有第三方运行时依赖，无需构建。

## 安装

将本仓库克隆到本地：

```powershell
git clone https://github.com/waterha/dsh-pintop.git
```

在正在运行的 Harness **插件管理器**中，使用本地包路径安装。将以下示例替换为你的实际克隆路径：

```text
file:C:/path/to/dsh-pintop
```

插件包含 `cordis.patch.yml`，官方插件管理器会安装宿主与客户端两部分。桌面应用管理的 profile 应通过应用内插件管理器安装。

对于自行管理的 CLI profile，可使用官方 CLI：

```text
dsh plugin --profile <profile> add file:C:/path/to/dsh-pintop
```

### 配置 Harness 路径

当前默认可执行文件路径为：

```text
C:\Sofware\dsh\DeepSeek Harness.exe
```

如果你的安装位置不同，请通过宿主配置 `executablePath` 或环境变量 `DSH_PINTOP_EXECUTABLE` 指定实际可执行文件的完整路径。例如，在启动 Harness 前设置：

```powershell
$env:DSH_PINTOP_EXECUTABLE = 'D:\Apps\DeepSeek Harness\DeepSeek Harness.exe'
```

配置由宿主控制，浏览器请求不能修改路径，也不能传入进程 ID 或窗口句柄。

### 升级与性能

从 0.1.0 升级后，请**完全退出并重新打开 Harness**。即使重新安装了插件，当前宿主仍可能缓存旧模块；仅刷新页面不足以更新后台代码。

首次请求需要启动 PowerShell 并编译 Win32 调用，后续切换复用同一进程。开发机的真实窗口测试中，首次启动约 3.5 秒，后续 10 次切换为 9–34 毫秒，平均约 14 毫秒；实际耗时取决于机器环境。

置顶只对当前原生窗口的生命周期有效，尚未实现退出后记忆状态或启动时自动置顶。

## 原生控制与 API

原生实现使用 `Add-Type`、user32 `SetWindowPos` 和 `GetWindowLongPtr/GetWindowLong`，兼容 32/64 位调用。插件按配置的进程名称查找窗口，再验证完整可执行文件路径，仅处理可见、无所有者的主窗口。缓存的目标在使用时会重新验证。存在多个符合条件的主窗口时，会逐个切换；读取到不一致状态时明确报错。

| 请求 | 作用 |
| --- | --- |
| `GET /api/dsh-pintop` | 读取真实置顶状态 |
| `POST /api/dsh-pintop` | 设置状态，请求体为 `{"enabled": true}` 或 `{"enabled": false}` |

成功响应示例：

```json
{"enabled": true, "windowCount": 1}
```

接口要求 loopback 来源连接与 loopback Host，拒绝跨站网页来源，允许精确的桌面来源 `dsh-app://app`。不启用 CORS，也不信任转发地址。原生操作串行执行，使用有大小限制的 JSON 消息、有界队列和超时；插件卸载时结束工作进程。失败返回非成功 HTTP 状态码。

## 验证

```powershell
node --test test/*.test.mjs
node test/native.mjs
```

单元测试覆盖插件清单、原生文件、客户端加载与侧边栏注册、非法参数、来源校验、连续点击、旧响应处理、失败回退和焦点查询限流。

原生测试需要已打开且可见的 Harness 主窗口：读取初始状态，验证开启与关闭，并在 `finally` 中恢复原状态。该测试会临时改变真实窗口的置顶状态。

测量原生常驻进程的首次启动与连续切换耗时：

```powershell
node test/latency.mjs --native
```

## 许可证

[MIT](LICENSE)
