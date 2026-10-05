"""Derive the brand images. Re-run after changing a source file.

  python3 scripts/brand-assets.py      (needs Pillow)

Sources
  design/banner-v2.png        the site banner (1990x1342, CST 25th Foundation Day artwork)
  design/jubilee-logo.png     optional: the jubilee "25" emblem with a transparent background

Outputs
  src/assets/banner-phone.webp    Live page banner on phones: the three logos, "College of Science and
                                  Technology", "Royal University of Bhutan" and "Celebrating 25th
                                  Foundation Day"; the building and water tower trimmed
  src/assets/banner-wide.webp     Live page banner on wider screens: more of the artwork (2:1)
  src/app/opengraph-image.jpg     1200x630 share preview, centred on the logos and title
  src/app/twitter-image.jpg       same image for Twitter / X
  src/assets/intro-emblem.webp    only if design/jubilee-logo.png exists: the emblem for the intro animation
  src/app/favicon.ico             16/32/48: the "25" mark on a rounded teal tile, tuned per size
  src/app/icon.png                512, the "25" mark on full-bleed teal
  src/app/apple-icon.png          180, same (iOS rounds the corners itself)
  public/icons/icon-192.png, icon-512.png, maskable-512.png   for the web app manifest

The images under src/ are served through next/image or Next's metadata files, which
handle WebP conversion and sizing. Logos are never cropped out of the banner (too low resolution).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BANNER = Image.open(ROOT / "design/banner-v2.png").convert("RGB")

# Regions in banner-v2.png, measured from the artwork.
# Phone: x covers "CELEBRATING ... FOUNDATION DAY" (211-1772); y from above the logos (200) to just
# below the gold "25" (ends 820). The building roof (from y 790, x < 460) and the water tower
# (from y 811, x 1654-1828) reach into the bottom corners, so those two corners are faded out.
PHONE = (185, 165, 1805, 826)
WIDE = (0, 90, 1990, 1085)  # 2:1, the full width: building, road and tower included
OG = (65, 110, 1925, 1086)  # 1200x630 proportions, centred on the logos and title

(ROOT / "src/assets").mkdir(exist_ok=True)


def fade_bottom_corners(img: Image.Image, width: float, height: float) -> Image.Image:
    """Blend the bottom-left and bottom-right corners into the artwork's white edge."""
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    cw, ch = round(w * width), round(h * height)
    d.ellipse((-cw, h - ch, cw, h + ch), fill=255)
    d.ellipse((w - cw, h - ch, w + cw, h + ch), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(cw, ch) * 0.35))
    white = Image.new("RGB", (w, h), (251, 251, 250))
    return Image.composite(white, img, mask)


phone = fade_bottom_corners(BANNER.crop(PHONE), width=0.2, height=0.085)
phone.save(ROOT / "src/assets/banner-phone.webp", quality=92, method=6)
BANNER.crop(WIDE).save(ROOT / "src/assets/banner-wide.webp", quality=92, method=6)

og = BANNER.crop(OG).resize((1200, 630), Image.LANCZOS)
og.save(ROOT / "src/app/opengraph-image.jpg", quality=85, optimize=True, progressive=True)
og.save(ROOT / "src/app/twitter-image.jpg", quality=85, optimize=True, progressive=True)

# Intro animation emblem: only from a proper logo file, never cropped from the banner.
logo_file = ROOT / "design/jubilee-logo.png"
if logo_file.exists():
    logo = Image.open(logo_file).convert("RGBA")
    logo = logo.crop(logo.getbbox())
    side = max(logo.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2), logo)
    square.resize((460, 460), Image.LANCZOS).save(ROOT / "src/assets/intro-emblem.webp", quality=92, method=6)
    print("Intro emblem written from design/jubilee-logo.png.")
else:
    print("design/jubilee-logo.png not found: intro emblem left as it is.")

# Icons: the "25" mark (option A). The emblem's small text can't be read at icon sizes, so the mark
# is just "25" in our display font, in a blue-grey ring on the brand teal. Colours from globals.css.
BRAND = (0x13, 0x54, 0x63)  # --brand
ACCENT = (0x8A, 0xA9, 0xB1)  # --accent
DEEP = tuple(round(c * 0.82) for c in BRAND)  # --brand-deep (the header mark's fill)
FONT = str(ROOT / "scripts/assets/barlow-condensed-700.woff2")  # Barlow Condensed Bold, OFL


def mark(size: int, *, tile: bool, ring_diameter: float) -> Image.Image:
    """The "25" mark. tile: rounded corners (favicon); otherwise full-bleed (platforms round it).
    Tiny sizes get a thicker ring and bigger figures so they survive 16 px."""
    ss = 8
    big = size * ss
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if tile:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=big // 5, fill=BRAND + (255,))
    else:
        d.rectangle((0, 0, big, big), fill=BRAND + (255,))
    small = size <= 32
    diameter = big * ring_diameter
    pad = (big - diameter) / 2
    ring = diameter * (0.09 if small else 0.06)
    d.ellipse((pad, pad, big - pad, big - pad), fill=DEEP + (255,), outline=ACCENT + (255,), width=round(ring))
    font = ImageFont.truetype(FONT, round(diameter * (0.6 if small else 0.52)))
    d.text((big / 2, big / 2 + diameter * 0.02), "25", fill=(255, 255, 255, 255), font=font, anchor="mm")
    return im.resize((size, size), Image.LANCZOS)


(ROOT / "public/icons").mkdir(parents=True, exist_ok=True)
ico = {s: mark(s, tile=True, ring_diameter=0.88 if s <= 32 else 0.76) for s in (16, 32, 48)}
ico[48].save(ROOT / "src/app/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[ico[16], ico[32]])
mark(512, tile=False, ring_diameter=0.76).save(ROOT / "src/app/icon.png", optimize=True)
mark(180, tile=False, ring_diameter=0.76).save(ROOT / "src/app/apple-icon.png", optimize=True)
mark(192, tile=False, ring_diameter=0.76).save(ROOT / "public/icons/icon-192.png", optimize=True)
mark(512, tile=False, ring_diameter=0.76).save(ROOT / "public/icons/icon-512.png", optimize=True)
# Maskable: Android may crop to a circle of 80% of the width, so the ring stays inside that.
mark(512, tile=False, ring_diameter=0.62).save(ROOT / "public/icons/maskable-512.png", optimize=True)

print("Banner, share images and icons written.")
