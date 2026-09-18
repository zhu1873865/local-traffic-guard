# Git 版本管理

GitHub 仓库：https://github.com/zhu1873865/clash-traffic-guard

主分支为 `main`，初始版本标签为 `v1.0.0`。仓库设为私有。

## 保存并上传一次修改

在本项目目录打开终端：

```powershell
git status
git diff
npm test
git add .
git diff --cached --stat
git commit -m "fix: 描述这次修改"
git push
```

`commit` 保存本地版本，`push` 上传到 GitHub。每次做完一项独立修改并验证后再提交，提交说明写清楚改了什么。

## 查看历史和对比

```powershell
git log --oneline --decorate -10
git diff v1.0.0..HEAD
```

要查看首版而不影响主分支，可以从标签创建一个新分支。先确保 `git status` 没有未保存的修改：

```powershell
git switch -c inspect-v1 v1.0.0
# 看完后回到主分支
git switch main
```

## 较大功能单独开发

```powershell
git switch -c feature/功能名称
# 修改、测试并提交
git push -u origin HEAD
```

## 新版本标签

更新 `package.json` 的版本号，验证并提交后，再为该提交创建新标签，例如：

```powershell
git tag -a v1.0.1 -m "v1.0.1: 描述版本变化"
git push origin v1.0.1
```

标签用于定位源码版本，不等于上传了 EXE 安装包。`runtime/`、`release/`、`artifacts/` 和 `node_modules/` 不进入仓库。运行时、打包方法及本地用户设置的存放位置见 README。
