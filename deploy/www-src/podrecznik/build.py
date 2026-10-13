#!/usr/bin/env python3
"""Generator podręcznika na avenit.pl (/podrecznik/).

Źródło treści: podrecznik.md (eksport dokumentu „Avenit — podręcznik użytkownika”).
Zrzuty: zrzuty/*.png → static/landing/podrecznik/img/*.webp (PNG nie są w repo; bez nich
skrypt zostawia istniejące WebP). Miniatury filmów: miniatury/*.png → .../img/wideo/*.webp.

Uruchom z katalogu repo:  python3 deploy/www-src/podrecznik/build.py
a potem:                  python3 deploy/www-src/apply-nav.py   (nawigacja na nowych stronach)
Linki YouTube: uzupełnij `yt` w VIDEOS i przebuduj.
"""
import html, json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parents[1] / 'static' / 'landing' / 'podrecznik'
SITE = 'https://avenit.pl'
VER = '20261013'

CHAPTERS = [
    # (numer w źródle, slug, tytuł na stronie, krótki opis do kart)
    (1, 'pierwsze-kroki', 'Pierwsze kroki', 'Logowanie, pulpit, menu, wyszukiwarka i Twój profil.'),
    (2, 'czlonkowie-i-rodziny', 'Członkowie i rodziny', 'Kartoteka osób, rodziny, obecność i opieka duszpasterska.'),
    (3, 'wydarzenia-programy-zapisy', 'Wydarzenia, programy i zapisy', 'Kalendarz kościoła, program nabożeństwa i zapisy RSVP.'),
    (4, 'sluzby-zespoly-grafik', 'Służby, zespoły i grafik', 'Skład zespołu, grafik, powiadomienia i meldowanie dzieci.'),
    (5, 'grupy-domowe', 'Grupy domowe', 'Grupy, role, materiały, wydarzenia i mapa grup.'),
    (6, 'nauczanie-i-baza-piesni', 'Nauczanie i baza pieśni', 'Grafik kazań, serie, publikacja i pieśni z akordami.'),
    (7, 'komunikacja', 'Komunikacja', 'Komunikator, rozmowy wideo, powiadomienia i kampanie.'),
    (8, 'projekty-i-zadania', 'Projekty i zadania', 'Tablice projektów, widoki, komentarze i automatyzacje.'),
    (9, 'modlitwa-formularze-pliki', 'Modlitwa, formularze i pliki', 'Ściana modlitwy, formularze zgłoszeniowe i pliki.'),
    (10, 'finanse-i-darowizny', 'Finanse i darowizny', 'Budżet, wpływy, wydatki, raporty i zbiórki.'),
    (11, 'administracja', 'Administracja', 'Użytkownicy, role i uprawnienia, wygląd i moduły.'),
    (12, 'aplikacja-mobilna', 'Aplikacja mobilna', 'Instalacja, logowanie i to, co jest w telefonie.'),
    (13, 'samouczki-wideo', 'Samouczki wideo', 'Krótkie filmy z lektorem — przeglądarka i iPhone.'),
    (14, 'faq', 'Pytania i problemy', 'Najczęstsze pytania i szybkie rozwiązania.'),
]

# Opis zrzutu (alt z dokumentu) → plik w zrzuty/
SHOTS = {
    'Ekran logowania': 's1-logowanie', 'Pulpit członka': 's1-pulpit',
    'Zaproszenia do służby w zakładce Sugestie': 's1-sugestie', 'Wyszukiwarka ⌘K': 's1-szukaj',
    'Biblioteka samouczków krok po kroku': 's1-pomoc', 'Profil: zmiana hasła i weryfikacja dwuetapowa': 's1-profil-2fa',
    'Lista członków z filtrami statusów i tagów': 's2-lista', 'Formularz nowej osoby': 's2-nowa-osoba',
    'Kartoteka osoby z opieką duszpasterską': 's2-profil', 'Rodziny z kontaktami': 's2-rodziny',
    'Zaznaczanie obecności': 's2-obecnosc', 'Wydarzenia w widoku kafelków': 's3-kafelki',
    'Szybki formularz nowego wydarzenia': 's3-nowe', 'Strona wydarzenia z zakładkami': 's3-szczegoly',
    'Widok kalendarza miesięcznego': 's3-kalendarz', 'Program nabożeństwa z pieśniami': 's3-programy',
    'Kampanie RSVP z licznikami odpowiedzi': 's3-rsvp', 'Służby i przypisane osoby': 's4-sluzby',
    'Skład zespołu': 's4-czlonkowie', 'Grafik Zespołu Uwielbienia w układzie dat': 's4-grafik',
    'Grafik nauczycieli w module Dzieci': 's4-kids', 'Karty grup domowych': 's5-grupy',
    'Członkowie wszystkich grup z rolami': 's5-czlonkowie', 'Mapa grup domowych': 's5-mapa',
    'Serie kazań': 's6-serie', 'Lista kazań ze statusem publikacji': 's6-kazania', 'Baza pieśni': 's6-piesni',
    'Pieśń z akordami i transpozycją': 's6-piesn', 'Komunikator: rozmowa grupowa zespołu': 's7-komunikator',
    'Okno nowej rozmowy': 's7-nowa', 'Lista tablic': 's8-tablice',
    'Tablica „Remont sali głównej” z grupami, statusami i budżetem': 's8-tablica', 'Ściana modlitwy': 's9-modlitwa',
    'Nowa intencja modlitewna': 's9-nowa-intencja', 'Lista formularzy': 's9-formularze',
    'Budżet roczny z realizacją': 's10-budzet', 'Wpływy z filtrami': 's10-wplywy',
    'Wydatki ze statusami akceptacji': 's10-wydatki', 'Raport finansowy roczny': 's10-raporty',
    'Przegląd darowizn': 's10-hojnosc', 'Zbiórki z paskiem postępu': 's10-zbiorki',
    'Konta użytkowników': 's11-uzytkownicy', 'Macierz uprawnień': 's11-uprawnienia',
    'Bezpieczeństwo i logowanie': 's11-bezpieczenstwo', 'Wygląd: logo i motywy': 's11-wyglad',
    'Zarządzanie modułami': 's11-moduly',
    'Aplikacja mobilna: pulpit, wydarzenia, pieśń z akordami, czat zespołu': 's12-mobile',
}

# Samouczki wideo. `yt` = identyfikator filmu na YouTube (pusty → karta „wkrótce”).
VIDEOS = [
    ('Przeglądarka', [
        ('01-pierwsze-kroki', 'Pierwsze kroki: logowanie, pulpit i menu', '2:01', 1, ''),
        ('02-nowe-wydarzenie', 'Nowe wydarzenie i zapisy', '2:50', 3, ''),
        ('03-program-nabozenstwa', 'Program nabożeństwa z pieśniami', '3:01', 3, ''),
        ('04-grafik-sluzby', 'Grafik służby: lider układa, zespół potwierdza', '3:09', 4, ''),
        ('05-czlonkowie-i-rodziny', 'Członkowie, rodziny i obecność', '3:03', 2, ''),
        ('06-komunikator', 'Komunikator: wzmianki, ankiety i reakcje', '2:41', 7, ''),
        ('07-sciana-modlitwy', 'Ściana modlitwy w minutę', '1:22', 9, ''),
        ('08-finanse', 'Finanse: budżet, wpływy, wydatki i raporty', '3:06', 10, ''),
    ]),
    ('iPhone', [
        ('ios-01-pierwsze-kroki', 'Pierwsze kroki w aplikacji na iPhone', '6:11', 12, ''),
        ('ios-02-moja-sluzba', 'Moja służba: zaproszenia, pieśni, nieobecności', '6:00', 4, ''),
        ('ios-03-wydarzenia-i-zapisy', 'Wydarzenia i zapisy', '4:24', 3, ''),
        ('ios-04-komunikator', 'Komunikator w telefonie', '4:22', 7, ''),
        ('ios-05-sciana-modlitwy', 'Ściana modlitwy', '2:23', 9, ''),
        ('ios-06-grupy-domowe', 'Grupy domowe', '4:07', 5, ''),
        ('ios-07-lider-zespolu', 'Lider zespołu: grafik i baza pieśni', '6:24', 4, ''),
    ]),
]

# Szybkie odpowiedzi na stronie głównej podręcznika: (pytanie, rozdział, kotwica)
QUICK = [
    ('Jak przyjąć albo odrzucić zaproszenie do służby?', 1, 'pulpit'),
    ('Jak ułożyć grafik i powiadomić zespół?', 4, 'ulozenie-grafiku'),
    ('Jak dodać wydarzenie i włączyć zapisy?', 3, 'nowe-wydarzenie'),
    ('Jak przygotować program nabożeństwa?', 3, 'program-nabozenstwa'),
    ('Jak dodać osobę i rodzinę?', 2, 'dodanie-osoby'),
    ('Jak włączyć weryfikację dwuetapową?', 1, 'moj-profil-i-bezpieczenstwo'),
    ('Jak zaksięgować wpływ albo wydatek?', 10, 'wplywy'),
    ('Jak nadać komuś uprawnienia?', 11, 'role-i-uprawnienia'),
]

E = html.escape


def slugify(s):
    tr = str.maketrans('ąćęłńóśźżĄĆĘŁŃÓŚŹŻ', 'acelnoszzACELNOSZZ')
    s = s.translate(tr).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def inline(s):
    s = E(s, quote=False).replace('&amp;#91;', '[').replace('\\]', ']')
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', s)
    s = re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', r'<a href="\2">\1</a>', s)
    return s


def figure(alt):
    name = SHOTS[alt]
    return (f'<figure class="pd-shot"><button class="pd-zoom" type="button" aria-label="Powiększ: {E(alt)}">'
            f'<img src="/podrecznik/img/{name}-1200.webp" srcset="/podrecznik/img/{name}-1200.webp 1200w, /podrecznik/img/{name}-2000.webp 2000w" '
            f'sizes="(max-width: 900px) 100vw, 760px" width="1200" height="{SHOT_H.get(name, 750)}" alt="{E(alt)}" loading="lazy" decoding="async" />'
            f'</button><figcaption>{E(alt)}</figcaption></figure>')


def blocks_to_html(lines, toc):
    out, i = [], 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1; continue
        m = re.match(r'&#91;image: (.+?)\\\]$', ln.strip())
        if m:
            out.append(figure(m.group(1))); i += 1; continue
        if ln.startswith('### '):
            t = ln[4:].strip(); a = slugify(t); toc.append((a, t))
            out.append(f'<h2 id="{a}"><a href="#{a}">{inline(t)}</a></h2>'); i += 1; continue
        if ln.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')]); i += 1
            head, body = rows[0], [r for r in rows[2:]]
            out.append('<div class="pd-table"><table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead><tbody>'
                       + ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body) + '</tbody></table></div>')
            continue
        if re.match(r'(\d+\.|-) ', ln):
            ordered = ln[0].isdigit(); items = []
            while i < len(lines) and re.match(r'(\d+\.|-) ', lines[i]):
                items.append(re.sub(r'^(\d+\.|-) ', '', lines[i])); i += 1
            tag = 'ol' if ordered else 'ul'
            out.append(f'<{tag} class="pd-{"steps" if ordered else "list"}">' + ''.join(f'<li>{inline(x)}</li>' for x in items) + f'</{tag}>')
            continue
        para = [ln]; i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'(### |\||&#91;image|(\d+\.|-) )', lines[i]):
            para.append(lines[i]); i += 1
        txt = ' '.join(p.strip() for p in para)
        cls = ' class="pd-note"' if re.match(r'\*\*[^*]+[:?.]\*\*', txt) else ''
        out.append(f'<p{cls}>{inline(txt)}</p>')
    return '\n'.join(out)


def parse():
    src = (HERE / 'podrecznik.md').read_text()
    parts = re.split(r'^## ', src, flags=re.M)
    intro = parts[1]  # „Wstęp”
    chapters = {}
    for p in parts[2:]:
        head, _, body = p.partition('\n')
        n = int(head.split('.')[0])
        chapters[n] = (head.split('. ', 1)[1].strip(), body.strip('\n').split('\n'))
    return intro, chapters


SHOT_H = {}


def build_images():
    try:
        from PIL import Image
    except ImportError:
        return
    img_dir = OUT / 'img'; img_dir.mkdir(parents=True, exist_ok=True)
    for png in sorted((HERE / 'zrzuty').glob('*.png')):
        im = Image.open(png).convert('RGB')
        for w in (1200, 2000):
            h = round(im.height * w / im.width)
            target = img_dir / f'{png.stem}-{w}.webp'
            if not target.exists() or target.stat().st_mtime < png.stat().st_mtime:
                im.resize((w, h), Image.LANCZOS).save(target, 'WEBP', quality=80, method=6)
    vid = img_dir / 'wideo'; vid.mkdir(exist_ok=True)
    for png in sorted((HERE / 'miniatury').glob('*.png')):
        target = vid / f'{png.stem}.webp'
        if not target.exists() or target.stat().st_mtime < png.stat().st_mtime:
            im = Image.open(png).convert('RGB')
            im.resize((640, round(im.height * 640 / im.width)), Image.LANCZOS).save(target, 'WEBP', quality=82, method=6)


def read_heights():
    try:
        from PIL import Image
        for f in (OUT / 'img').glob('*-1200.webp'):
            SHOT_H[f.stem[:-5]] = Image.open(f).height
    except Exception:
        pass


def page(title, desc, path, body, crumbs, extra_head=''):
    ld = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': SITE + u} for i, (n, u) in enumerate(crumbs)]}
    return f'''<!doctype html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{E(title)}</title>
  <meta name="description" content="{E(desc)}" />
  <link rel="canonical" href="{SITE}{path}" />
  <meta property="og:title" content="{E(title)}" />
  <meta property="og:description" content="{E(desc)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{SITE}{path}" />
  <meta property="og:image" content="{SITE}/assets/brand/og-pl.png" />
  <meta property="og:locale" content="pl_PL" />
  <link rel="icon" type="image/png" sizes="64x64" href="/assets/brand/favicon-64.png" />
  <link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png" />
  <meta name="theme-color" content="#F6F4EE" />
  <link rel="stylesheet" href="/assets/site.css?v={VER}" />
  <link rel="stylesheet" href="/assets/podrecznik.css?v={VER}" />
  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>{extra_head}
</head>
<body class="pd">
  <!-- nav:start --><nav class="topnav"></nav><!-- nav:end -->

{body}

  <footer class="site">
    <div class="inner">
      <span>© 2026 Avenit — system do zarządzania kościołem</span>
      <span>
        <a href="/">Strona główna</a><a href="/podrecznik/">Podręcznik</a><a href="/polityka-prywatnosci/">Polityka prywatności</a><a href="https://app.avenit.pl">Logowanie</a>
      </span>
    </div>
  </footer>
  <dialog class="pd-lightbox" id="pd-lightbox" aria-label="Powiększony zrzut ekranu"><button class="pd-lb-close" type="button" aria-label="Zamknij">×</button><img alt="" /></dialog>
  <script defer src="/a.js"></script>
  <script defer src="/assets/podrecznik.js?v={VER}"></script>
</body>
</html>
'''


def sidebar(active):
    items = ''.join(
        f'<li><a href="/podrecznik/{slug}/"{" aria-current=page" if n == active else ""}><span class="pd-n">{n:02d}</span>{E(t)}</a></li>'
        for n, slug, t, _ in CHAPTERS)
    return (f'<aside class="pd-side"><details class="pd-chapters" open><summary>Rozdziały</summary>'
            f'<p class="pd-side-cap"><a href="/podrecznik/">Podręcznik Avenit</a></p><ol>{items}</ol></details></aside>')


def video_cards(only_chapter=None):
    html_out = []
    for group, items in VIDEOS:
        cards = []
        for file, title, dur, ch, yt in items:
            if only_chapter and ch != only_chapter:
                continue
            thumb = f'/podrecznik/img/wideo/{file}.webp'
            inner = (f'<span class="pd-vthumb"><img src="{thumb}" alt="" loading="lazy" width="640" height="360" />'
                     f'<span class="pd-vdur">{dur}</span>{"" if yt else "<span class=pd-vsoon>Wkrótce</span>"}</span>'
                     f'<span class="pd-vmeta"><span class="pd-vgroup">{E(group)}</span><strong>{E(title)}</strong></span>')
            if yt:
                cards.append(f'<a class="pd-video" href="https://www.youtube.com/watch?v={E(yt)}" target="_blank" rel="noopener">{inner}</a>')
            else:
                cards.append(f'<div class="pd-video is-soon">{inner}</div>')
        if cards:
            html_out.append((group, ''.join(cards)))
    return html_out


def chapter_page(idx, intro_unused, chapters):
    n, slug, title, short = CHAPTERS[idx]
    src_title, lines = chapters[n]
    toc = []
    if n == 13:
        lead = 'Krótkie filmy z lektorem pokazują najważniejsze zadania krok po kroku — w przeglądarce i w aplikacji na iPhone. Wszystkie nagrano na przykładowym kościele z fikcyjnymi danymi.'
        groups = video_cards()
        content = ''.join(f'<h2 id="{slugify(g)}">{E(g)}</h2><div class="pd-videos">{c}</div>' for g, c in groups)
        toc = [(slugify(g), g) for g, _ in groups]
    elif n == 14:
        lead = 'Najczęstsze pytania użytkowników i szybkie rozwiązania. Nie ma tu Twojego? Napisz do nas albo zajrzyj do menu Pomoc w aplikacji.'
        content = blocks_to_html(lines, toc)
    else:
        # pierwszy akapit = lead
        first = next(i for i, l in enumerate(lines) if l.strip())
        lead_lines = []
        j = first
        while j < len(lines) and lines[j].strip():
            lead_lines.append(lines[j]); j += 1
        lead = ' '.join(lead_lines)
        content = blocks_to_html(lines[j:], toc)
        vids = video_cards(only_chapter=n)
        if vids:
            content += '<h2 id="wideo">Zobacz na filmie</h2>' + ''.join(f'<div class="pd-videos">{c}</div>' for _, c in vids)
            toc.append(('wideo', 'Zobacz na filmie'))
    prev = CHAPTERS[idx - 1] if idx > 0 else None
    nxt = CHAPTERS[idx + 1] if idx + 1 < len(CHAPTERS) else None
    pager = '<nav class="pd-pager" aria-label="Poprzedni i następny rozdział">'
    pager += (f'<a class="pd-prev" href="/podrecznik/{prev[1]}/"><span>← Poprzedni</span><strong>{E(prev[2])}</strong></a>' if prev else '<span></span>')
    pager += (f'<a class="pd-next" href="/podrecznik/{nxt[1]}/"><span>Następny →</span><strong>{E(nxt[2])}</strong></a>' if nxt else '<span></span>')
    pager += '</nav>'
    onpage = ''
    if len(toc) > 1:
        onpage = '<nav class="pd-onpage" aria-label="Na tej stronie"><p>Na tej stronie</p><ul>' + ''.join(f'<li><a href="#{a}">{inline(t)}</a></li>' for a, t in toc) + '</ul></nav>'
    body = f'''  <div class="pd-layout">
    {sidebar(n)}
    <main class="pd-main">
      <nav class="breadcrumb"><a href="/podrecznik/">Podręcznik</a> › {E(title)}</nav>
      <p class="pd-kicker">Rozdział {n:02d}</p>
      <h1>{E(title)}<span class="pt">.</span></h1>
      <p class="lead">{inline(lead)}</p>
      {onpage}
      <article class="pd-article">
{content}
      </article>
      {pager}
      <section class="cta-box"><h2>Chcesz zobaczyć Avenit na żywo?</h2><p>Pokażemy, jak to wygląda w Twoim kościele — w przeglądarce i w telefonie. Bez zobowiązań.</p><a class="btn-primary" href="/#kontakt" data-track="cta-podrecznik">Umów prezentację</a></section>
    </main>
  </div>'''
    path = f'/podrecznik/{slug}/'
    desc = f'{title} — podręcznik Avenit. {short}'
    return path, page(f'{title} — podręcznik Avenit', desc, path, body,
                      [('Avenit', '/'), ('Podręcznik', '/podrecznik/'), (title, path)])


def hub_page(intro):
    lines = intro.split('\n')[1:]
    paras = [l for l in lines if l.strip() and not l.startswith('|') and not l.startswith('Oct ')]
    lead = paras[0]
    table_lines = [l for l in lines if l.startswith('|')]
    roles = blocks_to_html(table_lines, [])
    cards = ''.join(
        f'<a class="pd-card" href="/podrecznik/{slug}/"><span class="pd-card-n">{n:02d}</span><strong>{E(t)}</strong><span>{E(d)}</span></a>'
        for n, slug, t, d in CHAPTERS)
    quick = ''.join(
        f'<li><a href="/podrecznik/{CHAPTERS[ch - 1][1]}/#{a}">{E(q)}</a></li>' for q, ch, a in QUICK)
    vids = video_cards()
    vstrip = ''.join(c for _, c in vids)
    body = f'''  <main class="pd-hub">
    <header class="pd-hero">
      <p class="pd-kicker">Podręcznik użytkownika</p>
      <h1><span class="b">Avenit</span><span class="l">krok po kroku<span class="pt">.</span></span></h1>
      <p class="lead">{inline(lead)}</p>
      <div class="pd-hero-meta"><span>14 rozdziałów</span><span>47 zrzutów ekranu</span><span>15 filmów</span></div>
    </header>

    <section class="pd-sec" aria-labelledby="pd-quick-h">
      <h2 id="pd-quick-h" class="pd-sec-h">Najczęstsze pytania</h2>
      <ul class="pd-quick">{quick}</ul>
    </section>

    <section class="pd-sec" aria-labelledby="pd-ch-h">
      <h2 id="pd-ch-h" class="pd-sec-h">Rozdziały</h2>
      <div class="pd-cards">{cards}</div>
    </section>

    <section class="pd-sec" aria-labelledby="pd-roles-h">
      <h2 id="pd-roles-h" class="pd-sec-h">Kto co widzi</h2>
      <p class="pd-sec-lead">Menu i przyciski zależą od roli konta. Przy każdym procesie w podręczniku zaznaczamy, kto ma do niego dostęp.</p>
      {roles}
    </section>

    <section class="pd-sec" aria-labelledby="pd-vid-h">
      <div class="pd-sec-top"><h2 id="pd-vid-h" class="pd-sec-h">Samouczki wideo</h2><a class="pd-more" href="/podrecznik/samouczki-wideo/">Wszystkie filmy →</a></div>
      <div class="pd-videos pd-videos-strip">{vstrip}</div>
    </section>

    <p class="pd-disclaimer">Zrzuty ekranu i filmy pochodzą z kościoła demonstracyjnego z fikcyjnymi danymi. Twoja aplikacja może wyglądać nieco inaczej, jeśli administrator zmienił motyw, logo lub włączone moduły.</p>

    <section class="cta-box"><h2>Wolisz, żeby ktoś Ci to pokazał?</h2><p>Na prezentacji przejdziemy przez Avenit na przykładzie Twojego kościoła i odpowiemy na pytania.</p><a class="btn-primary" href="/#kontakt" data-track="cta-podrecznik-hub">Umów prezentację</a></section>
  </main>'''
    return '/podrecznik/', page('Podręcznik użytkownika Avenit — krok po kroku', 'Podręcznik Avenit: logowanie, pulpit, członkowie, wydarzenia, grafik służb, grupy domowe, komunikacja, finanse i aplikacja mobilna. Zrzuty ekranu i filmy krok po kroku.', '/podrecznik/', body, [('Avenit', '/'), ('Podręcznik', '/podrecznik/')])


def main():
    build_images()
    read_heights()
    intro, chapters = parse()
    missing = [a for n, (t, ls) in chapters.items() for l in ls for a in re.findall(r'&#91;image: (.+?)\\\]', l) if a not in SHOTS]
    assert not missing, missing
    pages = [hub_page(intro)] + [chapter_page(i, intro, chapters) for i in range(len(CHAPTERS))]
    for path, doc in pages:
        f = OUT / path.strip('/').replace('podrecznik', '', 1).strip('/') / 'index.html'
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(doc)
    print('stron:', len(pages))
    import importlib.util
    spec = importlib.util.spec_from_file_location('apply_nav', HERE.parent / 'apply-nav.py')
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); mod.main()


if __name__ == '__main__':
    main()
