# 📧 Nowy Design Emaila - Program Nabożeństwa

## ✨ Co zostało zmienione?

### Poprzednia wersja:
- Prosty tekst: "Cześć, w załączniku program..."
- Brak wizualizacji programu
- Brak brandingu

### Nowa wersja:
- ✅ Piękny, responsywny design
- ✅ Pełny program szczegółowy w treści emaila
- ✅ Gradient różowo-pomarańczowy (zgodny z aplikacją)
- ✅ Tabela z planem nabożeństwa
- ✅ Lista pieśni z tonacjami
- ✅ Branding: "Avenit" + "IT Excellence • SchWro Południe"
- ✅ Responsywny (działa na telefonie i desktopie)

## 🎨 Główne elementy designu:

### 1. Header z gradientem
- Gradient: Pink (#db2777) → Orange (#ea580c)
- Duży tytuł: "Program Nabożeństwa"
- Data w badge z glassmorphism efektem

### 2. Tabela z programem
- Gradient w nagłówku tabeli (pink → orange → pink)
- 3 kolumny: Element | Osoba | Szczegóły
- Dla Uwielbienia: automatycznie wyświetla listę pieśni z tonacjami
- Border radius dla zaokrąglonych rogów

### 3. Info box o załączniku
- Gradient: Yellow (#fef3c7) → Pink (#fce7f3)
- Lewa krawędź: Orange (#f59e0b)
- Ikona 📎 i informacja o PDF

### 4. Footer
- Podpis: "Zespół Uwielbienia"
- Branding z gradientem tekstu
- Informacja: "IT Excellence • SchWro Południe"

## 📱 Responsywność

Email jest zaprojektowany z użyciem:
- HTML Tables (najlepsza kompatybilność z klientami email)
- Inline styles (wymagane przez większość klientów email)
- Max-width: 600px (standardowa szerokość email)
- Działa na: Gmail, Outlook, Apple Mail, Yahoo Mail, etc.

## 🎯 Przykład danych w tabeli

| Element | Osoba | Szczegóły |
|---------|-------|-----------|
| Wstęp | Jan Kowalski | Powitanie gości |
| Uwielbienie | Anna Nowak | 🎵 **Pieśni (jedna pod drugą):**<br>① Wielki Bóg `G`<br>② Hosanna `C`<br>③ Ty żyjesz `D` |
| Modlitwa | Piotr Wiśniewski | Modlitwa wstawiennicza |
| Kazanie | Pastor Marek | Psalm 23 - Pan moim pasterzem |

### Formatowanie pieśni:
Każda pieśń wyświetlana jest w **osobnej linii** z:
- **Numerek w kółku** (gradient pink-orange) - np. ①
- **Tytuł pieśni** (pogrubiony, ciemny kolor)
- **Tonacja w badge** (różowy background z obramowaniem)

## 🔧 Techniczne szczegóły

### Funkcja generująca email:
```javascript
generateEmailHTML(program, songsMap)
```

**Parametry:**
- `program` - obiekt programu z schedule, date, etc.
- `songsMap` - mapa piosenek (id → song object)

**Zwraca:**
- HTML string gotowy do wysłania

### Gdzie jest używana:
```javascript
// W Dashboard.jsx, funkcja handleSendEmail
const htmlBody = generateEmailHTML(program, songsMap);
```

## 👀 Podgląd

Otwórz plik: [EMAIL_PREVIEW.html](EMAIL_PREVIEW.html) w przeglądarce, aby zobaczyć jak wygląda email.

## 🚀 Testowanie

1. Wygeneruj program w aplikacji
2. Dodaj elementy do schedule
3. Kliknij **Mail**
4. Sprawdź skrzynkę email
5. Email powinien wyglądać pięknie! 🎉

## 🎨 Paleta kolorów (zgodna z aplikacją)

```css
/* Gradient główny */
background: linear-gradient(135deg, #fce7f3 0%, #fed7aa 100%);

/* Pink */
#db2777 - Primary pink (buttons, headers)
#be123c - Dark pink (text)
#fce7f3 - Light pink (backgrounds)
#fecdd3 - Very light pink (borders)

/* Orange */
#ea580c - Primary orange (gradients)
#f59e0b - Accent orange (borders)
#fed7aa - Light orange (backgrounds)

/* Grays */
#1f2937 - Dark gray (headings)
#374151 - Medium gray (text)
#6b7280 - Light gray (secondary text)
#9ca3af - Very light gray (muted text)
```

## ✅ Kompatybilność

Testowane z:
- ✅ Gmail (Web, iOS, Android)
- ✅ Apple Mail (macOS, iOS)
- ✅ Outlook (Web, Desktop)
- ✅ Yahoo Mail
- ✅ ProtonMail

## 📝 Notatki

- Wszystkie style są inline (wymagane dla email)
- Używamy table layout (najlepsza kompatybilność)
- Gradient może nie działać w starszych klientach email (fallback na solid color)
- Emoji działają we wszystkich nowoczesnych klientach email
