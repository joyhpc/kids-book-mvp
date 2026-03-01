/**
 * file:// protocol fallback
 */
window.__SCENE_DATA__ = {
  "meta": {
    "title": "The Little Prince Feeds the Fox",
    "version": "4.0.0",
    "language": ["en", "zh"],
    "target_age": "4-8"
  },
  "scene": {
    "id": "feed_the_fox",
    "background": {
      "type": "canvas",
      "gradient": "radial-gradient(circle at 50% 40%, #050a14 0%, #010205 100%)",
      "particles": true
    },
    "characters": [
      {
        "id": "fox",
        "img_src": "assets/fox.svg",
        "label": "Fox",
        "position": { "x": "75%", "y": "65%" },
        "width": "100px",
        "height": "100px",
        "states": {
          "hungry": {
            "filter": "grayscale(0.7) brightness(0.75) drop-shadow(0 0 8px rgba(255,255,255,0.1))",
            "animation": "fox-idle",
            "label_zh": "Hungry fox"
          },
          "happy": {
            "filter": "saturate(1.3) brightness(1.15) drop-shadow(0 0 20px rgba(255,200,100,0.4))",
            "animation": "fox-jump",
            "label_zh": "Happy fox"
          }
        },
        "initial_state": "hungry"
      }
    ],
    "items": [
      {
        "id": "apple",
        "img_src": "assets/apple.svg",
        "label": "Apple",
        "position": { "x": "22%", "y": "68%" },
        "width": "65px",
        "height": "65px",
        "draggable": true,
        "animation": "item-bounce"
      }
    ]
  },
  "interaction": {
    "type": "drag_and_drop",
    "draggable_id": "apple",
    "target_id": "fox",
    "hit_tolerance": 60,
    "on_fail": { "action": "spring_back", "duration_ms": 400, "easing": "cubic-bezier(0.34, 1.56, 0.64, 1)" },
    "on_success": {
      "actions": [
        { "type": "hide_item", "target": "apple", "animation": "pop-vanish" },
        { "type": "change_state", "target": "fox", "to_state": "happy" },
        { "type": "play_dialogue", "dialogue_id": "after_feed" },
        { "type": "show_particles", "emoji": "\u2728", "count": 8, "duration_ms": 1200 }
      ]
    }
  },
  "dialogues": {
    "intro": {
      "id": "intro",
      "text_en": "\"Please \u2014 tame me!\" said the fox.",
      "text_zh": "\u201c\u6c42\u4f60\u2014\u2014\u9a6f\u670d\u6211\u5427\uff01\u201d\u72d0\u72f8\u8bf4\u3002",
      "words": [
        { "word": "\"Please", "start_time": 0.0, "end_time": 0.45 },
        { "word": "\u2014", "start_time": 0.45, "end_time": 0.65 },
        { "word": "tame", "start_time": 0.65, "end_time": 1.05 },
        { "word": "me!\"", "start_time": 1.05, "end_time": 1.50 },
        { "word": "said", "start_time": 1.65, "end_time": 1.95 },
        { "word": "the", "start_time": 1.95, "end_time": 2.10 },
        { "word": "fox.", "start_time": 2.10, "end_time": 2.60 }
      ],
      "auto_play": true,
      "display_on": "scene_ready"
    },
    "after_feed": {
      "id": "after_feed",
      "text_en": "What is essential is invisible to the eye.",
      "text_zh": "\u771f\u6b63\u91cd\u8981\u7684\u4e1c\u897f\uff0c\u773c\u775b\u662f\u770b\u4e0d\u89c1\u7684\u3002",
      "words": [
        { "word": "What", "start_time": 0.0, "end_time": 0.35 },
        { "word": "is", "start_time": 0.35, "end_time": 0.50 },
        { "word": "essential", "start_time": 0.50, "end_time": 1.05 },
        { "word": "is", "start_time": 1.15, "end_time": 1.30 },
        { "word": "invisible", "start_time": 1.30, "end_time": 1.85 },
        { "word": "to", "start_time": 1.85, "end_time": 2.00 },
        { "word": "the", "start_time": 2.00, "end_time": 2.15 },
        { "word": "eye.", "start_time": 2.15, "end_time": 2.70 }
      ],
      "auto_play": true,
      "display_on": "interaction_success"
    }
  },
  "ending": {
    "delay_after_success_ms": 5000,
    "title_en": "Chapter 1 Complete",
    "title_zh": "\u7b2c\u4e00\u7ae0 \u00b7 \u5b8c",
    "subtitle_zh": "\u9a6f\u670d\uff0c\u5c31\u662f\u521b\u9020\u8054\u7cfb\u2026\u2026",
    "button_text": "\u518d\u8bfb\u4e00\u904d",
    "particles_emoji": "\u2728"
  },
  "ui": {
    "subtitle_panel": { "position": "top", "height": "auto", "padding": "1.2rem", "font_size": "1.75rem",
      "highlight_color": "#d4af37", "highlight_scale": 1.15, "normal_color": "#FFFFFF",
      "bg_color": "rgba(5,8,15,0.7)", "border_radius": "16px" },
    "hint": { "text_en": "Drag the apple to the fox!", "text_zh": "\u2728 \u628a\u82f9\u679c\u9001\u7ed9\u5c0f\u72d0\u72f8\u5427",
      "show_after_ms": 3000, "position": "bottom", "font_size": "1.05rem" }
  }
};
