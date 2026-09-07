"""Generate passenger + driver app icons (white bg)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]  # mobile/
LOGO_PATH = Path(__file__).resolve().parent / "appicon.png"
# Prefer leaf-only source before overwrite — keep original if present as backup name
SRC_CANDIDATES = [
    Path(__file__).resolve().parent / "appicon-source.png",
    Path(__file__).resolve().parent / "appicon.png",
]
BRAND = (0xB4, 0x1B, 0x1D, 255)
WHITE = (255, 255, 255, 255)
MASTER = 1024


def load_logo() -> Image.Image:
    for p in SRC_CANDIDATES:
        if p.exists():
            logo = Image.open(p).convert("RGBA")
            # If already a composed square icon, extract by using as-is trim
            bbox = logo.getbbox()
            if bbox:
                logo = logo.crop(bbox)
            return logo
    raise FileNotFoundError("No logo source found")


logo_src = load_logo()


def fit_logo(target_max: int) -> Image.Image:
    w, h = logo_src.size
    scale = min(target_max / w, target_max / h)
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return logo_src.resize((nw, nh), Image.Resampling.LANCZOS)


def make_passenger(size: int = MASTER) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), WHITE)
    logo = fit_logo(int(size * 0.76))
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas


def load_font(px: int) -> ImageFont.ImageFont:
    candidates = [
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\seguisb.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, px)
    return ImageFont.load_default()


def make_driver(size: int = MASTER) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), WHITE)
    bar_h = int(round(size * 0.20))
    usable = size - bar_h
    logo = fit_logo(int(size * 0.58))
    x = (size - logo.width) // 2
    y = (usable - logo.height) // 2
    y = max(0, y - int(size * 0.01))
    canvas.alpha_composite(logo, (x, y))

    draw = ImageDraw.Draw(canvas)
    bar_top = size - bar_h
    draw.rectangle([0, bar_top, size, size], fill=BRAND)

    font_size = int(bar_h * 0.52)
    font = load_font(font_size)
    text = "Driver"
    tb = draw.textbbox((0, 0), text, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    tx = (size - tw) // 2 - tb[0]
    ty = bar_top + (bar_h - th) // 2 - tb[1]
    draw.text((tx, ty), text, font=font, fill=WHITE)
    return canvas


def save_resized(img: Image.Image, path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.Resampling.LANCZOS).convert("RGBA").save(path, "PNG")


ANDROID_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def write_android(app: str, master: Image.Image) -> None:
    base = ROOT / "apps" / app / "android" / "app" / "src" / "main" / "res"
    for folder, sz in ANDROID_SIZES.items():
        save_resized(master, base / folder / "ic_launcher.png", sz)


def write_web(app: str, master: Image.Image) -> None:
    base = ROOT / "apps" / app / "web"
    icons = base / "icons"
    save_resized(master, icons / "Icon-192.png", 192)
    save_resized(master, icons / "Icon-512.png", 512)
    save_resized(master, icons / "Icon-maskable-192.png", 192)
    save_resized(master, icons / "Icon-maskable-512.png", 512)
    save_resized(master, base / "favicon.png", 32)


def main() -> None:
    assets = Path(__file__).resolve().parent
    # Preserve transparent leaf source once
    source_backup = assets / "appicon-source.png"
    if not source_backup.exists():
        # Current appicon.png is leaf with transparency — back it up
        Image.open(assets / "appicon.png").convert("RGBA").save(source_backup)

    # Reload from backup so re-runs stay correct
    global logo_src
    logo_src = Image.open(source_backup).convert("RGBA")
    bbox = logo_src.getbbox()
    if bbox:
        logo_src = logo_src.crop(bbox)

    passenger = make_passenger()
    driver = make_driver()

    passenger.save(assets / "appicon-passenger.png")
    driver.save(assets / "appicon-driver.png")
    passenger.save(assets / "appicon.png")

    write_android("passenger", passenger)
    write_web("passenger", passenger)
    write_android("driver", driver)
    write_web("driver", driver)

    passenger.resize((256, 256), Image.Resampling.LANCZOS).save(
        assets / "_preview_passenger_icon.png"
    )
    driver.resize((256, 256), Image.Resampling.LANCZOS).save(
        assets / "_preview_driver_icon.png"
    )
    print("OK: passenger + driver icons written")


if __name__ == "__main__":
    main()
