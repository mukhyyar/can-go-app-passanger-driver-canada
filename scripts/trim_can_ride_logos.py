"""Trim docs/logo masters and emit can-ride brand PNGs for web + Flutter.

Colored masters use a solid black canvas where black is also the road cutout.
The road opens at the leaf base, so corner flood-fill would erase it.
Instead: keep black pixels near red (or near non-bg content); clear far outer black.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "logo"
OUT_ADMIN = ROOT / "apps" / "admin" / "public" / "brand"
OUT_WEB = ROOT / "apps" / "web-passenger" / "public" / "brand"
OUT_GTUI = ROOT / "mobile" / "packages" / "gt_ui" / "assets"

PAD_FRAC = 0.03


def clear_outer_black_keep_road(im: Image.Image, near_px: int = 14) -> Image.Image:
    """Make distant outer black transparent; keep black road near red leaf."""
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    # Content mask: non-near-black opaque pixels (red / white / grey marks)
    content = Image.new("L", (w, h), 0)
    cp = content.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            if r + g + b < 40:
                continue  # black / near-black
            cp[x, y] = 255

    # Expand content so road (black inside leaf) stays within keep-zone
    keep = content.filter(ImageFilter.MaxFilter(near_px * 2 + 1))
    kp = keep.load()

    out = rgba.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = op[x, y]
            if a < 8:
                continue
            if r + g + b < 40 and kp[x, y] == 0:
                op[x, y] = (0, 0, 0, 0)
    return out


def content_bbox(im: Image.Image) -> tuple[int, int, int, int] | None:
    return im.convert("RGBA").split()[3].getbbox()


def trim(im: Image.Image, pad_frac: float = PAD_FRAC, clear_black_bg: bool = False) -> Image.Image:
    rgba = im.convert("RGBA")
    w, h = rgba.size
    corner = rgba.getpixel((0, 0))
    # Opaque dark canvas → clear outer black only
    if clear_black_bg or (corner[3] > 200 and sum(corner[:3]) < 40):
        rgba = clear_outer_black_keep_road(rgba)

    bbox = content_bbox(rgba)
    if not bbox:
        return rgba
    left, top, right, bottom = bbox
    cw, ch = right - left, bottom - top
    pad = max(2, int(round(max(cw, ch) * pad_frac)))
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(w, right + pad)
    bottom = min(h, bottom + pad)
    return rgba.crop((left, top, right, bottom))


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)
    print(f"  wrote {path.relative_to(ROOT)} ({im.size[0]}x{im.size[1]})")


def main() -> None:
    symbol = trim(Image.open(SRC / "Logo_Symbol.png"), clear_black_bg=True)
    symbol_white = trim(Image.open(SRC / "Logo_Symbol_White.png"))
    rect = trim(Image.open(SRC / "Logo_Rectangle.png"), clear_black_bg=True)
    rect_white = trim(Image.open(SRC / "Logo_Rectangle_White.png"))
    square = trim(Image.open(SRC / "Logo_Square.png"), clear_black_bg=True)
    square_white = trim(Image.open(SRC / "Logo_Square_White.png"))

    outputs = {
        "can-ride-mark.png": symbol,
        "can-ride-mark-white.png": symbol_white,
        "can-ride-logo.png": rect,
        "can-ride-logo-white.png": rect_white,
        "can-ride-square.png": square,
        "can-ride-square-white.png": square_white,
    }

    for folder in (OUT_ADMIN, OUT_WEB):
        print(folder.relative_to(ROOT))
        for name, img in outputs.items():
            save(img, folder / name)

    print(OUT_GTUI.relative_to(ROOT))
    save(square, OUT_GTUI / "can-ride-logo.png")
    save(symbol, OUT_GTUI / "appicon-source.png")
    save(square_white, OUT_GTUI / "can-ride-logo-white.png")

    # Refresh Android splash bitmaps
    for app in ("passenger", "driver"):
        out = (
            ROOT
            / "mobile"
            / "apps"
            / app
            / "android"
            / "app"
            / "src"
            / "main"
            / "res"
            / "drawable"
            / "can_go_logo.png"
        )
        splash = square.resize(
            (512, int(512 * square.size[1] / square.size[0])),
            Image.Resampling.LANCZOS,
        )
        save(splash, out)

    print("OK: trimmed CAN-RIDE assets (road preserved)")


if __name__ == "__main__":
    main()
