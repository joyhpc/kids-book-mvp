# Gemini Canvas Integration Protocol

## Goal

Use `Gemini Canvas` as an external **static picture-book design workstation** while keeping this repo as the single source of truth for:

- page specs
- story text
- layout constraints
- version history
- export targets

This is a **static-first** workflow. Animation is optional and should be added later only when it serves the story.

## Product Principle

- `Gemini Canvas` is used to explore and polish static pages.
- This repo owns the structured page definition.
- A page is considered good when it is readable, restrained, and compositionally calm.
- Motion, particles, autoplay, and extra effects are off by default in editorial review.

## Recommended MVP Loop

1. Write a `page spec` in JSON.
2. Generate a `Canvas prompt pack` from the spec.
3. Create or revise the page in `Gemini Canvas`.
4. Export or paste back:
   - image asset
   - share link
   - notes
   - selected version
5. Record review scores and lock the chosen page.
6. Only after enough pages exist, build an internal renderer/editor to reproduce the same rules.

## System Boundary

### This repo should own

- `book` metadata
- `page` metadata
- bilingual copy
- character roster
- layout intent
- safe zones
- palette
- review status
- approved image/result references

### Gemini Canvas should own

- fast visual exploration
- static composition exploration
- image/layout variation during early MVP
- manual refinement by a human operator

## Core Objects

### 1. `BookSpec`

```json
{
  "book_id": "little-prince-static-v1",
  "title": "The Little Prince",
  "language": ["en", "zh"],
  "target_format": "landscape_16_9",
  "style_system": {
    "keywords": ["quiet", "restrained", "storybook", "negative space"],
    "forbidden": ["busy effects", "excessive glow", "game UI", "cinematic chaos"]
  }
}
```

### 2. `PageSpec`

A single static page should contain:

- `page_id`
- `story_text`
- `visual_intent`
- `layout_constraints`
- `safe_zone`
- `character_rules`
- `prompt_pack`
- `canvas_result`
- `review`

### 3. `CanvasResult`

Tracks the current external result:

```json
{
  "share_url": "",
  "exported_image": "assets/pages/page_001_v3.png",
  "selected": true,
  "notes": "Fox moved inward; whitespace improved.",
  "created_at": "2026-03-07T00:00:00Z"
}
```

## Static-First Page Spec

See `tools/templates/gemini_canvas_page_spec.example.json`.

Important fields:

- `composition_mode`: `wide`, `left_focus`, `right_focus`, `paired`, `quiet_center`
- `negative_space_ratio`: target empty-space ratio
- `reading_safe_zone`: area reserved for title/body/subtitle
- `subject_scale`: how dominant the lead subject can be
- `edge_safety`: keeps objects off the trim edge
- `mood_palette`: restrained background and accent colors

## Canvas Prompt Pack

See `tools/templates/gemini_canvas_prompt_template.md`.

Export command:

```bash
node tools/export_canvas_prompt.js --spec page_specs/lp_001.json
```

This writes:

- `canvas_exports/<page_id>/<page_id>.prompt.md`
- `canvas_exports/<page_id>/<page_id>.bundle.json`

A good prompt pack should include:

- page goal in one sentence
- exact story text
- subject list
- composition instruction
- safe-zone instruction
- negative prompt list
- style restraints
- what must **not** happen

## Review Rubric

Every page should be reviewed on these dimensions:

- `readability`: text area remains clean and calm
- `containment`: key subjects do not clip or hug edges
- `whitespace`: page breathes like a real picture book
- `focus`: one clear lead subject or one clear relationship
- `restraint`: no unnecessary spectacle
- `consistency`: matches the book's visual language

Suggested 100-point rubric:

- readability: 25
- containment: 15
- whitespace: 20
- focus: 20
- restraint: 10
- consistency: 10

## Workflow States

Each page should move through these states:

- `draft_spec`
- `prompt_ready`
- `canvas_in_progress`
- `candidate_received`
- `reviewed`
- `approved`
- `locked`

## Import / Export Contract

### Export to Canvas

The repo exports:

- page JSON spec
- prompt markdown
- optional reference images
- page id and version number

### Import from Canvas

The repo records:

- chosen image path
- Gemini Canvas share link
- reviewer notes
- version tag
- approval state

## Suggested Directory Layout

```text
assets/pages/
page_specs/
tools/templates/
canvas_exports/
canvas_imports/
```

## Minimal `PageSpec` Rules

For the MVP, enforce these defaults:

- no particles
- no motion assumptions
- no dialogue overlap
- no object clipping at page edges
- no UI chrome in final page image
- one page = one calm visual idea

## Replacement Strategy Later

Once enough pages exist, replace Canvas gradually in this order:

1. keep the spec, swap out only prompt generation
2. generate layout candidates internally
3. generate art internally or through another provider
4. keep the same import/export contract
5. compare internal output against approved Canvas pages

This lets Canvas act as a temporary accelerator instead of a permanent dependency.

## What Not To Do

Do not make the MVP depend on programmatic control of Canvas internals.

Do not assume an official public `Canvas API` exists.

Do not store only final images without the page spec.

Do not optimize for animation before static pages feel like a real book.

## Immediate Next Step

Build a tiny internal tool that:

- edits `PageSpec`
- exports a prompt pack
- stores chosen Canvas result links and images
- tracks review scores and status

That gives you a practical bridge from `Gemini Canvas` to a future independent pipeline.
