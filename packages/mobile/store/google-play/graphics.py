#!/usr/bin/env python3
"""Grafiki do Google Play z tych samych surowych zrzutów co App Store.

Użycie (z packages/mobile/store/google-play):
    python3 graphics.py

Wejście: ../screenshots/raw/*.png (zrzuty z symulatora, patrz ../screenshots/captions.json).
Wyjście (out/, poza gitem):
    out/icon-512.png                      — ikona 512×512
    out/<język>/feature-graphic.png       — grafika promocyjna 1024×500
    out/<język>/phone-NN.png              — zrzuty telefonu 1080×1920 (9:16, limit Play to 2:1)
Pasek statusu iPhone'a (wycięcie Dynamic Island) zastępujemy androidowym — Google Play nie lubi
grafik z cudzą platformą.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
SHOTS = HERE.parent / 'screenshots'
sys.path.insert(0, str(SHOTS))
from frame import JASNA_KURKUMA, KURKUMA, PAPER, SLOD, font, rounded_mask  # noqa: E402

MOBILE = HERE.parent.parent
IOS_STATUS_BAR = 165  # wysokość paska statusu w zrzucie 1320×2868 (iPhone 17 Pro Max)


def android_status_bar(shot):
    """Zastępuje pasek statusu iOS androidowym: godzina z lewej, otwór aparatu, ikony z prawej."""
    shot = shot.copy()
    w = shot.width
    bg = shot.getpixel((8, IOS_STATUS_BAR + 6))[:3]
    d = ImageDraw.Draw(shot)
    d.rectangle([0, 0, w, IOS_STATUS_BAR], fill=bg)
    ink = SLOD if sum(bg) > 380 else (246, 244, 238)
    cy = 92
    d.text((64, cy), '9:41', font=font('600SemiBold', 50), fill=ink, anchor='lm')
    d.ellipse([w // 2 - 22, cy - 22, w // 2 + 22, cy + 22], fill=(12, 12, 12))  # otwór aparatu
    # bateria
    bx = w - 64
    d.rounded_rectangle([bx - 60, cy - 17, bx, cy + 17], radius=7, outline=ink, width=4)
    d.rounded_rectangle([bx - 54, cy - 11, bx - 14, cy + 11], radius=3, fill=ink)
    # zasięg (schodki)
    sx = bx - 96
    for i, h in enumerate((10, 18, 26, 34)):
        d.rectangle([sx - 44 + i * 12, cy + 17 - h, sx - 36 + i * 12, cy + 17], fill=ink)
    # Wi-Fi (wachlarz)
    wx, wy = sx - 96, cy + 16
    for r in (34, 23, 12):
        d.pieslice([wx - r, wy - r, wx + r, wy + r], 225, 315, fill=ink)
        if r > 12:
            rr = r - 6
            d.pieslice([wx - rr, wy - rr, wx + rr, wy + rr], 225, 315, fill=bg)
    return shot


def glow(canvas, box, blur, strength=170):
    mask = Image.new('L', canvas.size, 0)
    ImageDraw.Draw(mask).ellipse(box, fill=strength)
    canvas.paste(Image.new('RGB', canvas.size, JASNA_KURKUMA), (0, 0), mask.filter(ImageFilter.GaussianBlur(blur)))


def phone(shot, screen_w, bezel):
    """Telefon bez wycięcia (ramka ze słodu), zwraca obraz RGBA."""
    screen_h = round(shot.height * screen_w / shot.width)
    shot = shot.resize((screen_w, screen_h), Image.LANCZOS)
    r = round(screen_w * 0.11)
    pw, ph = screen_w + 2 * bezel, screen_h + 2 * bezel
    out = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    out.paste(Image.new('RGBA', (pw, ph), SLOD + (255,)), (0, 0), rounded_mask((pw, ph), r + bezel))
    out.paste(shot, (bezel, bezel), rounded_mask((screen_w, screen_h), r))
    return out


def shadowed(canvas, img, x, y, radius):
    sh = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x, y + 28, x + img.width, y + 28 + img.height], radius=radius, fill=SLOD + (60,))
    sh = sh.filter(ImageFilter.GaussianBlur(36))
    canvas.paste(sh, (0, 0), sh)
    canvas.paste(img, (x, y), img)


def headline(d, x, y, bold, light, size, max_w):
    while size > 40 and max(font('800ExtraBold', size).getlength(bold), font('300Light', size).getlength(light)) > max_w:
        size -= 2
    fb, fl = font('800ExtraBold', size), font('300Light', size)
    lh = int(size * 1.12)
    d.text((x, y), bold, font=fb, fill=SLOD)
    body = light[:-1] if light.endswith('.') else light
    d.text((x, y + lh), body, font=fl, fill=SLOD)
    if light.endswith('.'):
        d.text((x + fl.getlength(body), y + lh), '.', font=fb, fill=KURKUMA)
    return y + 2 * lh


def phone_screenshot(raw, bold, light, out):
    W, H = 1080, 1920
    c = Image.new('RGB', (W, H), PAPER)
    glow(c, [W - 460, -330, W + 260, 390], 110)
    d = ImageDraw.Draw(c)
    bottom = headline(d, 70, 120, bold, light, 92, W - 140)
    p = phone(android_status_bar(Image.open(raw).convert('RGB')), 660, 16)
    y = max(bottom + 70, H - p.height - 40)
    shadowed(c, p, (W - p.width) // 2, y, 90)
    out.parent.mkdir(parents=True, exist_ok=True)
    c.save(out, 'PNG', optimize=True)


def feature_graphic(raw, bold, light, out):
    W, H = 1024, 500
    c = Image.new('RGB', (W, H), PAPER)
    glow(c, [520, -260, 1180, 380], 90, 200)
    logo = Image.open(MOBILE / 'assets' / 'brand' / 'logo-slod.png').convert('RGBA')
    logo = logo.resize((round(logo.width * 46 / logo.height), 46), Image.LANCZOS)
    c.paste(logo, (64, 70), logo)
    d = ImageDraw.Draw(c)
    headline(d, 64, 170, bold, light, 66, 520)
    p = phone(android_status_bar(Image.open(raw).convert('RGB')), 300, 10)
    shadowed(c, p, 640, 64, 40)  # telefon wychodzi poza dolną krawędź — kadr jak w key visualu
    out.parent.mkdir(parents=True, exist_ok=True)
    c.save(out, 'PNG', optimize=True)


def main():
    items = json.loads((SHOTS / 'captions.json').read_text(encoding='utf-8'))
    out = HERE / 'out'
    out.mkdir(exist_ok=True)
    Image.open(MOBILE / 'assets' / 'icon.png').convert('RGB').resize((512, 512), Image.LANCZOS).save(out / 'icon-512.png', 'PNG', optimize=True)
    print('out/icon-512.png')
    for lang in ('pl', 'en-US'):
        first = items[0]
        feature_graphic(SHOTS / 'raw' / first['file'], *first['headline'][lang], out / lang / 'feature-graphic.png')
        print(f'out/{lang}/feature-graphic.png')
        for i, item in enumerate(items, 1):
            raw = SHOTS / 'raw' / item['file']
            if not raw.exists():
                print(f'pomijam {i:02d}: brak {raw.name}')
                continue
            phone_screenshot(raw, *item['headline'][lang], out / lang / f'phone-{i:02d}.png')
            print(f'out/{lang}/phone-{i:02d}.png')


if __name__ == '__main__':
    main()
