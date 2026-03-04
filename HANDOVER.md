# Kids-Book-MVP 项目交接文档

> **交接对象**: Claude Code / 接棒开发者  
> **更新日期**: 2025-03-04  
> **项目类型**: 面向 4-8 岁儿童的 JSON 驱动互动双语绘本引擎（MVP）

---

## 一、项目概览

### 1.1 产品定位

- **一句话**：用最硬核的 AI 算力，做最克制、最传统的数字绘本艺术品。
- **目标用户**：4-8 岁儿童 + 25-40 岁中产家长（睡前高质量陪伴场景）
- **核心特质**：90% 静态 + 10% 微动、交互即叙事、听觉通感

详见 [PRODUCT_VISION.md](./PRODUCT_VISION.md)。

### 1.2 技术栈

| 层面 | 技术 | 说明 |
|------|------|------|
| 前端 | Vanilla JS (ES6) + ESM | 无框架、无打包，直接打开 HTML 即可 |
| 样式 | CSS3 + HTML5 Canvas | 粒子效果、2.5D 视差、微动画 |
| 构建 | Python 3 + PyYAML + Pydantic | YAML 配置 → JSON 数据 |
| AIGC（可选） | Gemini Imagen 3 / ElevenLabs TTS | 生图、TTS 卡拉OK 时间戳 |
| OOD 管线（实验） | 2.5D Data Forge + Masked Runtime | 基于抽象角色锚图的离线资产管线（Mock 状态） |

### 1.3 当前运行形态

- **入口**：`index.html` → 加载 `data/book.json` → 多场景绘本模式
- **备选入口**：`reader.html`（独立阅读原型，小王子摘录）
- **当前演示**：The Little Mermaid（美人鱼）3 场景，OOD 管线演示

---

## 二、目录结构速览

```
kids-book-mvp/
├── index.html              # 主入口（引擎驱动）
├── reader.html             # 独立阅读原型（内嵌数据）
├── HANDOVER.md             # 本文档
├── PRODUCT_VISION.md       # 产品愿景
├── ENGINE_SYNC.md          # 引擎与数据映射说明
├── package.json            # Node 脚本（构建/测试）
│
├── js/
│   ├── engine.js           #  orchestrator：启动 → book / single
│   ├── core/
│   │   ├── bus.js          # 事件总线
│   │   ├── store.js        # 状态 + 变量系统（Tale-js 风格）
│   │   └── base-interaction.js  # 交互基类
│   ├── modules/
│   │   ├── book.js         # BookEngine：翻页、进度、路由
│   │   ├── scene-loader.js # 场景 DOM 渲染
│   │   ├── ui.js           # 字幕、提示、结局浮层
│   │   ├── audio.js        # TTS / 卡拉OK 同步
│   │   ├── particles.js    # Canvas 粒子
│   │   └── effects.js      # 2.5D 视差
│   ├── plugins/
│   │   ├── interaction-manager.js  # 交互插件注册
│   │   ├── drag-drop.js    # 拖拽交互
│   │   └── click.js        # 点击交互
│   └── utils/
│       ├── interpolate.js  # {{var}} 变量插值
│       └── helpers.js
│
├── data/
│   ├── book.json           # 顶层索引（场景列表、导航规则）
│   ├── scene.json          # 单场景 fallback
│   ├── scene.js            # file:// 兼容：window.__SCENE_DATA__
│   └── scenes/
│       └── scene_01.json … scene_NN.json  # 各场景 JSON
│
├── assets/
│   ├── scenes/             # 背景图 scene_XX_bg.jpg
│   ├── *.svg               # 角色/物品 SVG
│   └── mermaid_transparent.png  # OOD 锚图
│
├── tools/
│   ├── build_book.py       # AIGC 流水线：YAML → book.json + scenes
│   ├── ood_pipeline.py     # OOD 2.5D 管线（Mock）
│   ├── schema.py           # Pydantic 数据校验
│   ├── little_mermaid_ood.yaml  # 美人鱼 3 场景配置
│   ├── little_prince_full.yaml  # 小王子 14 场景
│   └── *.yaml              # 其他书籍配置
│
└── docs/
    ├── DSL_VARS.md         # 变量系统与条件分支
    ├── ARCHITECTURE.md     # 技术架构详解
    ├── HANDOVER_CHECKLIST.md
    └── CLAUDE_CODE_QUICKSTART.md
```

---

## 三、核心流程与依赖

### 3.1 启动流程

```
index.html 加载
    → <script src="data/scene.js"> 预置 window.__SCENE_DATA__（单场景兜底）
    → engine.js initBook()
    → fetch data/book.json
    → 有 scenes ? bus.emit('app:startBook') : bus.emit('app:startSingle')
    → BookEngine.loadBook() / loadSingleScene()
    → BookEngine 构造时 store.progress = _loadProgress()（覆盖 store 初始值）
    → bus.emit('book:loaded')
    → goToScene(0) → loadScene() → fetch scene data_url
    → 若无转场：store.currentIndex + currentSceneData 直接赋值
    → 若有转场：bus.emit('ui:pageTransition')，renderNext 中再赋值
    → store 变更触发 bus.emit('store:currentSceneData')
    → SceneLoader.render()、InteractionManager 挂载插件、particles 初始化、ui 更新
```

**模块加载顺序**（engine.js import）：effects → ui → audio → particles → interaction-manager → scene-loader → book。各模块在 import 时注册 bus 监听，无显式初始化顺序依赖。

### 3.2 事件总线 (bus.js)

模块间通过 `bus` 解耦，常用事件：

| 事件 | 方向 | 说明 |
|------|------|------|
| `app:startBook` | engine → book | 多场景模式 |
| `app:startSingle` | engine → book | 单场景模式 |
| `app:ready` | engine | 加载完成 |
| `book:loaded` | book | 书籍已加载 |
| `store:currentSceneData` | store | 场景数据变更（触发渲染） |
| `scene:next` / `scene:prev` | UI → book | 翻页 |
| `scene:switchDialogue` | plugin → scene-loader | 切换对白 |
| `interaction:success` | plugin → book | 交互成功（解锁下一页） |
| `ui:showHint` / `ui:showEnding` | book → ui | 提示/结局 |
| `ui:pageTransition` | book → ui | 翻页转场（fade + clearStageContent + renderNext） |
| `audio:setupSubtitle` / `audio:stop` / `audio:ended` | scene-loader / audio | 字幕与播放 |
| `particles:burst` | plugin / ui | 粒子爆发 |

### 3.3 状态存储 (store.js)

- `store.mode`: 'book' | 'single'
- `store.bookData`: book.json 内容
- `store.currentSceneData`: 当前场景 JSON
- `store.progress`: localStorage，阅读进度
- `store.variables`: 全局变量（`{{playerName}}` 等，localStorage 持久化，键 `kids_book_variables`）
- `store.isTransitioning`: 翻页中禁止重复触发

**持久化键**：progress 实际存在 `storybook_progress`（BookEngine）与 `kids_book_progress`（store Proxy）两处，存在不一致，见 [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md)。

### 3.4 翻页时保留的 DOM 元素

`ui.clearStageContent()` 会**保留**以下 id，仅清除角色与物品：
`bg-canvas`、`reading-zone`、`hint-bar`、`ending-overlay`、`progress-bar`、`ambient-light`

---

## 四、构建与测试

### 4.1 快速验证

```bash
# 1. 构建（⚠️ 注意：npm test 使用 chapter1_config，会覆盖为小王子 6 场景）
npm test

# 2. 启动本地服务（必须，ESM 需 HTTP）
python -m http.server 8888

# 3. 打开
http://localhost:8888/index.html
```

**重要**：若要保持当前美人鱼 3 场景，勿用 `npm test`，改用：
`python tools/build_book.py book --config tools/little_mermaid_ood.yaml`

### 4.2 测试命令

| 命令 | 说明 |
|------|------|
| `npm test` | 构建 + 产出校验 |
| `npm run test:smoke` | HTTP 轻量校验（需先起服） |
| `npm run test:e2e` | E2E 翻页/拖拽/有声（需先起服） |
| `npm run test:full` | 全闭环：构建 → 起服 → E2E |

### 4.3 构建新书

```bash
pip install -r requirements.txt   # 或 pip install pyyaml pydantic
python tools/build_book.py book --config tools/little_mermaid_ood.yaml
```

可选 API（不设置则跳过生图/TTS）：

- `GEMINI_API_KEY`
- `ELEVENLABS_API_KEY`

---

## 五、数据契约

### 5.1 book.json

```json
{
  "meta": { "book_id", "title", "version", "language", "target_age" },
  "config": { "navigation", "ui" },
  "scenes": [ { "id", "title_zh", "title_en", "data_url" } ],
  "navigation_rules": { "scene_01": { "next", "branches", "unlock_condition" } }
}
```

### 5.2 scene_XX.json

由 `schema.py` 的 Pydantic 模型校验。核心字段：

- `scene`: background（type: image | canvas | css_gradient）, characters, items
- `dialogues`: intro, after_feed 等，含 text_en/zh、text_original、words（卡拉OK）、audio
- `interaction`: type 为 `drag_and_drop` 时需 draggable_id、target_id、on_success；`click` 使用 target_id、on_click（当前 schema 未完全支持）
- `ending`: 章节结束浮层，支持 auto_advance、delay_after_success_ms
- `ui.hint`: 仅 text_zh 在底部提示中展示（text_en 未用）

详细见 [tools/schema.py](./tools/schema.py)。背景 `type: canvas` 时需提供 `gradient`，否则无背景。

### 5.3 变量与分支

- 变量插值：`{{playerName}}`、`{{key|默认}}`
- 动作：`set_var`、`play_dialogue`、`hide_item`、`change_state` 等
- 分支：`navigation_rules.scene_XX.branches`，`condition: "found_pearl == true"`

详见 [docs/DSL_VARS.md](./docs/DSL_VARS.md)。

---

## 六、注意事项与已知问题

> 完整清单见 [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md)

### 6.1 必须使用本地 HTTP 服务

- `index.html` 使用 ESM (`type="module"`)，`file://` 会 CORS 失败。
- 需用 `python -m http.server 8888` 或类似工具启动。

### 6.2 file:// 兼容层

- `data/scene.js` 预置 `window.__SCENE_DATA__`，用于无服务器时兜底。
- `build_book.py` 单场景模式也会写出 `scene.js`。

### 6.3 OOD 管线状态

- `ood_pipeline.py` 为 **Mock** 实现：无真实 GPU、无 diffusers。
- 配置 `ood_character_anchor` 时，生图会走 Mock 路径，输出简单占位图。
- 完整实现需接入 DepthAnything-V2、SAM2、LoRA 训练等。

### 6.4 版本兼容

- `book.json` / `scene_XX.json` 的 `meta.version` 需为 `1.0.0` 或 `4.0.0`，否则引擎会拒绝加载。

### 6.5 关键坑点速览

| 问题 | 影响 |
|------|------|
| 进度 localStorage 双 key | 数据可能不同步 |
| `npm test` 固定用 chapter1 | 会覆盖当前书籍为小王子 |
| schema 与 click 不匹配 | 含 click 的场景构建可能失败 |
| set_var 异步 | 立即翻页时分支条件可能未生效 |

---

## 七、交接检查清单

请配合 [docs/HANDOVER_CHECKLIST.md](./docs/HANDOVER_CHECKLIST.md) 逐项核对。

---

## 八、推荐阅读顺序

1. [PRODUCT_VISION.md](./PRODUCT_VISION.md) — 产品理念
2. [docs/DSL_VARS.md](./docs/DSL_VARS.md) — 变量与交互 DSL
3. [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md) — **已知问题与坑点**
4. [ENGINE_SYNC.md](./ENGINE_SYNC.md) — 数据与引擎映射
5. [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 技术架构
6. [docs/CLAUDE_CODE_QUICKSTART.md](./docs/CLAUDE_CODE_QUICKSTART.md) — Claude Code 快速上手

---

**交接完成标志**：能够独立运行 `npm test` → 起服 → 打开 `index.html` 完成一次完整阅读流程。
