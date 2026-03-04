# Kids-Book-MVP 技术架构说明

> 面向 Claude Code / 接棒开发者的架构速览

---

## 一、整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         index.html                                   │
│   Import Map: core/ | modules/ | plugins/ | utils/                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        engine.js (Orchestrator)                       │
│   fetch book.json → app:startBook | app:startSingle → app:ready     │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────┐
│   bus.js     │◄───│   store.js   │    │  modules (side-effect import) │
│  EventBus    │    │   Proxy 状态  │    │  effects | ui | audio |       │
└──────────────┘    └──────────────┘    │  particles | scene-loader |   │
         │                    │         │  book                        │
         │                    │         └──────────────────────────────┘
         │                    │                      │
         │                    ▼                      ▼
         │         ┌──────────────────────────────────────────────┐
         └────────►│  plugins/interaction-manager.js               │
                   │  PluginRegistry: drag_and_drop | click        │
                   └──────────────────────────────────────────────┘
                                        │
                     ┌──────────────────┴──────────────────┐
                     ▼                                     ▼
            drag-drop.js                           click.js
            (拖拽 + 物理回弹)                       (点击 + actions 链)
```

---

## 二、核心模块职责

### 2.1 engine.js

- 入口：`DOMContentLoaded` 时 `initBook()`
- 拉取 `data/book.json`，根据 `scenes` 决定双模式
- 发出 `app:startBook` 或 `app:startSingle`，500ms 后 `app:ready`

### 2.2 core/bus.js

- 轻量 EventTarget 封装
- `emit(name, detail)` / `on(name, callback)`
- 模块间解耦，无直接 import 调用

### 2.3 core/store.js

- Proxy 包装的响应式状态
- 变更时：`progress`、`variables` 写 localStorage
- 变更时：`bus.emit('store:prop', value)`
- 提供 `getVar` / `setVar` 便捷方法

### 2.4 modules/book.js (BookEngine)

| 职责 | 说明 |
|------|------|
| 加载 | `loadBook(url)` / `loadSingleScene(url)` |
| 翻页 | `goToScene(index)`、`nextScene()`、`prevScene()` |
| 路由 | 根据 `navigation_rules` 和 `branches` 决定下一场景 |
| 进度 | localStorage 持久化，`markCurrentComplete()` |
| 变量 | 合并 `config.initial_vars`，可选 `prompt_player_name` |

### 2.5 modules/scene-loader.js (SceneLoader)

- 监听 `store:currentSceneData`
- `render(data)`：背景、角色、物品、字幕、提示
- `switchDialogue(dialogueId)`：切换对白（由插件触发）
- 支持 `text_original`（原文）、`text_en`/`text_zh`、`words`（卡拉OK）

### 2.6 modules/ui.js

- 字幕面板、底部提示、结局浮层、进度条
- 监听 `ui:showHint`、`ui:showEnding`、`store:currentSceneData`

### 2.7 modules/audio.js

- 有 `dialogue.audio` → 播放 MP3 + 卡拉OK 高亮
- 无 audio → `speechSynthesis` TTS，优先 `text_zh` → `text_original` → `text_en`

### 2.8 plugins/interaction-manager.js

- 监听 `store:currentSceneData`
- 根据 `interaction.type` 从 PluginRegistry 取插件类
- 挂载/卸载插件，场景切换时 `_unmountAll()`

### 2.9 交互插件

| 插件 | 类型 | 行为 |
|------|------|------|
| drag-drop.js | drag_and_drop | 拖拽物品到目标，成功/失败回调 |
| click.js | click | 点击 target_id，执行 on_click.actions |

---

## 三、数据流

### 3.1 场景切换流程

```
用户点击「下一页」/ 交互成功
    → bus.emit('scene:next') 或 bus.emit('interaction:success')
    → BookEngine 计算 nextSceneId（含 branches 条件）
    → fetch(scene_data_url)
    → store.currentSceneData = sceneData
    → bus 广播 store:currentSceneData
    → SceneLoader.render()
    → InteractionManager 卸载旧插件、挂载新插件
    → UI 更新字幕、提示
```

### 3.2 交互成功动作链

`interaction.on_success.actions` 或 `on_click.actions`：

```json
[
  { "type": "set_var", "var_key": "found_pearl", "var_value": true },
  { "type": "play_dialogue", "dialogue_id": "found_pearl" },
  { "type": "hide_item", "target": "magic_pearl", "animation": "pop-vanish" }
]
```

- `set_var` → `store.variables`
- `play_dialogue` → `bus.emit('scene:switchDialogue', id)`
- `hide_item` → 插件内部操作 DOM
- `change_state` → 修改角色 CSS filter / animation

---

## 四、构建管线 (tools/)

### 4.1 build_book.py

```
YAML config
    → 遍历 scenes
    → [可选] Gemini Imagen 3 生图 → assets/scenes/scene_XX_bg.jpg
    → [可选] OOD 管线（ood_character_anchor）→ Mock 生图
    → [可选] ElevenLabs TTS → assets/audio/scene_XX.mp3 + words
    → _build_scene_data() 组装 scene JSON
    → schema.SceneConfig 校验
    → 写入 data/scenes/scene_XX.json
    → 汇总 book.json，schema.BookConfig 校验
```

### 4.2 ood_pipeline.py

- **OODDataForge**：从锚图提取深度、SAM2 分割 → 2.5D 点云 → 多视角造数据 → LoRA 训练（Mock）
- **RuntimeMaskedPipeline**：分镜渲染（Mock，无真实 diffusers）
- 当 `HAS_ML_DEPS=False`（缺 torch/numpy）时全走 Mock 路径

### 4.3 schema.py

- Pydantic 模型：`SceneConfig`、`BookConfig`、`Interaction`、`Dialogue` 等
- 构建时强制 `model_validate()`，不合格则抛错

---

## 五、DOM 结构（index.html）

```
#stage
├── #bg-canvas          # Canvas 粒子（保留）
├── #reading-zone       # 字幕区（保留）
│   ├── #audio-btn
│   └── #subtitle-panel
├── #hint-bar           # 底部提示（保留）
├── #ending-overlay     # 结局浮层（保留）
├── #progress-bar       # 进度条（如有）
└── [动态] .scene-character, .scene-item  # 翻页时清理
```

`_clearStageContent` 会保留上述固定元素，仅清除角色和物品。

---

## 六、扩展点

### 6.1 新增交互类型

1. 在 `plugins/` 新增 `xxx.js`，继承 `base-interaction.js` 的接口
2. 在 `interaction-manager.js` 的 `PluginRegistry` 注册
3. YAML 中 `interaction.type: "xxx"`

### 6.2 新增动作类型

在 `click.js` 或 `drag-drop.js` 的 action 处理器中增加分支，例如：

```js
if (action.type === 'custom_action') { ... }
```

### 6.3 新增变量函数

在 `utils/interpolate.js` 中扩展 `{{var}}` 解析逻辑。

---

## 七、文件依赖关系

```
engine.js
  → core/bus, core/store
  → modules/effects, ui, audio, particles, scene-loader, book
  → plugins/interaction-manager
      → drag-drop, click
          → core/base-interaction
scene-loader
  → utils/interpolate
book
  → store, bus
```

所有模块通过 `bus` 间接协作，避免循环依赖。

---

## 八、深层实现细节

### 8.1 交互插件设计（OCP）

- **BaseInteraction**：`mount()` / `unmount()` 生命周期；`_triggerSuccess()` 发 `interaction:success` 并执行 `_runActions()`
- **动作解析**：`hide_item`、`change_state`、`play_dialogue`、`show_particles`、`set_var` 在基类统一处理
- **ClickInteraction**：绑定 `target_id` 的 click，直接调用 `_runActions(on_click.actions)`，不经过 `_triggerSuccess`（故不自动发 `interaction:success`，需在 actions 中或业务逻辑显式处理）
- **DragDropInteraction**：拖拽命中后 `_triggerSuccess`，同时发 `interaction:success` 与执行 on_success.actions

**注意**：click 的 actions 若需解锁下一页，需额外发 `interaction:success`，或由业务在 click 后手动 `markCurrentComplete`。

### 8.2 拖拽物理与 DOM 操作

- 拖拽时移除 `anim-*` 类（否则 CSS 动画覆盖 transform），失败回弹时恢复
- 碰撞检测：`checkCollision(elA, elB, hit_tolerance)`，AABB 重叠
- 成功后将 `el.dataset.draggable = 'false'` 禁止再次拖拽

### 8.3 视差与粒子

- **effects.js**：`#ambient-light` 跟随鼠标，`--mx`/`--my` CSS 变量；`.scene-character`、`.scene-item` 的**子元素**（sprite/img）做 translate3d + rotate，不直接改外层，避免与拖拽 transform 冲突
- **particles.js**：监听 `store:currentSceneData`，若 `background.particles !== true` 则 `destroy()` 不初始化；`particles:burst` 支持 `{ action, targetEl }` 或 `{ x, y }` 两种 payload

### 8.4 字幕与音频

- **有 text_original**：不渲染 word-span 卡拉OK，仅显示原文 + 中文
- **无 text_original 有 words**：渲染 word-span，audio 用 `_tick` requestAnimationFrame 驱动高亮
- **无 audio**：`playBrowserTTS`，语言按 text_zh → text_original → text_en 推断
- **audio:ended**：每次 setupSubtitle 都会 `bus.on('audio:ended')`，存在重复注册风险

### 8.5 条件分支语法

`_evaluateCondition(conditionStr, variables)` 支持：
- `"default"` → 恒真
- `"key == value"`：value 可为 `true`、`false`、带引号字符串
- `"key != value"`：同上
- 其他格式返回 `false` 并 console.warn

### 8.6 构建与 Schema

- `build_book` 产出：`book.json` + `data/scenes/scene_NN.json`
- 场景 JSON 经 `schema.SceneConfig.model_validate()` 校验，不合格抛错
- `Interaction` 模型当前面向 `drag_and_drop`，`click` 结构的 `on_click` 不在 schema 内，含 click 的配置构建时可能失败
