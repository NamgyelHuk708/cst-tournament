"""Derive every brand image from design/banner.png (2170x725). Re-run after changing the banner.

  python3 scripts/brand-assets.py      (needs Pillow and numpy)

Outputs
  src/assets/banner-hero.webp     Live page banner: emblem + title + trees, sides trimmed
  src/assets/banner-strip.webp    Slim strip shown while a match is live: emblem + "CST Silver Jubilee"
  src/assets/intro-emblem.webp    The emblem alone (circular, transparent) for the intro animation
  src/app/opengraph-image.jpg     1200x630 share preview, centred on emblem and title
  src/app/twitter-image.jpg       same image for Twitter / X
  src/app/favicon.ico             16/32/48, emblem on a maroon tile
  src/app/icon.png                512, emblem on brand maroon
  src/app/apple-icon.png          180, emblem on brand maroon
  public/icons/icon-192.png, icon-512.png, maskable-512.png   for the web app manifest

The images under src/ are served through next/image or Next's metadata files, which
handle WebP conversion and sizing.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = Image.open(ROOT / "design/banner.png").convert("RGB")
BRAND = (0x7A, 0x1F, 0x2B)

# Regions in the original banner, measured from the artwork.
HERO = (380, 15, 1870, 600)  # emblem, both title lines, mountains and trees; building and tower trimmed
EMBLEM = (950, 50, 1180, 280)  # the round 25 emblem, tight square
TITLE_LINE_1 = (711, 284, 1418, 351)  # "CST SILVER JUBILEE" in painted gold (line 2 starts at y 351)
SKY = (1250, 120, 1650, 260)  # plain watercolour sky, used as a backdrop
OG_REGION = (395, 0, 1860, 725)  # emblem, title and setting, for the share image (building trimmed)

(ROOT / "src/assets").mkdir(exist_ok=True)
(ROOT / "public/icons").mkdir(parents=True, exist_ok=True)


def emblem(size: int, inset: float = 0.0) -> Image.Image:
    """The emblem as a circle on a transparent background."""
    e = SRC.crop(EMBLEM).resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4), 0)
    pad = int(size * 4 * inset)
    ImageDraw.Draw(mask).ellipse((pad, pad, size * 4 - pad - 1, size * 4 - pad - 1), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)  # smooth edge
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(e, (0, 0), mask)
    return out


def feather(img: Image.Image, edge: int) -> Image.Image:
    """Fade the top and bottom edges so a pasted region blends into its backdrop."""
    w, h = img.size
    alpha = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(alpha)
    for i in range(edge):
        v = int(255 * i / edge)
        d.line([(0, i), (w, i)], fill=v)
        d.line([(0, h - 1 - i), (w, h - 1 - i)], fill=v)
    out = img.convert("RGBA")
    out.putalpha(alpha)
    return out


# Hero banner.
SRC.crop(HERO).save(ROOT / "src/assets/banner-hero.webp", quality=90, method=6)

# Live strip: emblem + first title line on a soft sky backdrop.
H = 180
title = SRC.crop(TITLE_LINE_1)
# Cut out just the gold lettering (soft edge), so no rectangle of the original sky shows.
px = np.asarray(title).astype(int)
gold = (px[..., 0] > 120) & (px[..., 0] - px[..., 2] > 60) & (px[..., 2] < 140)
letters = Image.fromarray((gold * 255).astype("uint8")).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
size = (round(title.width * 92 / title.height), 92)
title, letters = title.resize(size, Image.LANCZOS), letters.resize(size, Image.LANCZOS)
w = 22 + 156 + 30 + title.width + 30
strip = SRC.crop(SKY).resize((w, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(6))
strip.paste(emblem(156, 0.01), (22, (H - 156) // 2), emblem(156, 0.01))
strip.paste(title, (22 + 156 + 30, (H - title.height) // 2), letters)
strip.save(ROOT / "src/assets/banner-strip.webp", quality=90, method=6)

# Share image, 1200x630: blurred banner as backdrop, the centre region on top.
bg = SRC.resize((round(SRC.width * 630 / SRC.height), 630), Image.LANCZOS)
left = (bg.width - 1200) // 2
bg = bg.crop((left, 0, left + 1200, 630)).filter(ImageFilter.GaussianBlur(18))
region = SRC.crop(OG_REGION)
region = region.resize((1200, round(region.height * 1200 / region.width)), Image.LANCZOS)
bg.paste(region, (0, (630 - region.height) // 2), feather(region, 28).split()[3])
bg.save(ROOT / "src/app/opengraph-image.jpg", quality=85, optimize=True, progressive=True)
bg.save(ROOT / "src/app/twitter-image.jpg", quality=85, optimize=True, progressive=True)

# Intro animation: the emblem alone, circular, transparent (never recoloured or redrawn).
# 2x the source crop, so it stays smooth at ~200 px on high-density screens.
emblem(460, 0.004).save(ROOT / "src/assets/intro-emblem.webp", quality=92, method=6, lossless=False)

# Favicon: emblem on a maroon tile (bare silver vanishes on light tab bars at 16 px).
def favicon_tile(size: int) -> Image.Image:
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    radius = size // 5
    ImageDraw.Draw(tile).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BRAND + (255,))
    e = emblem(round(size * 0.92), 0.005)
    tile.paste(e, ((size - e.width) // 2, (size - e.height) // 2), e)
    return tile


favicon_tile(256).save(ROOT / "src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


def app_icon(size: int, scale: float) -> Image.Image:
    """Emblem centred on brand maroon (platforms add their own corner rounding)."""
    canvas = Image.new("RGBA", (size, size), BRAND + (255,))
    e = emblem(round(size * scale), 0.005)
    canvas.paste(e, ((size - e.width) // 2, (size - e.height) // 2), e)
    return canvas


app_icon(512, 0.84).save(ROOT / "src/app/icon.png", optimize=True)
app_icon(180, 0.84).save(ROOT / "src/app/apple-icon.png", optimize=True)
app_icon(192, 0.84).save(ROOT / "public/icons/icon-192.png", optimize=True)
app_icon(512, 0.84).save(ROOT / "public/icons/icon-512.png", optimize=True)
app_icon(512, 0.66).save(ROOT / "public/icons/maskable-512.png", optimize=True)  # inside the maskable safe zone

print("Brand assets written.")
