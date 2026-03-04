#!/usr/bin/env python3
"""
将黑底发光图转换为透明底：从源头消灭方框，而非事后用 CSS 修补。
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def black_to_transparent(input_path: Path, output_path: Path, threshold: int = 30):
    """将接近纯黑的像素设为全透明，保留发光主体。"""
    try:
        from PIL import Image
    except ImportError:
        print("  [ERR] 需要 Pillow: pip install Pillow")
        sys.exit(1)

    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    new_data = []

    for item in data:
        r, g, b, a = item
        # 接近黑的像素 → 完全透明
        if r <= threshold and g <= threshold and b <= threshold:
            new_data.append((0, 0, 0, 0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(output_path), "PNG")
    print(f"  -> {output_path} (透明底)")


if __name__ == "__main__":
    inp = PROJECT_ROOT / "assets" / "mermaid_glowing.png"
    out = PROJECT_ROOT / "assets" / "mermaid_transparent.png"
    if not inp.exists():
        print(f"  [ERR] 文件不存在: {inp}")
        sys.exit(1)
    black_to_transparent(inp, out)
    print("  完成。请在 YAML 中将 img_src 改为 assets/mermaid_transparent.png")
