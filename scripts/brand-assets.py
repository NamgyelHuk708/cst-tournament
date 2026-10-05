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

The images under src/ are served through next/image or Next's metadata files, which
handle WebP conversion and sizing. Logos are never cropped out of the banner (too low resolution).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

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

print("Banner and share images written.")
