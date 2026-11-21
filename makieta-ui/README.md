# Makieta UI – Asystent Wodny

Makiety ekranów prototypu (dane przykładowe). Źródła pochodzą z płótna projektowego Claude
(format „Design Component”, `*.dc.html`). Podgląd interaktywny jest na płótnie (link prywatny, do udostępnienia z menu Share):
https://claude.ai/artifact/2tUQXFa1nDSjY9DuoSJa9t

| Plik | Ekran |
|---|---|
| `Main.dc.html` | 1 · Start: działka i dzień (uprawa wykrywana automatycznie), panel gospodarstwa, postęp analizy |
| `Raport.dc.html` | 2 · Wynik: co czeka działkę, mapa z widokami (plan / gdzie sucho / teren / gleba), „co zrobić i gdzie” z „co zyskasz”, ryzyko bez działań / z planem; wariant listopad / lipiec (prop `termin`) |
| `Mobile.dc.html` | 3 · Telefon w polu |
| `Pdf.dc.html` | 4 · Raport PDF, A4 |
| `canvas.json` | układ płótna i notatki z uzasadnieniem projektu |

Pliki `.dc.html` wymagają środowiska płótna (`support.js`), więc otwarte bezpośrednio w przeglądarce nie wyrenderują się.
Służą jako specyfikacja UI: układ, teksty, kolory i interakcje (stan, kliknięcia) są w kodzie każdego pliku.

Logika, którą makieta ilustruje: [../pipeline_plan.md](../pipeline_plan.md).

**Celowa różnica względem `Raport.dc.html` (decyzja 21.11.2026, [../TODO_LUKI.md](../TODO_LUKI.md) L4):** kolejność sekcji
raportu w aplikacji idzie za strukturą zadania KOWR (3.3 pkt 4–5): stan na dzień D → jak często brakowało wody w 10 sezonach
i przyczyny → plan na działce → scenariusze „jak bywało” → uzasadnienie. Nagłówek opisuje stan w dniu analizy, a nie scenariusz
na przyszły sezon. Komponenty i wygląd są jak w makiecie. Nie przywracać kolejności z makiety.
