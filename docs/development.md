# 开发与测试

## 环境要求

- Node.js 20+（用于开发构建）
- Chrome / Edge 120+（content script 需要 `world: "MAIN"`）

## 本地开发

```bash
npm install
npm run build
```

构建产物在 `dist/`。加载扩展：

1. 打开 `chrome://extensions`（Edge 是 `edge://extensions`）。
2. 打开右上角的「开发者模式」。
3. 点「加载已解压的扩展程序」，选择本项目的 `dist/` 目录。

改完代码后重新运行 `npm run build`，到扩展管理页点刷新，再刷新 B 站页面。

## 开发命令

| 命令                 | 说明                                             |
| -------------------- | ------------------------------------------------ |
| `npm run build`      | Vite 多入口构建到 `dist/`                        |
| `npm run typecheck`  | `tsc --noEmit`                                   |
| `npm run lint`       | ESLint                                           |
| `npm test`           | Vitest，34 个纯逻辑测试                          |
| `npm run test:watch` | Vitest watch 模式                                |
| `npm run icons`      | 从 `public/icons/icon.svg` 生成 16/32/48/128 PNG |
| `npm run format`     | Prettier 格式化                                  |
| `npm run package`    | 构建并打包 Release zip（不含 sourcemap）         |
| `npm run smoke`      | 真实浏览器冒烟测试（Edge，会打开窗口，需要联网） |

## 目录结构

```
src/
  background/       MV3 service worker：LLM 调用、字幕下载、IndexedDB
  content/
    injected.ts     MAIN world：hook 播放器请求、WBI 签名、页面上下文 fetch
    bridge.ts       content ↔ MAIN world 消息桥
    index.tsx       挂载 Shadow DOM + React 面板
    panel/          悬浮窗 / 对话 / 摘要 / 字幕 UI、错误状态、缓存
  options/          设置页
  shared/           类型、B 站工具、LLM 客户端、提示词、摘要引擎、DB
  styles/tokens.css 面板与设置页共用的语义色 token
public/manifest.json
scripts/build.mjs   Vite 多入口构建
scripts/package.mjs 生成 Release zip
scripts/render-icons.mjs 由 SVG 渲染图标
scripts/smoke.mjs   Playwright + Edge 冒烟测试
tests/              Vitest 纯逻辑测试
docs/               设计文档与截图
.github/workflows/  CI 与 Release
```

## 测试

### 单元测试

`npm test` 覆盖字幕归一化、轨道选择、token 估算、分段、检索和格式化等纯逻辑。

### 冒烟测试

`npm run smoke` 会把 `dist/` 加载进一个全新的 Edge 临时配置，打开一个 B 站视频页，验证注入、悬浮窗、摘要 / 字幕 / 对话视图、时间戳跳转、引用核对、拖动、暗色主题和设置页渲染。它不调用真实 LLM，也不使用你的 B 站账号。测试会打开一个可见的 Edge 窗口，结束后自动关闭。默认使用 Edge 的默认安装路径，可以用 `EDGE_PATH` 环境变量覆盖。

设置 `SMOKE_SHOTS_DIR` 后会额外输出截图基线：

```bash
SMOKE_SHOTS_DIR=.smoke-shots npm run smoke
```

> Chrome 137+ 的品牌版本默认禁止 `--load-extension`，所以冒烟脚本使用 Edge；日常开发仍然可以在 Chrome / Edge 里手动加载 `dist/`。

## 发布 Release

普通用户从 GitHub Releases 下载预构建的 zip，解压后在 `chrome://extensions` 里点「加载已解压的扩展程序」即可，不需要 Node.js，也不用自己构建。

生成 zip：

```bash
npm run package
```

脚本会重新构建（不含 sourcemap），输出到 `release/bilicuenote-v<version>.zip`。zip 内含同名顶层目录，解压后直接加载该目录。

推送 `v*` tag 会触发 `.github/workflows/release.yml`：运行 typecheck 和测试，构建 zip，并自动创建 GitHub Release。

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 设计文档

- [核心功能设计](./design.md)
