# 已知问题与坑点（Known Issues）

> 交接时务必知晓的潜在问题、设计遗留与边界行为

---

## 一、关键问题（影响功能）

### 1.1 进度存储 Key 不一致

**现象**：`BookEngine` 与 `store` 使用不同的 localStorage 键。

| 位置 | 键名 | 用途 |
|------|------|------|
| `book.js` `_loadProgress()` / `_saveProgress()` | `storybook_progress` | BookEngine 读取与显式写入 |
| `store.js` Proxy setter | `kids_book_progress` | 当 `store.progress = x` 时自动写入 |

**影响**：
- 初始：store 从 `kids_book_progress` 读取，随即被 BookEngine 用 `storybook_progress` 的数据覆盖
- 更新时：BookEngine 的 `_saveProgress()` 写 `storybook_progress`；`store.progress = {...}` 触发 Proxy 写 `kids_book_progress`
- 若两键数据不同步，加载时以 `storybook_progress` 为准（BookEngine 在构造时覆盖）

**建议**：统一为单一 key（如 `kids_book_progress`），并让 BookEngine 复用 store 的持久化逻辑。

---

### 1.2 `npm test` 会覆盖当前书籍

**现象**：`run_build_and_test.js` 固定使用 `tools/chapter1_config.yaml` 构建。

```js
// run_build_and_test.js
await run('python', ['tools/build_book.py', 'book', '--config', 'tools/chapter1_config.yaml']);
```

**影响**：
- 当前 `data/book.json` 为 Little Mermaid（3 场景）
- 运行 `npm test` 后会被 Little Prince 第一章（6 场景）覆盖
- `data/scenes/` 下文件会变为 `scene_01`…`scene_06`，与美人鱼场景不同

**建议**：需保留美人鱼时，单独执行 `python tools/build_book.py book --config tools/little_mermaid_ood.yaml`，勿依赖 `npm test` 作为「默认构建」。

---

### 1.3 Pydantic Schema 与 Click 交互不匹配

**现象**：`schema.py` 中 `Interaction` 模型要求 `draggable_id`、`target_id`，为 `drag_and_drop` 设计。

```python
class Interaction(BaseModel):
    type: str = "drag_and_drop"
    draggable_id: str   # 必填
    target_id: str
    ...
```

**Click 交互** 使用 `target_id` + `on_click.actions`，无 `draggable_id`。

**影响**：
- 若在 YAML 中配置 `type: click`，`build_book` 的 `schema.SceneConfig.model_validate()` 会因缺少 `draggable_id` 而报错
- 当前 little_mermaid 无 interaction，可正常构建；DSL_VARS 中的 click 示例需 schema 扩展或跳过校验

**建议**：使用 `Union[DragDropInteraction, ClickInteraction]` 或 `model_validator(mode='before')` 按 type 分支校验。

---

### 1.4 `set_var` 为异步，分支评估存在竞态

**现象**：`base-interaction.js` 中 `set_var` 使用动态 import：

```js
case 'set_var':
  import('./store.js').then(({ store }) => {
    store.variables = { ...store.variables, [action.var_key]: action.var_value };
  });
  break;
```

**影响**：
- 用户点击某物触发 `set_var`，随后立刻点击「下一页」
- `nextScene()` 中的 `_evaluateCondition(branch.condition)` 可能在 `store.variables` 更新前执行
- 分支可能误判为未满足

**建议**：改为同步 `import { store } from 'core/store.js'`，或保证 `set_var` 完成后再允许翻页。

---

## 二、行为差异与设计遗留

### 2.1 底部 Hint 仅使用 `text_zh`

**位置**：`ui.js` 的 `ui:showHint` 处理

```js
this.hintBar.textContent = interpolate(hint.text_zh || '', store.variables || {});
```

**影响**：`hint.text_en` 未被使用，多语言 hint 需在别处实现。

---

### 2.2 背景类型 `canvas` 无 gradient 时无背景

**位置**：`scene-loader.js` 渲染逻辑

```js
} else if (scene.background.type === 'canvas') {
  if (scene.background.gradient) {
    this.stageEl.style.background = scene.background.gradient;
  }
}
```

**影响**：`type: canvas` 且无 `gradient` 时，背景不会被设置，沿用上一场景或默认。

---

### 2.3 `scene.js` 与 `file://` 的局限性

**设计**：`data/scene.js` 设置 `window.__SCENE_DATA__`，供 `loadSingleScene` 失败时兜底。

**实际**：ESM 必须在 HTTP 下运行，`file://` 会因 CORS 在更早阶段失败，无法进入 `loadSingleScene`。`scene.js` 主要服务于单场景模式且 `scene.json` fetch 失败时的降级。

---

### 2.4 Audio 模块多次监听 `audio:ended`

**位置**：`audio.js` 的 `setupSubtitle()`

```js
bus.on('audio:ended', () => { ... });
```

**影响**：每次切换场景、更新字幕都会执行 `setupSubtitle`，会重复注册 `audio:ended`，可能造成多次回调。建议使用 `once` 或在挂载前 `off` 旧监听。

---

## 三、E2E 与调试相关

### 3.1 E2E 全局变量

为便于 Puppeteer 断言，引擎在交互时设置：

| 变量 | 含义 |
|------|------|
| `window.__E2E_DRAG_STARTED` | 拖拽开始 |
| `window.__E2E_DRAGGING_DELTA` | 拖拽偏移 |
| `window.__E2E_ACTUAL_HIT` | 是否命中目标 |
| `window.__E2E_INTERACTION_SUCCESS` | 交互成功 |

这些为测试专用，生产环境可忽略。

---

### 3.2 E2E 对 chapter1 的假设

`test_engine.js` 针对 chapter1（小王子第一章）编写，假定存在拖拽场景（如喂狐狸）。若使用美人鱼配置构建，部分 E2E 步骤可能因缺少对应场景而失败。

---

## 四、构建管线

### 4.1 YAML 书籍标题字段

`build_book.py` 使用 `config.get("title", book_id)` 作为书籍标题。

- `little_mermaid_ood.yaml` 无 `title`，会用 `book_id` 作为 meta.title
- `chapter1_config.yaml` 使用 `book_title_zh`、`book_title_en`，未被 `title` 读取，因此 meta.title 仍为 `book_id`（chapter1_the_boa）

**建议**：统一支持 `title` 或 `book_title_zh`/`book_title_en` 的映射。

---

### 4.2 背景图命名约定

`build_book` 将背景输出为 `{scene_id}_bg.jpg`（如 `scene_01_bg.jpg`）。若 `scene_id` 含下划线（如 `ch1_s1_book`），则为 `ch1_s1_book_bg.jpg`，与 `assets/scenes/` 的命名需一致。

---

## 五、模块与时机

### 5.1 effects 的 ambient-light 创建时机

`effects.js` 在 `DOMContentLoaded` 中向 `#stage` 追加 `#ambient-light`。`ui.clearStageContent()` 会保留 `ambient-light`，故不会在翻页时被清除。

### 5.2 粒子系统与背景配置

`particles.js` 仅在 `data.scene.background.particles === true` 时初始化。若场景背景无 `particles` 或为 `false`，Canvas 粒子不会显示。
