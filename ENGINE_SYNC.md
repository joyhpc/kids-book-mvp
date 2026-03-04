# 引擎同步说明

> 换书、改配置时需注意的引擎依赖

## 测试闭环（必跑）

```bash
# 构建 + 产出校验（跨平台，PowerShell 兼容）
npm test

# 轻量 Smoke（需先起服，无 Puppeteer）
# 终端1: python -m http.server 8888
# 终端2: npm run test:smoke

# E2E 翻页/拖拽/有声（需先起服）
# 终端2: npm run test:e2e

# 完整闭环（自动起服 9876 + E2E）
npm run test:full
```

## 一、数据 → 引擎 的映射

| 配置/数据 | 引擎位置 | 说明 |
|-----------|----------|------|
| `book.json` | `App._bootBookMode()` → `BookEngine.loadBook()` | 多场景时优先加载，`scenes[].data_url` 指向各场景 JSON |
| `scene_XX.json` | `SceneLoader.load()` | 单场景或从 BookEngine 传入的 directData |
| `dialogues.intro.text_original` | `SceneLoader._renderSubtitle()` | 有则显示法文原文行，无则显示英文卡拉OK |
| `dialogues.intro.text_zh` | 同上 | 中文译文行 |
| `dialogues.intro.audio` | `AudioSyncEngine.play()` | 有则播音频文件；无则用浏览器 TTS |
| `dialogues.after_feed` | `switchDialogue('after_feed')` | 拖拽成功后由动作链 `play_dialogue` 触发 |

## 二、有声逻辑（本次修改）

- **有声按钮**：只要有 `text_original` 或 `text_en` 或 `text_zh` 就显示
- **有 `dialogue.audio`**：播放 mp3，卡拉OK 同步
- **无 `dialogue.audio`**：用 `speechSynthesis` 朗读，优先 `text_zh` → `text_original` → `text_en`，语言自动设 `zh-CN` / `fr-FR` / `en-US`
- **场景切换**：会 `speechSynthesis.cancel()` 和 `AudioSyncEngine.stop()`

## 三、保留的 DOM 元素（_clearStageContent）

`bg-canvas`, `reading-zone`, `hint-bar`, `ending-overlay`, `progress-bar` —— 翻页时不清空

## 四、build_book.py 产出

- `book.json`：顶层索引
- `data/scenes/scene_01.json` … `scene_NN.json`：按 YAML 的 scenes 数量
- YAML 中 `dialogue_text_fr` → 写入 `text_original`
