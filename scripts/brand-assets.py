"""Derive the brand images. Re-run after changing a source file.

  python3 scripts/brand-assets.py      (needs Pillow)

Sources
  design/banner-v2.png        the site banner (1990x1342, CST 25th Foundation Day artwork)
  design/jubilee-logo.png     the official Silver Jubilee logo (transparent background)

Outputs
  src/assets/banner-phone.webp    Live page banner on phones: the three logos, "College of Science and
                                  Technology", "Royal University of Bhutan" and "Celebrating 25th
                                  Foundation Day", ending just below the gold "25"
  src/assets/banner-wide.webp     the same on wider screens, with the full width of the artwork
  Both end above the tagline, the dates and the buildings (the roof and water tower that reach into
  the bottom corners are faded out).
  src/app/opengraph-image.jpg     1200x630 share preview, centred on the logos and title
  src/app/twitter-image.jpg       same image for Twitter / X
  src/assets/intro-emblem.webp    from design/jubilee-logo.png: the emblem for the intro animation (600 px)
  src/assets/intro-emblem-mask.webp   its shape only (200 px), which masks the intro's shimmer
  src/assets/header-logo.webp     the logo for the header plate (public and admin), 160 px: sharp at
                                  up to 53 CSS px on 3x screens, served as is (no 1x/2x-only srcset)
  Icons, all from design/jubilee-logo.png on white, so they show on dark tab strips and home screens:
  src/app/favicon.ico             16/32/48: the logo on a white rounded tile, filling it
  src/app/icon.png                512, the same tile
  src/app/apple-icon.png          180, full-bleed white (iOS rounds the corners itself)
  public/icons/icon-192.png, icon-512.png   the logo on a white circle, transparent outside
  public/icons/maskable-512.png   full-bleed white, the logo inside Android's 80% safe circle

The images under src/ are served through next/image or Next's metadata files, which
handle WebP conversion and sizing. Logos are never cropped out of the banner (too low resolution).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
BANNER = Image.open(ROOT / "design/banner-v2.png").convert("RGB")

# Regions in banner-v2.png, measured from the artwork.
# Phone: x covers "CELEBRATING ... FOUNDATION DAY" (211-1772); y from above the logos (200) to just
# below the gold "25" (ends 820). The building roof (from y 790, x < 460) and the water tower
# (from y 811, x 1654-1828) reach into the bottom corners, so those two corners are faded out.
# Measured in banner-v2.png: the logos start at y 209, the gold "25" ends at y 820 and the tagline
# "Celebrating the Past..." starts at about y 866. Both crops end at y 840: a little room below the
# "25", none of the tagline, dates or buildings (only their tops in the corners, faded out).
PHONE = (185, 180, 1805, 840)  # x: "CELEBRATING ... FOUNDATION DAY" spans 211-1772
WIDE = (0, 90, 1990, 840)  # the full width
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


phone = fade_bottom_corners(BANNER.crop(PHONE), width=0.2, height=0.1)
wide = fade_bottom_corners(BANNER.crop(WIDE), width=0.22, height=0.1)
print(f"Banner phone {phone.width}x{phone.height}, wide {wide.width}x{wide.height}: the aspect-[w/h] classes in live-banner.tsx.")
phone.save(ROOT / "src/assets/banner-phone.webp", quality=90, method=6)
wide.save(ROOT / "src/assets/banner-wide.webp", quality=90, method=6)

og = BANNER.crop(OG).resize((1200, 630), Image.LANCZOS)
og.save(ROOT / "src/app/opengraph-image.jpg", quality=85, optimize=True, progressive=True)
og.save(ROOT / "src/app/twitter-image.jpg", quality=85, optimize=True, progressive=True)

# Intro animation emblem: only from a proper logo file, never cropped from the banner.
logo_file = ROOT / "design/jubilee-logo.png"
if logo_file.exists():
    # The file already has a transparent background, so nothing is removed: the white highlights
    # in the silver "25" and the ribbon stay as they are. Only the empty margins are trimmed.
    logo = Image.open(logo_file).convert("RGBA")
    logo = logo.crop(logo.getchannel("A").getbbox())
    side = round(max(logo.size) * 1.01)  # a hair of room so antialiased edges aren't cut
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2), logo)
    # Shown at 200 CSS px in the intro: 600 px covers 3x screens, so the ring text stays sharp.
    square.resize((600, 600), Image.LANCZOS).save(ROOT / "src/assets/intro-emblem.webp", quality=88, alpha_quality=95, method=6)
    # The logo's shape only (white where opaque), small: masks the intro's shimmer to the logo.
    shape = square.getchannel("A").resize((200, 200), Image.LANCZOS)
    mask = Image.new("RGBA", shape.size, (255, 255, 255, 0))
    mask.putalpha(shape)
    mask.save(ROOT / "src/assets/intro-emblem-mask.webp", lossless=True, method=6)
    print("Intro emblem written from design/jubilee-logo.png.")
else:
    print("design/jubilee-logo.png not found: intro emblem left as it is.")

# Header plate: the logo alone, 160 px. Next serves fixed-size images at 1x and 2x only, so the
# header uses this file as is (unoptimized) to stay sharp on 3x phones.
if logo_file.exists():
    square.resize((160, 160), Image.LANCZOS).save(ROOT / "src/assets/header-logo.webp", quality=90, alpha_quality=95, method=6)

# Icons: the official logo (design/jubilee-logo.png) on white. The logo's square is `square` above;
# its ribbon tips reach 1.08x the radius of the circle inscribed in that square, so inside a circle
# the logo is drawn at most 1/1.08 of the circle's width.
assert logo_file.exists(), "design/jubilee-logo.png is needed for the icons"
WHITE = (255, 255, 255, 255)
REACH = 1.08  # how far the logo reaches beyond its inscribed circle (measured: 1.079)


def logo_at(px: int) -> Image.Image:
    """The logo square resized to px. Tiny sizes (favicon 16 and 32) get more contrast and a little
    darker, and a light sharpen: the silver "25" and ribbon are otherwise too pale on white."""
    im = square.resize((px, px), Image.LANCZOS)
    if px <= 32:
        alpha = im.getchannel("A")
        rgb = ImageEnhance.Brightness(ImageEnhance.Contrast(im.convert("RGB")).enhance(1.6)).enhance(0.85)
        im = rgb.convert("RGBA")
        im.putalpha(alpha)
    if px <= 48:
        im = im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=1))
    return im


def shape_mask(size: int, shape: str, *, inset: float = 1.0) -> Image.Image:
    """Where the icon is visible: the white shape, or a platform's crop. inset: a circle's diameter
    as a share of the icon (Android's maskable safe zone is 0.8)."""
    ss = 4
    big = size * ss
    m = Image.new("L", (big, big), 0)
    d = ImageDraw.Draw(m)
    if shape == "tile":
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * 0.18), fill=255)
    elif shape == "ios":
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * 0.2237), fill=255)
    elif shape == "circle":
        pad = big * (1 - inset) / 2
        d.ellipse((pad, pad, big - 1 - pad, big - 1 - pad), fill=255)
    else:
        d.rectangle((0, 0, big, big), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def icon(name: str, size: int, *, background: str, logo: float, crop: tuple[str, float] | None = None) -> Image.Image:
    """The logo (logo: its width as a share of the icon) on white. background: "tile" (rounded
    square), "circle" (disc, transparent outside) or "bleed" (full square, for platforms that apply
    their own mask). crop: the platform's mask to check against, if it cuts more than the background.
    Fails if any visible part of the logo would be cut off."""
    px = round(size * logo)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    layer.alpha_composite(logo_at(px), ((size - px) // 2, (size - px) // 2))
    for kind, inset in [(background, 1.0)] + ([crop] if crop else []):
        visible = shape_mask(size, kind, inset=inset).point(lambda v: 255 if v > 200 else 0)
        cut = layer.getchannel("A").point(lambda v: 255 if v > 60 else 0)
        cut = Image.composite(Image.new("L", cut.size, 0), cut, visible)
        assert cut.getbbox() is None, f"{name}: part of the logo would be cut off ({kind})"
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(WHITE, mask=shape_mask(size, background))
    out.alpha_composite(layer)
    return out


(ROOT / "public/icons").mkdir(parents=True, exist_ok=True)
# Favicon: a rounded white tile, the logo almost edge to edge (only the corners are rounded, and the
# logo's round shape keeps clear of them).
ico = {s: icon(f"favicon {s}", s, background="tile", logo=0.98 if s <= 32 else 0.96) for s in (16, 32, 48)}
ico[48].save(ROOT / "src/app/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[ico[16], ico[32]])
icon("icon.png", 512, background="tile", logo=0.96).save(ROOT / "src/app/icon.png", optimize=True)
# iOS rounds the corners (about 22% radius) itself: full-bleed white, the logo clear of that mask.
icon("apple-icon", 180, background="bleed", logo=0.94, crop=("ios", 1.0)).save(ROOT / "src/app/apple-icon.png", optimize=True)
# Manifest "any" icons: a white disc, transparent outside, the logo inside it.
for size in (192, 512):
    icon(f"icon-{size}", size, background="circle", logo=0.98 / REACH).save(ROOT / f"public/icons/icon-{size}.png", optimize=True)
# Maskable: Android may crop to a circle 80% of the width; the whole logo stays inside it.
icon("maskable", 512, background="bleed", logo=0.79 / REACH, crop=("circle", 0.8)).save(ROOT / "public/icons/maskable-512.png", optimize=True)

print("Banner, share images, header logo and icons written.")
