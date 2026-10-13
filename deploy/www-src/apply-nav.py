#!/usr/bin/env python3
"""Wstawia wspólną nawigację (assets/nav.css + nav.js) na wszystkie strony avenit.pl.

Uruchom z katalogu repo:  python3 deploy/www-src/apply-nav.py
Między <!-- nav:start --> a <!-- nav:end --> markup jest generowany — zmiany rób TUTAJ, nie w HTML.
Pierwsze uruchomienie zastępuje stare <nav class="nav" id="nav"> / <nav class="topnav">.
"""
import pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'static' / 'landing'
VER = '20261013'

CHEV = '<svg class="snav-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'

PL_FEATURES = [
    ('Dla służb', [
        ('/grafik-sluzb/', 'Grafik służb', 'Lider układa grafik, ludzie potwierdzają'),
        ('/check-in-dzieci/', 'Check-in dzieci', 'Bezpieczne meldowanie i odbiór dzieci'),
        ('/grupy-domowe/', 'Grupy domowe', 'Składy, spotkania, materiały i czat'),
        ('/kartoteka-czlonkow/', 'Kartoteka członków', 'Ludzie, rodziny i obecność'),
    ]),
    ('Więcej', [
        ('/funkcje/', 'Wszystkie funkcje', 'Pełny przegląd modułów Avenit'),
        ('/aplikacja-dla-zboru/', 'Dla kościołów i wspólnot', 'Jak Avenit pracuje w małym i dużym kościele'),
        ('/alternatywa-dla-planning-center/', 'Avenit a Planning Center', 'Porównanie i przejście krok po kroku'),
    ]),
]
PL_LINKS = [('/#cennik', 'Cennik'), ('/podrecznik/', 'Podręcznik'), ('/blog/', 'Blog'), ('/#faq', 'Pytania')]

EN_LINKS = [('/en/#sluzby', 'Ministries'), ('/en/#moduly', 'Modules'), ('/en/#cennik', 'Pricing'), ('/en/#faq', 'FAQ')]


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;')


def cur(href, path):
    """aria-current dla podstron (kotwice strony głównej nie są „bieżącą stroną”)."""
    if '#' in href:
        return ''
    return ' aria-current="page"' if path == href or (href != '/' and path.startswith(href)) else ''


def nav_pl(path):
    feat_active = any(path.startswith(h) for _, items in PL_FEATURES for h, _, _ in items)
    cols = ''.join(
        f'<div class="snav-col"><p class="snav-cap">{esc(cap)}</p>'
        + ''.join(f'<a href="{h}"{cur(h, path)}><strong>{esc(t)}</strong><span>{esc(d)}</span></a>' for h, t, d in items)
        + '</div>'
        for cap, items in PL_FEATURES
    )
    links = ''.join(f'<li><a class="snav-link" href="{h}"{cur(h, path)}>{esc(t)}</a></li>' for h, t in PL_LINKS)
    return f'''<!-- nav:start -->
  <header class="snav" id="snav">
    <div class="snav-in">
      <a class="snav-logo" href="/" aria-label="Avenit — strona główna"><span class="snav-mark" aria-hidden="true"></span><span class="snav-claim">Church Manager</span></a>
      <nav class="snav-menu" id="snav-menu" aria-label="Główna nawigacja">
        <ul class="snav-list">
          <li class="snav-dd"><button class="snav-link snav-dd-btn" type="button" aria-expanded="false" aria-controls="snav-funkcje"{' aria-current="true"' if feat_active else ''}>Funkcje {CHEV}</button>
            <div class="snav-panel" id="snav-funkcje">{cols}</div></li>
          {links}
        </ul>
        <div class="snav-extra"><a href="https://app.avenit.pl">Zaloguj się</a><a href="/en/" lang="en">English version</a></div>
      </nav>
      <div class="snav-side">
        <a class="snav-lang" href="/en/" lang="en" title="English version" aria-label="Switch to English">EN</a>
        <a class="snav-login" href="https://app.avenit.pl">Zaloguj się</a>
        <a class="snav-cta" href="/#kontakt" data-track="cta-nav">Umów prezentację</a>
        <button class="snav-burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="snav-menu"><i></i></button>
      </div>
    </div>
  </header>
  <!-- nav:end -->'''


def nav_en(path):
    links = ''.join(f'<li><a class="snav-link" href="{h}">{esc(t)}</a></li>' for h, t in EN_LINKS)
    return f'''<!-- nav:start -->
  <header class="snav" id="snav">
    <div class="snav-in">
      <a class="snav-logo" href="/en/" aria-label="Avenit — home"><span class="snav-mark" aria-hidden="true"></span><span class="snav-claim">Church Manager</span></a>
      <nav class="snav-menu" id="snav-menu" aria-label="Main navigation">
        <ul class="snav-list">{links}</ul>
        <div class="snav-extra"><a href="https://app.avenit.pl">Log in</a><a href="/" lang="pl">Wersja polska</a></div>
      </nav>
      <div class="snav-side">
        <a class="snav-lang" href="/" lang="pl" title="Wersja polska" aria-label="Przełącz na polski">PL</a>
        <a class="snav-login" href="https://app.avenit.pl">Log in</a>
        <a class="snav-cta" href="/en/#kontakt" data-track="cta-nav">Book a demo</a>
        <button class="snav-burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="snav-menu"><i></i></button>
      </div>
    </div>
  </header>
  <!-- nav:end -->'''


OLD = [
    re.compile(r'<!-- nav:start -->.*?<!-- nav:end -->', re.S),
    re.compile(r'<nav class="nav" id="nav".*?</nav>', re.S),
    re.compile(r'<nav class="topnav">.*?</nav>', re.S),
]


def main():
    done = 0
    for f in sorted(ROOT.rglob('*.html')):
        rel = '/' + str(f.relative_to(ROOT)).replace('index.html', '')
        if rel.startswith('/stopka'):
            continue
        html = f.read_text()
        snippet = nav_en(rel) if rel.startswith('/en/') else nav_pl(rel)
        for rx in OLD:
            if rx.search(html):
                html = rx.sub(lambda m: snippet, html, count=1)
                break
        else:
            print('BRAK NAWIGACJI:', rel)
            continue
        css = f'<link rel="stylesheet" href="/assets/nav.css?v={VER}" />'
        html = re.sub(r'\s*<link rel="stylesheet" href="/assets/nav\.css[^"]*" />', '', html)
        html = html.replace('</head>', f'  {css}\n</head>', 1)
        js = f'<script defer src="/assets/nav.js?v={VER}"></script>'
        html = re.sub(r'\s*<script defer src="/assets/nav\.js[^"]*"></script>', '', html)
        html = html.replace('</body>', f'  {js}\n</body>', 1)
        f.write_text(html)
        done += 1
    print('nawigacja na', done, 'stronach')


if __name__ == '__main__':
    main()
