"""WCAG contrast check for the palette in src/app/globals.css, light and dark.

  python3 scripts/check-contrast.py

Reads the hex tokens from :root and :root[data-theme="dark"] and checks every text/background
pair the app uses: 4.5:1 for text, 3:1 for large text and meaningful graphics (form circles,
live dot). Exits 1 if any pair fails.
"""
import re
import sys
from pathlib import Path

CSS = (Path(__file__).resolve().parent.parent / "src/app/globals.css").read_text()


def block(selector: str) -> dict[str, str]:
    m = re.search(re.escape(selector) + r"\s*\{(.*?)\n\}", CSS, re.S)
    return dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", m.group(1))) if m else {}


def rgb(h):
    h = h.lstrip("#")
    return [int(h[i : i + 2], 16) for i in (0, 2, 4)]


def lum(h):
    def ch(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = rgb(h)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


WHITE = "#ffffff"
# (foreground, background, minimum, what)
PAIRS = [
    ("text", "card", 4.5, "body text on cards"),
    ("text", "bg", 4.5, "body text on the page"),
    ("muted", "card", 4.5, "secondary text on cards"),
    ("muted", "bg", 4.5, "secondary text on the page"),
    ("brand-text", "card", 4.5, "links, headings, active tab"),
    ("brand-text", "bg", 4.5, "links and headings on the page"),
    ("accent-text", "card", 4.5, "accent-toned text on cards"),
    ("accent-text", "bg", 4.5, "accent-toned text on the page"),
    (WHITE, "brand", 4.5, "white on teal (header, buttons, active tab)"),
    ("live-text", "live", 4.5, "live chip text"),
    (WHITE, "win", 4.5, "white on green (Q badge, form win)"),
    ("win-text", "card", 4.5, "green text (Qualify)"),
    (WHITE, "form-draw", 4.5, "white on grey (form draw)"),
    (WHITE, "card-red", 4.5, "white on red (form loss)"),
    ("win", "card", 3.0, "form win circle against the card"),
    ("card-red", "card", 3.0, "form loss circle against the card"),
    ("form-draw", "card", 3.0, "form draw circle against the card"),
    ("live", "card", 2.0, "live dot (always with text)"),
]

failed = False
light = block(":root")
for name, theme in [("light", light), ("dark", {**light, **block(':root[data-theme="dark"]')})]:
    print(f"\n{name}")
    for fg, bg, need, what in PAIRS:
        a = fg if fg.startswith("#") else theme[fg]
        b = bg if bg.startswith("#") else theme[bg]
        r = ratio(a, b)
        ok = r >= need
        failed |= not ok
        print(f"  {'ok ' if ok else 'FAIL'} {r:5.2f} (needs {need})  {fg} on {bg}: {what}")

# Teal vs qualifying green: distinct hue and lightness, so a green mark never reads as brand.
def hue(h):
    import colorsys

    r, g, b = [c / 255 for c in rgb(h)]
    return colorsys.rgb_to_hls(r, g, b)


hb, lb_, _ = hue(light["brand"])
hw, lw, _ = hue(light["win"])
print(f"\nbrand vs win: hue {hb*360:.0f}° vs {hw*360:.0f}° (Δ {abs(hb-hw)*360:.0f}°), lightness {lb_:.2f} vs {lw:.2f}, contrast {ratio(light['brand'], light['win']):.2f}")
sys.exit(1 if failed else 0)
