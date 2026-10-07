#!/usr/bin/env python3
"""Plansze do App Store (iPhone 6,9", 1320x2868) z surowych zrzutów symulatora.

Użycie (z packages/mobile/store/screenshots):
    python3 frame.py                 # wszystkie wpisy z captions.json, języki pl + en-US
    python3 frame.py --only 1 3      # wybrane numery

Wejście: raw/<plik z captions.json> — zrzut z `xcrun simctl io booted screenshot` (dowolny iPhone w pionie,
najlepiej 17 Pro Max). Wyjście: out/<język>/NN.png, gotowe do wgrania w App Store Connect.
Wygląd = sygnatura marki: nagłówek w dwóch grubościach (bold + light), kropka w kurkumie, tło papier.
Wymaga Pillow (`pip3 install pillow`).
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
FONTS = HERE.parent.parent / 'assets' / 'fonts'

W, H = 1320, 2868
PAPER = (246, 244, 238)       # #F6F4EE
SLOD = (42, 35, 18)           # #2A2312
KURKUMA = (255, 190, 11)      # #FFBE0B
JASNA_KURKUMA = (255, 241, 194)

SIDE = 90                     # margines nagłówka
HEAD_TOP = 150
HEAD_MAX = 118                # startowy rozmiar nagłówka, zmniejszany aż obie linie się zmieszczą
HEAD_MIN = 72
SCREEN_W = 980                # szerokość ekranu telefonu na planszy
BEZEL = 22
PHONE_TOP = 580


def font(weight, size):
    return ImageFont.truetype(str(FONTS / f'Manrope_{weight}.ttf'), size)


def fit_headline(bold, light):
    for size in range(HEAD_MAX, HEAD_MIN - 1, -2):
        fb, fl = font('800ExtraBold', size), font('300Light', size)
        if max(fb.getlength(bold), fl.getlength(light)) <= W - 2 * SIDE:
            return fb, fl, size
    return font('800ExtraBold', HEAD_MIN), font('300Light', HEAD_MIN), HEAD_MIN


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def frame(raw_path, bold, light, out_path):
    canvas = Image.new('RGB', (W, H), PAPER)

    # Poświata kurkumy w rogu — echo kół z key visualu, bardzo delikatnie.
    # Rozmywamy samą maskę (nie kolor), inaczej przezroczysta czerń daje szarą smugę.
    glow_mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow_mask).ellipse([W - 560, -420, W + 340, 480], fill=170)
    canvas.paste(Image.new('RGB', (W, H), JASNA_KURKUMA), (0, 0), glow_mask.filter(ImageFilter.GaussianBlur(140)))

    # Nagłówek: linia 1 bold (słód), linia 2 light (słód) + kończąca kropka w kurkumie.
    d = ImageDraw.Draw(canvas)
    fb, fl, size = fit_headline(bold, light)
    line_h = int(size * 1.12)
    top = max(HEAD_TOP, (PHONE_TOP - 2 * line_h) // 2)   # nagłówek w środku pasa nad telefonem
    d.text((SIDE, top), bold, font=fb, fill=SLOD)
    y2 = top + line_h
    if light.endswith('.'):
        body = light[:-1]
        d.text((SIDE, y2), body, font=fl, fill=SLOD)
        d.text((SIDE + fl.getlength(body), y2), '.', font=fb, fill=KURKUMA)
    else:
        d.text((SIDE, y2), light, font=fl, fill=SLOD)

    # Telefon: zrzut przeskalowany do SCREEN_W, zaokrąglony, w ramce ze słodu, z ciepłym cieniem.
    shot = Image.open(raw_path).convert('RGB')
    screen_h = round(shot.height * SCREEN_W / shot.width)
    shot = shot.resize((SCREEN_W, screen_h), Image.LANCZOS)
    r_screen = round(SCREEN_W * 0.137)
    phone_w, phone_h = SCREEN_W + 2 * BEZEL, screen_h + 2 * BEZEL
    px = (W - phone_w) // 2
    py = min(PHONE_TOP, H - phone_h - 60)

    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [px, py + 36, px + phone_w, py + 36 + phone_h], radius=r_screen + BEZEL, fill=SLOD + (60,))
    shadow = shadow.filter(ImageFilter.GaussianBlur(48))
    canvas.paste(shadow, (0, 0), shadow)

    body = Image.new('RGB', (phone_w, phone_h), SLOD)
    canvas.paste(body, (px, py), rounded_mask((phone_w, phone_h), r_screen + BEZEL))
    canvas.paste(shot, (px + BEZEL, py + BEZEL), rounded_mask((SCREEN_W, screen_h), r_screen))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, 'PNG', optimize=True)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', type=int, nargs='*', help='numery plansz z captions.json')
    args = ap.parse_args()
    items = json.loads((HERE / 'captions.json').read_text(encoding='utf-8'))
    for i, item in enumerate(items, 1):
        if args.only and i not in args.only:
            continue
        raw = HERE / 'raw' / item['file']
        if not raw.exists():
            print(f'pomijam {i:02d}: brak raw/{item["file"]}')
            continue
        for lang, (bold, light) in item['headline'].items():
            print(frame(raw, bold, light, HERE / 'out' / lang / f'{i:02d}.png').relative_to(HERE))


if __name__ == '__main__':
    main()
