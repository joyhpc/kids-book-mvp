# Kids Interactive Storybook Engine

> JSON-driven interactive bilingual storybook engine for children aged 4–8.

## What It Does

A single `engine.js` renders any storybook from JSON config — no code changes needed.

- **Multi-scene books** — YAML config → `build_book.py` → `book.json` + `scene_XX.json` files
- **Drag-and-drop interactions** — items snap to targets with physics spring-back
- **Character state machine** — `hungry → happy`, `closed → bloomed`, etc. with CSS filter transitions
- **Karaoke subtitles** — word-by-word gold highlight synced to timing data (or real audio)
- **Bilingual** — English + Chinese with separate styling
- **Particle system** — Canvas-based firefly / sparkle effects
- **Progress persistence** — `localStorage` saves reading progress

## Quick Start

```bash
# 1. 构建第一章（默认）
npm test

# 2. 启动服务
python -m http.server 8888

# 3. 打开
http://localhost:8888/index.html
```

## 测试

| 命令 | 说明 |
|------|------|
| `npm test` | 构建 + 产出校验（跨平台，无 `&&`） |
| `npm run test:smoke` | 轻量 HTTP 校验（无 Puppeteer，需先起服） |
| `npm run test:e2e` | E2E 翻页/拖拽/有声 + 读者视角（画面可见、文字可读），需先起服 |
| `npm run test:full` | 全闭环：构建 → 校验 → 起服(9876) → E2E |

## Generate a Book from YAML

```bash
# Install Python deps
pip install pyyaml

# Build the complete Little Prince (14 scenes)
python tools/build_book.py book --config tools/little_prince_full.yaml

# Or build Chapter 1 only (6 scenes: Draw Me a Sheep — 原著开篇)
python tools/build_book.py book --config tools/chapter1_config.yaml

# With AIGC APIs (optional)
export GEMINI_API_KEY=your_key
export ELEVENLABS_API_KEY=your_key
python tools/build_book.py book --config tools/chapter1_config.yaml
```

## Project Structure

```
├── index.html              # Entry point
├── js/engine.js            # Core engine (all modules)
├── css/style.css           # Styles + animations
├── assets/                 # SVG characters & items
│   ├── prince.svg          # Little Prince (cubist style)
│   ├── fox.svg             # Fox (cubist style)
│   ├── apple.svg           # Draggable apple
│   ├── rose.svg            # Rose
│   ├── snake.svg           # Desert snake
│   ├── crown.svg           # The King
│   ├── streetlamp.svg      # Lamplighter
│   └── ...                 # whale, robot, butterfly, etc.
├── data/
│   ├── book.json           # Multi-scene book manifest
│   ├── scene.json          # Single-scene fallback
│   └── scenes/             # Individual scene data
├── tools/
│   ├── build_book.py           # AIGC pipeline (YAML → JSON)
│   ├── little_prince_full.yaml # Complete Little Prince (14 scenes)
│   ├── chapter1_config.yaml    # Chapter 1: Draw Me a Sheep (6 scenes)
│   ├── book_config.yaml        # Prince & Fox (3 scenes, compact)
│   └── test_book_config.yaml   # Engine stress test (4 themes)
└── reader.html             # Standalone reading prototype
```

## Engine Architecture

```
┌─────────────────────────────────────────────┐
│                  App.boot()                  │
│         (dual-mode: book / single)           │
├──────────┬──────────┬───────────┬────────────┤
│ BookEngine│PageTransition│ProgressBar│         │
│ (scenes) │ (fade/slide) │  (dots)   │         │
├──────────┴──────────┴───────────┘            │
│                                              │
│  SceneLoader ─── JSON → DOM rendering        │
│  DragDropEngine ─ pointer events + physics   │
│  AudioSyncEngine ─ karaoke word highlighting │
│  ParticleSystem ── Canvas fireflies/sparkles │
└──────────────────────────────────────────────┘
         ▲                        ▲
    book.json                YAML config
    scene_XX.json         → build_book.py
```

## Complete Little Prince (14 Scenes)

Full story from desert meeting to farewell:

| # | Scene | Type | Key Moment |
|---|-------|------|-------------|
| 1 | In the Desert | narrative | Pilot meets the prince |
| 2 | The Prince's Planet | narrative | Prince + rose, small world |
| 3 | The Proud Rose | narrative | "One could not die for you" |
| 4 | The King | narrative | First planet visit |
| 5 | The Lamplighter | narrative | "The only one I could have made my friend" |
| 6 | On Earth | narrative | Prince in the desert |
| 7 | The Snake | narrative | "I can help you go home" |
| 8 | Meeting the Fox | narrative | "Who are you?" "I am a fox" |
| 9 | Tame Me | narrative | The fox's plea |
| 10 | Establishing Ties | **interactive** | Drag apple → fox transforms |
| 11 | The Fox's Secret | narrative | "What is essential is invisible to the eye" |
| 12 | Goodbye, Fox | narrative | "You become responsible, forever" |
| 13 | The Well | narrative | "Stars are beautiful because of a flower" |
| 14 | Going Home | narrative | "I shall be living on one of them, smiling" |

## YAML Config Format

```yaml
scenes:
  - id: scene_id
    title_zh: 场景标题
    title_en: Scene Title
    background_override:
      type: canvas
      gradient: "radial-gradient(...)"
      particles: true
    dialogue_text: 'English dialogue here.'
    dialogue_text_zh: "中文对白。"
    after_success_text: 'Dialogue after interaction succeeds.'
    characters:
      - id: fox
        img_src: assets/fox.svg
        position: { x: "50%", y: "60%" }
        width: "120px"
        height: "120px"
        states:
          hungry: { filter: "grayscale(0.6)", animation: fox-idle }
          happy: { filter: "saturate(1.4)", animation: fox-jump }
        initial_state: hungry
    items:
      - id: apple
        img_src: assets/apple.svg
        position: { x: "20%", y: "65%" }
        draggable: true
    interaction:
      type: drag_and_drop
      draggable_id: apple
      target_id: fox
      on_success:
        actions:
          - { type: hide_item, target: apple }
          - { type: change_state, target: fox, to_state: happy }
          - { type: play_dialogue, dialogue_id: after_feed }
          - { type: show_particles, emoji: "✨", count: 12 }
```

## Tech Stack

- **Frontend**: Vanilla JS (ES6), HTML5 Canvas, CSS3 animations
- **Build pipeline**: Python 3 + PyYAML
- **AIGC** (optional): Google Gemini Imagen 3, ElevenLabs TTS
- **No frameworks, no build step** — open `index.html` and it works

## License

MIT
