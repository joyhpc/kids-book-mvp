# Claude Code 快速上手指南

> 面向 Claude Code 的项目快速接入说明，便于 AI 助手快速理解项目并执行修改任务

---

## 一、5 分钟速览

### 项目是什么？

- **JSON 驱动的互动双语绘本引擎**，面向 4-8 岁儿童
- ⚠️ `npm test` 会构建**小王子 chapter1** 并覆盖 `data/`，若需美人鱼需单独构建
- 无需改代码即可换书：改 YAML → 运行 `build_book.py` → 产出新 JSON
- 前端纯 Vanilla JS + ESM，无框架、无打包

### 核心入口

```
index.html → engine.js → book.json → scene_XX.json
```

### 修改「书内容」去哪改？

- **场景数据**：`data/scenes/scene_XX.json`
- **书籍配置**：`data/book.json`
- **源头配置**：`tools/*.yaml`（如 `little_mermaid_ood.yaml`），改完后运行：

  ```bash
  python tools/build_book.py book --config tools/little_mermaid_ood.yaml
  ```

### 修改「引擎行为」去哪改？

| 需求 | 文件 |
|------|------|
| 翻页逻辑、进度、路由 | `js/modules/book.js` |
| 场景 DOM 渲染 | `js/modules/scene-loader.js` |
| 字幕、提示、结局浮层 | `js/modules/ui.js` |
| 音频、TTS | `js/modules/audio.js` |
| 拖拽 / 点击交互 | `js/plugins/drag-drop.js`、`click.js` |
| 新增交互类型 | `js/plugins/interaction-manager.js` + 新插件 |
| 全局变量、状态 | `js/core/store.js` |
| 事件通信 | `js/core/bus.js` |

---

## 二、常用任务模板

### 1. 新增一个场景

1. 编辑 `tools/little_mermaid_ood.yaml`（或对应书籍 YAML）
2. 在 `scenes` 下增加一项，仿照现有格式写 `id`、`title_en`、`title_zh`、`scene_description`、`dialogue_text` 等
3. 运行：`python tools/build_book.py book --config tools/xxx.yaml`
4. 确认 `data/scenes/` 下多了 `scene_NN.json`，`data/book.json` 的 `scenes` 和 `navigation_rules` 已更新

### 2. 给某场景加点击交互

在 scene JSON 或 YAML 的 `interaction` 中配置：

```json
"interaction": {
  "type": "click",
  "target_id": "magic_pearl",
  "on_click": {
    "actions": [
      { "type": "set_var", "var_key": "found_pearl", "var_value": true },
      { "type": "play_dialogue", "dialogue_id": "found_pearl" }
    ]
  }
}
```

并在 `scene.items` 或 `scene.characters` 中有对应 `id` 的元素。

### 3. 修改变量插值逻辑

编辑 `js/utils/interpolate.js`，或在 `scene-loader.js` 中调用 `interpolate()` 的地方扩展逻辑。

### 4. 修改构建管线（生图/TTS）

编辑 `tools/build_book.py`：

- `generate_image()` — 生图
- `generate_speech_with_timestamps()` — TTS
- `_build_scene_data()` — 场景 JSON 组装

---

## 三、调试技巧

### 看事件流

```js
// 在 engine.js 或任意模块顶部临时加：
import { bus } from 'core/bus.js';
bus.on('*', (e) => console.log('bus:', e.type, e.detail));
// 注：原生 EventTarget 无 * 通配，可手动订阅各事件
```

### 看当前状态

```js
import { store } from 'core/store.js';
console.log(store.currentSceneData, store.variables);
```

### 强制刷新数据

- 清 `localStorage`：`localStorage.removeItem('kids_book_progress'); localStorage.removeItem('kids_book_variables'); localStorage.removeItem('storybook_progress');`
- 或加 `?v=timestamp` 到 `book.json` 请求（engine 已做）

---

## 四、文件命名与路径约定

- 场景 JSON：`data/scenes/scene_01.json` … `scene_NN.json`
- 背景图：`assets/scenes/scene_XX_bg.jpg`
- 音频：`assets/audio/scene_XX.mp3`
- 角色/物品：`assets/*.svg` 或 `assets/*.png`

---

## 五、必读：已知问题

修改前建议浏览 [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)，重点包括：进度双 key、npm test 覆盖、schema 与 click 不匹配、set_var 异步竞态。

---

## 六、Claude Code 提示词建议

接到任务时可先快速确认：

1. **改书内容** → 优先看 `data/`、`tools/*.yaml`
2. **改引擎逻辑** → 优先看 `js/modules/`、`js/plugins/`
3. **改构建流程** → 优先看 `tools/build_book.py`、`tools/schema.py`
4. **改样式** → `css/style.css`、`index.html` 内联样式

推荐在任务开始时让 Claude 阅读（按优先级）：

- `HANDOVER.md` 了解整体
- `docs/ARCHITECTURE.md` 了解模块职责
- 具体要改的文件

---

## 六、一键验证命令

```bash
npm test && echo "---" && python -m http.server 8888
```

然后浏览器打开 `http://localhost:8888/index.html`，确认能正常阅读。
