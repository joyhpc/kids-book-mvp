#!/usr/bin/env python3
"""
AIGC 绘本资产全自动构建流水线 v2
===================================
支持两种模式：
  1. 单场景模式（兼容 v1）:
     python tools/build_book.py scene \
         --text "The fox is hungry. Feed him!" \
         --scene "A small fox sitting alone in a magical forest"

  2. 整本书批量模式:
     python tools/build_book.py book --config tools/book_config.yaml

依赖安装:
    pip install google-genai requests pyyaml
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path

# Add tools directory to sys.path so we can import schema.py
sys.path.append(str(Path(__file__).resolve().parent))


GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyAyDK2hUAC2gdx059vrx9CkcrUBrnaBpRI")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "YOUR_ELEVENLABS_API_KEY_HERE")
ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = PROJECT_ROOT / "assets"
SCENES_DIR = PROJECT_ROOT / "data" / "scenes"
SCENE_JSON_PATH = PROJECT_ROOT / "data" / "scene.json"
SCENE_JS_PATH = PROJECT_ROOT / "data" / "scene.js"
BOOK_JSON_PATH = PROJECT_ROOT / "data" / "book.json"

# =====================================================================
# The Aesthetic Constraint Filter (顶级审美约束层)
# 打破 AI 的平庸化，强制留白、克制、视觉诗意、反常识渲染
# =====================================================================
AESTHETIC_PREFIX = (
    "A minimalist conceptual art, extreme negative space, visual poetry, "
    "symbolic illustration, pure emotion, traditional ink and gouache style, "
    "melancholic ambiance, shape theory, bauhaus composition. "
    "--no hyper-realism, 3d render, busy background, clutter, disney style, highly detailed. "
)

# =====================================================================
# Step 1 — Gemini Imagen 3 生图
# =====================================================================
def generate_image(scene_description: str, output_path: Path) -> Path:
    """调用 Imagen 3 生成 16:9 绘本背景图并保存为 JPEG。"""
    from google import genai
    from google.genai import types

    print("  [IMG] 正在调用 Gemini Imagen 3 生成背景图 ...")
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    # 强制融合高维审美滤镜
    prompt = AESTHETIC_PREFIX + " Core visual concept: " + scene_description

    response = client.models.generate_images(
        model="imagen-4.0-generate-001",
        prompt=prompt,
        config=types.GenerateImagesConfig(
            number_of_images=1,
            aspect_ratio="16:9",
        ),
    )

    if not response.generated_images:
        raise RuntimeError("Imagen 3 未返回任何图片，请检查 prompt 或配额")

    image = response.generated_images[0].image
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(str(output_path))
    size_kb = output_path.stat().st_size / 1024
    print(f"        -> {output_path} ({size_kb:.0f} KB)")
    return output_path


# =====================================================================
# Step 2 — ElevenLabs TTS + 卡拉OK时间戳
# =====================================================================
def generate_speech_with_timestamps(
    text: str, voice_id: str, output_path: Path
) -> list[dict]:
    """
    调用 ElevenLabs with-timestamps 端点，返回单词级时间戳数组。
    同时将音频保存为 MP3。
    """
    import requests

    print("  [TTS] 正在调用 ElevenLabs TTS（含字符级时间戳）...")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        },
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(
            f"ElevenLabs API 返回 {resp.status_code}: {resp.text[:300]}"
        )

    data = resp.json()

    audio_bytes = base64.b64decode(data["audio_base64"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(audio_bytes)
    size_kb = len(audio_bytes) / 1024
    print(f"        -> {output_path} ({size_kb:.0f} KB)")

    alignment = data["alignment"]
    word_timings = merge_characters_to_words(
        characters=alignment["characters"],
        starts=alignment["character_start_times_seconds"],
        ends=alignment["character_end_times_seconds"],
    )

    print(f"        -> {len(word_timings)} 个单词时间戳")
    return word_timings


def merge_characters_to_words(
    characters: list[str],
    starts: list[float],
    ends: list[float],
) -> list[dict]:
    """将 ElevenLabs 返回的字符级时间戳聚合为单词级。"""
    words: list[dict] = []
    buf = ""
    w_start = None
    w_end = None

    for i, ch in enumerate(characters):
        if ch == " ":
            if buf:
                words.append({
                    "word": buf,
                    "start_time": round(w_start, 3),
                    "end_time": round(w_end, 3),
                })
                buf = ""
                w_start = None
                w_end = None
        else:
            if w_start is None:
                w_start = starts[i]
            w_end = ends[i]
            buf += ch

    if buf:
        words.append({
            "word": buf,
            "start_time": round(w_start, 3),
            "end_time": round(w_end, 3),
        })

    return words


# =====================================================================
# 单场景 JSON 组装
# =====================================================================
def build_single_scene_json(
    text_en: str,
    text_zh: str,
    word_timings: list[dict],
    dialogue_id: str,
    bg_rel: str,
    audio_rel: str,
) -> dict:
    """读取现有 scene.json 作为模板，更新背景图、音频和对白时间戳。"""
    if SCENE_JSON_PATH.exists():
        scene_data = json.loads(SCENE_JSON_PATH.read_text(encoding="utf-8"))
    else:
        scene_data = _default_scene_template()

    scene_data["scene"]["background"] = {
        "type": "image",
        "src": bg_rel,
        "particles": True,
    }

    dialogue = scene_data.get("dialogues", {}).get(dialogue_id)
    if dialogue is None:
        dialogue = {
            "id": dialogue_id,
            "auto_play": True,
            "display_on": "scene_ready",
        }
        scene_data.setdefault("dialogues", {})[dialogue_id] = dialogue

    dialogue["text_en"] = text_en
    if text_zh:
        dialogue["text_zh"] = text_zh
    dialogue["audio"] = audio_rel
    dialogue["words"] = word_timings

    _write_json(SCENE_JSON_PATH, scene_data)

    js_content = (
        "/**\n"
        " * [AUTO-GENERATED by build_book.py]\n"
        " * file:// 协议兼容层 — 与 scene.json 内容完全同步\n"
        " */\n"
        f"window.__SCENE_DATA__ = {json.dumps(scene_data, indent=2, ensure_ascii=False)};\n"
    )
    SCENE_JS_PATH.write_text(js_content, encoding="utf-8")

    return scene_data


# =====================================================================
# 整本书批量构建
# =====================================================================
def build_book(config: dict, voice_id: str) -> dict:
    """根据 YAML/dict 配置批量生成所有场景并组装 book.json。"""
    book_id = config["book_id"]
    title = config.get("title", book_id)
    language = config.get("language", ["en"])
    target_age = config.get("target_age", "4-8")
    scenes_cfg = config["scenes"]

    print(f"  书籍: {title}")
    print(f"  场景数: {len(scenes_cfg)}")
    print()

    book_scenes = []
    nav_rules = {}

    for idx, sc in enumerate(scenes_cfg):
        scene_num = idx + 1
        scene_id = sc.get("id", f"scene_{scene_num:02d}")
        scene_title_zh = sc.get("title_zh", sc.get("title", f"场景 {scene_num}"))
        scene_title_en = sc.get("title_en", f"Scene {scene_num}")

        print(f"  ── [{scene_num}/{len(scenes_cfg)}] {scene_id}: {scene_title_zh} ──")

        bg_filename = f"{scene_id}_bg.jpg"
        audio_filename = f"{scene_id}.mp3"
        bg_path = ASSETS_DIR / "scenes" / bg_filename
        audio_path = ASSETS_DIR / "audio" / audio_filename
        bg_rel = f"assets/scenes/{bg_filename}"
        audio_rel = f"assets/audio/{audio_filename}"

        word_timings = []
        text_en = sc.get("dialogue_text", "")
        text_zh = sc.get("dialogue_text_zh", "")

        bg_override = sc.get("background_override")

        # ==========================================
        # [AIGC Pipeline Pass 1] 状态机与上下文继承
        # 1. 提取当前页配置
        location_id = sc.get("location_id")
        time_of_day = sc.get("time_of_day", "day")
        action_prompt = sc.get("action_prompt")
        
        # 2. 从全局 Lorebook 中锁定背景 Prompt
        resolved_bg_prompt = None
        lorebook = config.get("lorebook", {})
        if location_id and "locations" in lorebook and location_id in lorebook["locations"]:
            loc_data = lorebook["locations"][location_id]
            resolved_bg_prompt = f"{loc_data.get('visual_prompt', '')}, time: {time_of_day}, {loc_data.get('lighting', '')}"
        elif sc.get("scene_description"):
             resolved_bg_prompt = sc.get("scene_description")
             
        # 3. 拼接终极生图 Prompt (Two-Pass Storyboarding 雏形)
        resolved_full_prompt = None
        if resolved_bg_prompt:
             resolved_full_prompt = resolved_bg_prompt
             if action_prompt:
                 resolved_full_prompt += f" | Soul expression: {action_prompt}"
                 
        if resolved_full_prompt:
             print(f"        [Pass 1 Soul Extracted] {resolved_full_prompt[:80]}...")
             
        # 将组合好的 prompt 交给生图引擎
        if resolved_full_prompt and "scene_description" not in sc:
             sc["scene_description"] = resolved_full_prompt
        # ==========================================

        if sc.get("scene_description") and GEMINI_API_KEY and not GEMINI_API_KEY.startswith("YOUR_"):
            try:
                generate_image(sc["scene_description"], bg_path)
            except Exception as e:
                print(f"        [WARN] 生图失败: {e}")
                bg_rel = None

        if text_en and ELEVENLABS_API_KEY != "YOUR_ELEVENLABS_API_KEY_HERE":
            try:
                word_timings = generate_speech_with_timestamps(
                    text=text_en,
                    voice_id=voice_id,
                    output_path=audio_path,
                )
            except Exception as e:
                print(f"        [WARN] TTS 失败: {e}")
                audio_rel = None
        elif text_en:
            word_timings = _fake_word_timings(text_en)
            audio_rel = None

        scene_json = _build_scene_data(
            scene_id=scene_id,
            title_zh=scene_title_zh,
            title_en=scene_title_en,
            text_en=text_en,
            text_zh=text_zh,
            word_timings=word_timings,
            bg_rel=bg_rel,
            audio_rel=audio_rel,
            characters=sc.get("characters", []),
            items=sc.get("items", []),
            interaction=sc.get("interaction"),
            ending=sc.get("ending"),
            after_success_text=sc.get("after_success_text"),
            after_success_text_zh=sc.get("after_success_text_zh"),
            background_override=bg_override,
            text_original=sc.get("dialogue_text_fr") or sc.get("dialogue_text_original"),
            after_success_text_original=sc.get("after_success_text_fr") or sc.get("after_success_text_original"),
            location_id=location_id,
            time_of_day=time_of_day,
            action_prompt=action_prompt,
            resolved_bg_prompt=resolved_bg_prompt,
            resolved_full_prompt=resolved_full_prompt,
        )

        scene_file = SCENES_DIR / f"scene_{scene_num:02d}.json"
        
        # [NEW] 强制通过 Pydantic 校验和洗绿
        import schema
        try:
            validated_scene = schema.SceneConfig.model_validate(scene_json)
            scene_json = json.loads(validated_scene.model_dump_json(exclude_none=True))
        except Exception as e:
            print(f"        [ERROR] 场景 {scene_id} 数据校验失败: {e}")
            raise
            
        _write_json(scene_file, scene_json)

        book_scenes.append({
            "id": scene_id,
            "title_zh": scene_title_zh,
            "title_en": scene_title_en,
            "data_url": f"data/scenes/scene_{scene_num:02d}.json",
            "thumbnail": None,
        })

        next_id = None
        if idx < len(scenes_cfg) - 1:
            next_id = scenes_cfg[idx + 1].get("id", f"scene_{scene_num + 1:02d}")
            
        unlock = sc.get("unlock_condition", "interaction_success" if sc.get("interaction") else None)
        
        # [Tale-js 借鉴] 支持分支路由配置
        branches = sc.get("branches")
        
        nav_rules[scene_id] = {
            "next": next_id,
            "unlock_condition": unlock,
            "branches": branches
        }

        print()

    book_json = {
        "meta": {
            "book_id": book_id,
            "title": title,
            "version": "1.0.0",
            "language": language,
            "target_age": target_age,
        },
        "config": {
            "navigation": {
                "type": config.get("navigation_type", "linear"),
                "show_progress": True,
                "allow_skip": False,
                "transition": config.get("transition", "fade"),
            },
            "ui": {
                "theme": config.get("theme", "night_sky"),
                "font_family": config.get("font_family", "Nunito"),
            },
        },
        "scenes": book_scenes,
        "navigation_rules": nav_rules,
    }

    # [NEW] 强制通过 Pydantic 校验 book.json
    try:
        import schema
        validated_book = schema.BookConfig.model_validate(book_json)
        book_json = json.loads(validated_book.model_dump_json(exclude_none=True))
    except Exception as e:
        print(f"  [ERROR] 书籍数据校验失败: {e}")
        raise

    _write_json(BOOK_JSON_PATH, book_json)
    return book_json


def _build_scene_data(
    scene_id, title_zh, title_en,
    text_en, text_zh, word_timings,
    bg_rel, audio_rel,
    characters, items, interaction, ending,
    after_success_text=None, after_success_text_zh=None,
    background_override=None,
    text_original=None, after_success_text_original=None,
    location_id=None, time_of_day="day", action_prompt=None,
    resolved_bg_prompt=None, resolved_full_prompt=None,
) -> dict:
    """组装单个场景的完整 JSON 数据。"""
    bg_cfg = {"type": "canvas", "gradient": "radial-gradient(circle at 50% 40%, #050a14 0%, #010205 100%)", "particles": True}
    if background_override:
        bg_cfg = background_override
    elif bg_rel:
        bg_cfg = {"type": "image", "src": bg_rel, "particles": True}

    dialogues = {}
    if text_en or text_original:
        intro_dlg = {
            "id": "intro",
            "text_en": text_en or "",
            "text_zh": text_zh or "",
            "words": word_timings,
            "auto_play": True,
            "display_on": "scene_ready",
        }
        if text_original:
            intro_dlg["text_original"] = text_original
        if audio_rel:
            intro_dlg["audio"] = audio_rel
        dialogues["intro"] = intro_dlg

    if after_success_text or after_success_text_original:
        after_timings = _fake_word_timings(after_success_text or "")
        dialogues["after_feed"] = {
            "id": "after_feed",
            "text_en": after_success_text or "",
            "text_zh": after_success_text_zh or "",
            "words": after_timings,
            "auto_play": False,
        }
        if after_success_text_original:
            dialogues["after_feed"]["text_original"] = after_success_text_original

    scene_data = {
        "meta": {
            "scene_id": scene_id,
            "title": f"{title_zh} | {title_en}",
            "version": "1.0.0",
        },
        "location_id": location_id,
        "time_of_day": time_of_day,
        "action_prompt": action_prompt,
        "resolved_bg_prompt": resolved_bg_prompt,
        "resolved_full_prompt": resolved_full_prompt,
        "scene": {
            "id": scene_id,
            "background": bg_cfg,
            "characters": characters or [],
            "items": items or [],
        },
        "interaction": interaction,
        "dialogues": dialogues,
        "ending": ending,
        "ui": {
            "subtitle_panel": {
                "position": "top", "height": "auto", "padding": "1.2rem",
                "font_size": "1.75rem", "highlight_color": "#d4af37",
                "highlight_scale": 1.15, "normal_color": "#FFFFFF",
                "bg_color": "rgba(5,8,15,0.7)", "border_radius": "16px",
            },
            "hint": {
                "show_after_ms": 2500, "position": "bottom",
            },
        },
    }

    return scene_data


def _fake_word_timings(text: str) -> list[dict]:
    """在无 API key 时，根据文本生成模拟时间戳（每词约 0.35 秒）。"""
    words = text.split()
    timings = []
    t = 0.0
    for w in words:
        duration = max(0.2, len(w) * 0.08)
        timings.append({
            "word": w,
            "start_time": round(t, 3),
            "end_time": round(t + duration, 3),
        })
        t += duration + 0.1
    return timings


def _default_scene_template() -> dict:
    return {
        "meta": {"title": "AIGC Storybook", "version": "2.0.0", "language": ["en"], "target_age": "4-8"},
        "scene": {"id": "generated_scene", "background": {}, "characters": [], "items": []},
        "interaction": {},
        "dialogues": {},
        "ui": {
            "subtitle_panel": {
                "position": "top", "height": "auto", "padding": "1.2rem",
                "font_size": "1.6rem", "highlight_color": "#d4af37",
                "highlight_scale": 1.15, "normal_color": "#FFFFFF",
                "bg_color": "rgba(10,15,25,0.65)", "border_radius": "20px",
            },
            "hint": {"show_after_ms": 2500, "position": "bottom", "font_size": "1.1rem"},
        },
    }


def _write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"        -> {path}")


def _check_api_keys():
    errors = []
    if GEMINI_API_KEY.startswith("YOUR_"):
        errors.append("GEMINI_API_KEY")
    if ELEVENLABS_API_KEY.startswith("YOUR_"):
        errors.append("ELEVENLABS_API_KEY")
    return errors


# =====================================================================
# CLI 入口
# =====================================================================
def main():
    parser = argparse.ArgumentParser(
        description="AIGC 绘本资产全自动构建流水线 v2",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", help="子命令")

    # ── scene 子命令：单场景模式（兼容 v1） ──
    p_scene = sub.add_parser("scene", help="生成单个场景的资产")
    p_scene.add_argument("--text", required=True, help="英文台词")
    p_scene.add_argument("--scene", required=True, help="英文场景描述")
    p_scene.add_argument("--text-zh", default="", help="中文翻译")
    p_scene.add_argument("--dialogue-id", default="intro", help="对白 ID（默认 intro）")
    p_scene.add_argument("--voice-id", default=ELEVENLABS_VOICE_ID, help="ElevenLabs 语音 ID")

    # ── book 子命令：整本书批量模式 ──
    p_book = sub.add_parser("book", help="根据 YAML 配置批量生成整本书")
    p_book.add_argument("--config", required=True, help="YAML 配置文件路径")
    p_book.add_argument("--voice-id", default=ELEVENLABS_VOICE_ID, help="ElevenLabs 语音 ID")

    # 向后兼容：如果没有子命令但有 --text 参数，按单场景处理
    args, remaining = parser.parse_known_args()
    if args.command is None:
        if "--text" in sys.argv:
            args = p_scene.parse_args(sys.argv[1:])
            args.command = "scene"
        else:
            parser.print_help()
            sys.exit(0)

    print("=" * 56)
    print("   AIGC 绘本流水线  v2  ·  build_book.py")
    print("=" * 56)
    print()

    if args.command == "scene":
        missing = _check_api_keys()
        if missing:
            print(f"  [WARN] 未设置: {', '.join(missing)}", file=sys.stderr)
            print("         将跳过对应的 API 调用", file=sys.stderr)
            print()

        bg_path = ASSETS_DIR / "bg.jpg"
        audio_path = ASSETS_DIR / "audio.mp3"

        print(f"  台词 : {args.text}")
        print(f"  场景 : {args.scene}")
        print()

        if "GEMINI_API_KEY" not in missing:
            generate_image(args.scene, bg_path)
            bg_rel = "assets/bg.jpg"
        else:
            bg_rel = None
            print("  [SKIP] 生图（无 GEMINI_API_KEY）")

        print()

        if "ELEVENLABS_API_KEY" not in missing:
            word_timings = generate_speech_with_timestamps(
                text=args.text, voice_id=args.voice_id, output_path=audio_path,
            )
            audio_rel = "assets/audio.mp3"
        else:
            word_timings = _fake_word_timings(args.text)
            audio_rel = None
            print("  [SKIP] TTS（无 ELEVENLABS_API_KEY），使用模拟时间戳")

        print()
        print("  [JSON] 组装 scene.json ...")
        build_single_scene_json(
            text_en=args.text, text_zh=args.text_zh,
            word_timings=word_timings, dialogue_id=args.dialogue_id,
            bg_rel=bg_rel or "assets/bg.jpg",
            audio_rel=audio_rel or "",
        )

    elif args.command == "book":
        try:
            import yaml
        except ImportError:
            print("  [ERR] 请安装 pyyaml: pip install pyyaml", file=sys.stderr)
            sys.exit(1)

        config_path = Path(args.config)
        if not config_path.exists():
            print(f"  [ERR] 配置文件不存在: {config_path}", file=sys.stderr)
            sys.exit(1)

        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f)

        missing = _check_api_keys()
        if missing:
            print(f"  [WARN] 未设置: {', '.join(missing)}")
            print("         将跳过对应的 API 调用，使用占位数据")
            print()

        build_book(config, voice_id=args.voice_id)

    print()
    print("  Done! 用浏览器打开 index.html 预览效果。")
    print("=" * 56)


if __name__ == "__main__":
    main()
