# Clash Traffic Guard

Windows 本地悬浮球。只让 **PROXY 代理链路流量**触发保护，DIRECT 下载不会触发。

## 直接运行

打开 `release/Clash Traffic Guard/Clash Traffic Guard.exe`，或者桌面的“Clash 流量保护”快捷方式。整个 release 子文件夹是便携程序，不能只移动 EXE。运行时复用了 LearnFlow 的 Electron 33.4.11，未下载依赖；界面使用原生 HTML/CSS/JavaScript，无需 Node.js 即可运行便携版。

- 悬浮球显示 PROXY 上传与下载合计速度；双击打开设置，拖动移动，靠近屏幕边缘自动吸附，右键退出。
- 面板显示内核总流量、PROXY、DIRECT、未归类流量；悬停小球查看 PROXY 上下行。
- 自动读取 Clash Verge Rev 配置，支持 Windows 命名管道与本机 HTTP 接口。密钥不会出现在日志和界面；手动密钥用 Windows safeStorage 加密保存。
- 默认 60 MB/min = 1 MB/s（十进制），连续超过 3 秒报警，5 秒可自动阻断。**初始仅报警；在设置中勾选“超限自动阻断”并保存后生效。** 一次低于阈值或断连会重置连续计时。
- 一分钟、一小时、自然日的 PROXY 累计限制可选；0 代表关闭。累计限额超限立即报警，自动保护开启时立即阻断。
- 可配置声音、Windows 通知、开机启动及阻断后尝试退出 Clash。关闭设置窗口后小球继续工作。

## 分类与统计边界

每秒读取 `/connections` 中连接 ID、累计 upload/download、实际 chains，并结合 `/proxies` 的真实出站类型。Direct 类型或 DIRECT 终点归 DIRECT；链路包含已知代理协议出站则归 PROXY；未知类型保留为未归类。规则组选择了 DIRECT 时不会被误认为 PROXY，自定义名称的 Direct 类型也能识别。链路中存在代理跳的中继连接按 PROXY 计。

总流量来自内核累计计数的差分，**不是全电脑网卡流量**。只统计被 Mihomo 接管的流量。未经过 Clash 的 Windows Update 不在这里出现。

连接快照不能找回两次采样间已经关闭的短连接末尾字节，所以 PROXY / DIRECT 是在线观测值，可能漏计；总量差额列为“未归类 / 短连接”，不会擅自算进 PROXY。首次连接、断线恢复、计数重置时重新建立基线，避免把历史流量当成瞬时突增。不是机场计费工具，也不能保证对短连接突发流量零漏报。多路复用/中继等场景可能存在内核计数口径差异。

累计量每 15 秒保存，正常退出立即保存；按本机自然日清零今日值，分钟/小时使用滚动窗口。应用没运行、内核断连及采样空档不补计，异常退出最多丢失最后一个保存周期。达到累计限额后恢复连接，若仍超限，下一次采样会再次阻断；需等滚动窗口恢复或在恢复后调整限额。

## 阻断与恢复

触发条件只看 PROXY。执行时先保存原模式与 GLOBAL 选择，再把 GLOBAL 设为 REJECT、切到 global 模式、删除现有连接并回读校验。**阻断会影响所有经过 Clash 的连接，包括 DIRECT**。不会关闭 Windows 系统代理来让软件悄悄转直连，也不会修改订阅文件或系统防火墙。

保护锁定期间，每 3 秒检查模式，发现配置被覆盖则重新阻断；有短暂检测间隔，不是系统级硬隔离。服务模式不依赖杀进程也可阻断。若开启退出 Clash，会尝试结束已知 Clash/Mihomo 进程，检查 API 是否仍可达，权限不足或服务重启时继续维持 API 阻断。API 不可达仅表示无法访问，不能推断为流量归零或整机断网。

点击“恢复连接”会恢复之前的模式与 GLOBAL 选择。阻断中的程序即使退出也保留恢复记录；先重新打开 Clash，再启动小球即可恢复。若手工恢复，可在 Clash 中改回“规则”模式并选择原节点，同时退出本工具，以免其重新施加锁定。退出小球本身不会自动解除阻断。

## 开发与验证

GitHub 下载的源码不包含 Electron 二进制文件。这台电脑上可先从 LearnFlow 复制运行时，无需重复下载：

```powershell
# 在本项目目录执行；已有 runtime 目录时跳过此步骤
Copy-Item -LiteralPath 'C:\Users\zhu18\Desktop\LearnFlow\node_modules\electron\dist' -Destination '.\runtime' -Recurse
```

其他电脑需要自行准备 Electron 33.4.11 Windows x64 运行时，将解压后的 `electron.exe` 及配套文件放在 `runtime/` 内。

```
npm start
npm test
npm run probe
npm run package
node scripts/start.cjs --smoke
```

项目无 npm 依赖；`runtime/` 是从 LearnFlow 复制的 Electron 运行时。`probe` 只读本机接口，不输出密钥、节点名或访问地址。`--smoke` 使用隔离设置、禁用自动阻断、生成界面截图并退出。单元测试覆盖 DIRECT 大流量不误报、代理持续超限、短连接缺失、重连基线、累计限额、午夜及阻断恢复；实际阻断用模拟内核测试，不会中断当前网络。

设置、统计和恢复记录位于 `%APPDATA%/Clash Traffic Guard`。不要在锁定保护时删除 recovery.json。

接口依据：[Mihomo API](https://wiki.metacubex.one/api/)、[连接统计实现](https://github.com/MetaCubeX/mihomo/blob/Meta/tunnel/statistic/tracker.go)、[代理链路定义](https://github.com/MetaCubeX/mihomo/blob/Meta/constant/adapters.go)。

## 版本管理

源码仓库：[zhu1873865/clash-traffic-guard](https://github.com/zhu1873865/clash-traffic-guard)。日常提交、上传、历史对比和版本标签操作见 [Git 使用说明](GIT_GUIDE.md)。
