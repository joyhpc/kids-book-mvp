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
# Serve locally
python -m http.server 8888

# Open in browser
http://localhost:8888/index.html
```

## Generate a Book from YAML

```bash
# Install Python deps
pip install pyyaml

# Build the "Little Prince" chapter
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
│   └── ...                 # whale, robot, butterfly, etc.
├── data/
│   ├── book.json           # Multi-scene book manifest
│   ├── scene.json          # Single-scene fallback
│   └── scenes/             # Individual scene data
├── tools/
│   ├── build_book.py       # AIGC pipeline (YAML → JSON)
│   ├── chapter1_config.yaml    # Chapter 1: Prince & Fox (6 scenes)
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

## Chapter 1 Demo: The Little Prince and the Fox

6-scene complete storybook with narrative arc:

| # | Scene | Type | Key Feature |
|---|-------|------|-------------|
| 1 | The Visitor | narrative | Prince alone in starry sky |
| 2 | Fox Appears | narrative | Two characters face each other |
| 3 | Tame Me | narrative | Turning point — the fox's plea |
| 4 | Establishing Ties | **interactive** | Drag apple → fox transforms + dialogue switch |
| 5 | The Secret | narrative | Core quote: "invisible to the eye" |
| 6 | Farewell | narrative | Emotional closure |

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
