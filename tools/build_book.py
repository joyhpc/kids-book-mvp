#!/usr/bin/env python3
"""
AIGC 绘本资产全自动构建流水线
==============================
用法:
    python tools/build_book.py \
        --text "The fox is hungry. Feed him!" \
        --scene "A small fox sitting alone in a magical forest clearing at night"

可选参数:
    --dialogue-id   要更新的对白 ID（默认 intro）
    --voice-id      ElevenLabs 语音 ID（默认 Rachel）
    --text-zh       中文翻译文本

依赖安装:
    pip install google-genai requests
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path

# ─── API Keys（运行前请替换为你自己的密钥，或设置同名环境变量） ───
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY_HERE")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "YOUR_ELEVENLABS_API_KEY_HERE")
ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # 默认 Rachel

# ─── 路径常量（相对于项目根目录） ───
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = PROJECT_ROOT / "assets"
SCENE_JSON_PATH = PROJECT_ROOT / "data" / "scene.json"
SCENE_JS_PATH = PROJECT_ROOT / "data" / "scene.js"

STYLE_PREFIX = (
    "Masterpiece, breathtaking children's storybook illustration, "
    "magical glowing forest, soft cinematic lighting, "
    "Studio Ghibli style, vibrant colors, clean background. "
)


# =====================================================================
# Step 1 — Gemini Imagen 3 生图
# =====================================================================
def generate_image(scene_description: str, output_path: Path) -> Path:
    """调用 Imagen 3 生成 16:9 绘本背景图并保存为 JPEG。"""
    from google import genai
    from google.genai import types

    print("[1/3] 正在调用 Gemini Imagen 3 生成背景图 ...")
    client = genai.Client(api_key=GEMINI_API_KEY)
    prompt = STYLE_PREFIX + scene_description

    response = client.models.generate_images(
        model="imagen-3.0-generate-002",
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
    print(f"      ✅ 背景图已保存 → {output_path}  ({size_kb:.0f} KB)")
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

    print("[2/3] 正在调用 ElevenLabs TTS（含字符级时间戳）...")

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

    # ── 保存音频 ──
    audio_bytes = base64.b64decode(data["audio_base64"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(audio_bytes)
    size_kb = len(audio_bytes) / 1024
    print(f"      ✅ 配音已保存 → {output_path}  ({size_kb:.0f} KB)")

    # ── 字符级 → 单词级 合并 ──
    alignment = data["alignment"]
    word_timings = merge_characters_to_words(
        characters=alignment["characters"],
        starts=alignment["character_start_times_seconds"],
        ends=alignment["character_end_times_seconds"],
    )

    print(f"      ✅ 已解析 {len(word_timings)} 个单词时间戳")
    return word_timings


def merge_characters_to_words(
    characters: list[str],
    starts: list[float],
    ends: list[float],
) -> list[dict]:
    """
    将 ElevenLabs 返回的字符级时间戳聚合为单词级。

    规则：
    - 空格作为分词界限
    - 标点符号（如 . ! ? , ;）紧跟前一个单词，不独立成词
    - 连续空格 / 前导空格被跳过
    - 每个单词的 start_time 取首字符，end_time 取末字符
    """
    words: list[dict] = []
    buf = ""          # 当前单词字符缓冲
    w_start = None    # 当前单词起始时间
    w_end = None      # 当前单词结束时间

    for i, ch in enumerate(characters):
        if ch == " ":
            # 遇到空格 → 落袋当前单词
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

    # 收尾：最后一个单词
    if buf:
        words.append({
            "word": buf,
            "start_time": round(w_start, 3),
            "end_time": round(w_end, 3),
        })

    return words


# =====================================================================
# Step 3 — 组装并覆写 scene.json / scene.js
# =====================================================================
def build_scene_json(
    text_en: str,
    text_zh: str,
    word_timings: list[dict],
    dialogue_id: str,
    bg_rel: str,
    audio_rel: str,
) -> dict:
    """
    读取现有 scene.json 作为模板，更新背景图、音频和对白时间戳，
    然后覆写 scene.json 和 scene.js。
    """
    print("[3/3] 正在组装 scene.json ...")

    # 读取现有模板
    if SCENE_JSON_PATH.exists():
        scene_data = json.loads(SCENE_JSON_PATH.read_text(encoding="utf-8"))
    else:
        scene_data = _default_scene_template()

    # ── 更新背景 ──
    scene_data["scene"]["background"] = {
        "type": "image",
        "src": bg_rel,
        "particles": True,
    }

    # ── 更新目标对白 ──
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

    # ── 写入 scene.json ──
    json_str = json.dumps(scene_data, indent=2, ensure_ascii=False)
    SCENE_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    SCENE_JSON_PATH.write_text(json_str, encoding="utf-8")
    print(f"      ✅ {SCENE_JSON_PATH}")

    # ── 同步写入 scene.js（file:// 降级方案） ──
    js_content = (
        "/**\n"
        " * [AUTO-GENERATED by build_book.py]\n"
        " * file:// 协议兼容层 — 与 scene.json 内容完全同步\n"
        " */\n"
        f"window.__SCENE_DATA__ = {json_str};\n"
    )
    SCENE_JS_PATH.write_text(js_content, encoding="utf-8")
    print(f"      ✅ {SCENE_JS_PATH}")

    return scene_data


def _default_scene_template() -> dict:
    """如果项目中没有 scene.json，提供一份最小模板。"""
    return {
        "meta": {
            "title": "AIGC Storybook",
            "version": "2.0.0",
            "language": ["en"],
            "target_age": "4-8",
        },
        "scene": {
            "id": "generated_scene",
            "background": {},
            "characters": [],
            "items": [],
        },
        "interaction": {},
        "dialogues": {},
        "ui": {
            "subtitle_panel": {
                "position": "top",
                "height": "auto",
                "padding": "1.2rem",
                "font_size": "1.6rem",
                "highlight_color": "#d4af37",
                "highlight_scale": 1.15,
                "normal_color": "#FFFFFF",
                "bg_color": "rgba(10,15,25,0.65)",
                "border_radius": "20px",
            },
            "hint": {
                "show_after_ms": 2500,
                "position": "bottom",
                "font_size": "1.1rem",
            },
        },
    }


# =====================================================================
# CLI 入口
# =====================================================================
def main():
    parser = argparse.ArgumentParser(
        description="AIGC 绘本资产全自动构建流水线",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            '  python tools/build_book.py \\\n'
            '      --text "The fox is hungry. Feed him!" \\\n'
            '      --scene "A small fox sitting alone in a magical forest"\n'
        ),
    )
    parser.add_argument("--text", required=True, help="英文台词（将作为 TTS 输入和字幕源）")
    parser.add_argument("--scene", required=True, help="英文场景描述（将拼接风格词后发给 Imagen 3）")
    parser.add_argument("--text-zh", default="", help="中文翻译（可选，写入 text_zh 字段）")
    parser.add_argument(
        "--dialogue-id", default="intro", help="要更新的对白 ID（默认 intro）"
    )
    parser.add_argument(
        "--voice-id", default=ELEVENLABS_VOICE_ID, help="ElevenLabs 语音 ID"
    )
    args = parser.parse_args()

    # 前置校验
    if GEMINI_API_KEY.startswith("YOUR_"):
        print("❌ 请先设置 GEMINI_API_KEY（环境变量或脚本顶部常量）", file=sys.stderr)
        sys.exit(1)
    if ELEVENLABS_API_KEY.startswith("YOUR_"):
        print("❌ 请先设置 ELEVENLABS_API_KEY（环境变量或脚本顶部常量）", file=sys.stderr)
        sys.exit(1)

    bg_path = ASSETS_DIR / "bg.jpg"
    audio_path = ASSETS_DIR / "audio.mp3"

    print("=" * 56)
    print("   AIGC 绘本流水线  ·  build_book.py")
    print("=" * 56)
    print(f"  台词 : {args.text}")
    print(f"  场景 : {args.scene}")
    print(f"  对白ID: {args.dialogue_id}")
    print()

    # Step 1: 生图
    generate_image(args.scene, bg_path)
    print()

    # Step 2: 生音 + 时间戳
    word_timings = generate_speech_with_timestamps(
        text=args.text,
        voice_id=args.voice_id,
        output_path=audio_path,
    )
    print()

    # Step 3: 组装 JSON
    bg_rel = "assets/bg.jpg"
    audio_rel = "assets/audio.mp3"
    build_scene_json(
        text_en=args.text,
        text_zh=args.text_zh,
        word_timings=word_timings,
        dialogue_id=args.dialogue_id,
        bg_rel=bg_rel,
        audio_rel=audio_rel,
    )

    print()
    print("🎉 全部完成！现在可以用浏览器打开 index.html 预览效果。")
    print("=" * 56)


if __name__ == "__main__":
    main()
