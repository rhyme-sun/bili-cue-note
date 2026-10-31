# BiliCueNote 核心功能设计

本文说明产品边界、核心链路和关键实现约定，供了解实现取舍或参与开发时参考。

## 1. 定位与边界

- 贴在 B 站视频页上的学习 / 研究伴侣：对话是主入口，摘要是锚点，字幕是证据层。
- Manifest V3 浏览器扩展，以 Shadow DOM 浮窗注入页面，不依赖 B 站布局。
- BYOK，只走 OpenAI 兼容协议，不绑定厂商。
- 本地优先，无后端、无账号、无遥测；API Key 只存 `chrome.storage.local`。
- 只支持 B 站普通视频 `/video/BV...`（含分 P 与合集，v1 只处理当前 P）；番剧、直播、课程、首页和搜索页不注入入口。
- v1 不做：双语字幕翻译、思维导图、截图笔记、ASR 兜底、用量 / 费用统计、多平台、云同步、账号、商店上架。

## 2. 用户流程

1. 打开 B 站普通视频页，页面右侧出现 44px 圆形品牌入口。
2. 首次使用时，在设置页填写 Base URL、API Key 和模型名。
3. 点击入口，打开可拖动、可缩放、会记住位置的悬浮窗；默认视图是对话。
4. 直接在对话里提问，或点概览条的「生成摘要」，获取字幕后调用模型并缓存结果。
5. 点击时间戳跳转播放；悬停核对字幕原文或跳到字幕视图；字幕可以搜索和导出。

## 3. 字幕获取（核心链路）

- 被动优先：MAIN world 脚本在 `document_start` hook 播放器请求，捕获 `x/player/wbi/v2`（以及旧的 `x/player/v2`）响应，按 `cid` 保存。
- 主动兜底：用户点击生成时如果还没捕获到，就经 MAIN world 桥在页面上下文带 cookie 调用播放器接口（含 WBI 签名），结果同样缓存。
- 不读取、不上传 `SESSDATA`，只依赖浏览器自动携带的 cookie。
- 轨道优先级：`ai-zh` > `zh-CN` > `zh-Hans` > 第一条。
- 字幕 JSON 由 background 带 host 权限下载，按 `cid` 缓存。
- 未登录时提示登录，没有字幕轨时明确提示。轨道是否可用只看 `subtitle_url` 是否非空；`ai_status = 2` 表示 AI 字幕已生成，不能据此判断「生成中」。只有空 URL 的 AI 轨道标记 `ai_status = 1` 时，才提示「生成中」并允许重试。
- 遇到风控 `412` / `-352`，退避重试最多 2 次，然后提示稍后再试。
- 不做 ASR 兜底。

## 4. 摘要

- 结构：一句话总览 + 至少 3 个带时间戳的章节 + 关键要点 / 术语表。
- 长度分简 / 中 / 详；模板固定，不开放自定义提示词。
- 输出语言默认跟随视频，可以切换。
- 长视频：transcript 估算 token 超过模型上下文约 60% 时自动 map-reduce，显示「第 2/5 段」进度，最后分层合并。
- 缓存 key：`cid + 模型 + promptVersion + 长度档 + 输出语言`。换模型或模板不会复用旧摘要。
- 提供「重新生成」「停止生成」和「清除全部缓存」。
- 生成过程显示阶段化进度（取字幕 / 第 i/n 段 / 合并），不把原始 JSON 流展示给用户。重新生成时保留旧摘要，成功后替换。
- 输出用 JSON schema 约束，解析失败时回退为 Markdown 文本。

## 5. 字幕视图

- 在面板的「字幕」视图打开，全文带时间戳，按时间间隔分段显示。
- 支持搜索、点击跳转和复制。
- 可导出 TXT / SRT / Markdown；摘要可复制为 Markdown。
- 从对话引用点「在字幕中查看」时，自动滚动到对应段落并高亮。

## 6. 对话

- 对话是默认视图。阈值内整份 transcript 进入上下文。
- 超出阈值时，按关键词 + 时间窗检索相关字幕行，并附带相邻行和摘要。追问时把最近 3 轮用户问题一起用于检索，同时强制纳入上一条回答引用时间戳附近的字幕行。
- 回答必须引用至少一个时间戳，点击可跳转；悬停引用显示字幕原文，也能定位到字幕视图。
- 回答下方提供「复制 / 重新生成 / 再展开」；最近一条回答后附 2~3 条追问建议，由引用时间戳、摘要术语和章节在客户端生成，不额外调用模型。
- 章节卡片提供「问这章」，输入框上方提供「引用当前播放位置」chip。
- 对话保持单一线性主线，v1 不做分支。
- 时间戳显示与 B 站进度条一致：视频不足 1 小时用 `mm:ss`，达到 1 小时用 `h:mm:ss`（如 `0:03:21`）。`[mm:ss]`、`【mm:ss】`、裸 `mm:ss`，以及模型从字幕上下文复用的 `[17.6s]` / `[17.6秒]`，都会渲染成可点击按钮。
- 视频里没有的内容，明确回答「视频中未提及」，不编造。
- 对话历史按视频存在本地，可一键清空。回答语言跟随提问语言，通常是中文。

## 7. 界面与主题

- 入口：页面右侧 44px 圆形品牌按钮，粉色；窗口打开时隐藏，悬停显示提示。
- 面板：可拖动、可缩放的悬浮窗，默认 420×640，最小 360×480，最大宽度为 760px 且不超过视口宽度。挂在 `body` 的 Shadow DOM 里，不依赖 B 站布局。拖头部移动，右下角缩放，位置和尺寸存在 `chrome.storage.local` 并限制在视口内。按 Esc、点关闭按钮或点页面空白处关闭，点播放器不会关闭。
- 信息架构：单面板三视图。顶栏只有品牌、标题、主题、设置和关闭；其下用图标切换对话 / 摘要 / 字幕，悬停显示名称。对话顶部有摘要概览条，点箭头展开或收起；清空对话位于输入框上方，点击后需要二次确认。
- 视觉：参考 shadcn/ui 的设计语言，用语义色 token、细边框和克制的动效；中性色打底，B 站粉 `#FB7299` 只用于入口、主按钮、选中态和时间戳。
- 明暗主题：默认跟随 B 站页面（`html.bili_dark` / `theme_style` cookie），取不到再回退系统。面板顶栏的月亮 / 太阳按钮可以一键固定深浅色；设置页也能选「跟随 / 浅色 / 深色」，选择存入 `chrome.storage.local`。设置页选「跟随」时按系统明暗渲染。
- 全屏播放时面板不可见，v1 不处理。
- 监听 SPA 路由变化，切换视频或分 P 时自动重置。
- 设置页：模型配置（Base URL / API Key / Model / 上下文窗口，默认 128k）、输出语言、摘要长度、测试连接和清除缓存；显示未保存修改提示，预设按已保存的值回显。
- 界面语言为中文。

## 8. 技术架构

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
tests/              Vitest 纯逻辑测试
```

- Vite + React + TypeScript + Tailwind CSS，Manifest V3，支持 Chrome / Edge。
- content script（隔离世界）+ MAIN world 注入脚本（hook 请求、页面上下文桥）+ background service worker（LLM 调用、字幕下载、IndexedDB）+ options 页面。
- 设置和 key 存 `chrome.storage.local`，不同步。
- transcript、摘要和对话存 IndexedDB（extension origin，由 background 持有）；content script 通过消息读写，避免落到 B 站 origin。
- LLM 走 OpenAI 兼容协议，默认预设 DeepSeek，可换 OpenAI / Qwen / OpenRouter / Ollama。
- 保存自定义 Base URL 时请求该域名的可选 host 权限；拒绝则提示可能无法直连。
- API Key 不写日志、不上传；无遥测、无后端、无远程代码。
- 权限最小化：`storage` + `https://www.bilibili.com/*` + `https://*.hdslb.com/*`，以及保存模型地址时可选授予的 LLM 域名。
- 点击 `action`：在 B 站视频页切换面板，其他页面打开设置。

## 9. 其他实现约定

- 主题解析：偏好 `auto | light | dark` 存在 settings 中，解析逻辑在 `src/shared/theme.ts`。面板暗色用 `.bb-root.dark` 类切换，设置页用 `html[data-theme]` 切换，没有显式偏好时回退 `prefers-color-scheme`。
- 图标：`public/icons/icon.svg` 是源文件，`npm run icons` 通过 Edge 渲染 16/32/48/128 PNG；面板和设置页的品牌标记复用同一图形。
- 模型用量：适配器保留 `usage` 字段，但不展示、不落库。

## 10. 后续方向

ASR 兜底、双语字幕、思维导图、用量账本、番剧、自动摘要、全屏面板、自定义提示词、摘要 / 对话分模型、云同步、商店上架。
