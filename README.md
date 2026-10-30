# Geo Dash

Otwartoźródłowa gra platformowa w stylu Geometry Dash. **Nie wymaga Steam**, nie zawiera
żadnych plików ani assetów RobTop Games, a mody ładują się w stylu Geode.

> **Ważne:** to własna gra, nie crack ani „GD bez Steama". Oryginalny Geometry Dash
> jest płatny i sprzedawany tylko przez Steam/Google Play/App Store — ten projekt nie
> udaje jego klienta i nie łączy się z serwerami RobTopa. Ma własne serwery (patrz
> `docs/roadmap.md`), własną fizykę i własne poziomy.

## Co działa teraz (v0.1)

- Płynna fizyka kostki w 240 Hz fixed-step (niezależna od FPS): skok 2 bloki / 5,2 bloku
  długości, „hold to jump", obrót i squash.
- Jeden ukończony poziom: **Stereo Sprint** (340 bloków, potrójne kolce, schodki, jamy).
- Kolizje: prostokąty bloków + **trójkątne** hitboxy kolców (nie da się umrzeć od rogu).
- Auto-restart po śmierci, licznik prób, procent postępu, rekord, zapis w `localStorage`.
- Trzy presety jakości: `low` (słabe telefony), `medium`, `high` (bloom, parallax, cząstki).
- Renderer WebGL2 z batchingiem (~3 draw calle na klatkę) + fallback Canvas2D.
- **Loader modów w stylu Geode**: `mods/index.json` → folder moda → `mod.json` + `index.js`,
  hooki `onAttempt / onDeath / onComplete / onFrame`, własne API gry, własny storage moda.
- Dwa przykładowe mody: `practice` (respawn przy miejscu śmierci) i `rainbow-cube`.
- Powłoka natywna (Tauri 2) — to samo UI jako prawdziwa aplikacja desktopowa, bez Steam.

## Uruchomienie

```bash
npm install

npm run dev        # http://localhost:5173 (web / słabsze urządzenia)
npm test           # 18 testów: fizyka, kolizje, level design, bot, smoke test pętli gry
npm run build      # produkcyjny build do dist/
npm run validate   # spójność tauri.conf.json / package.json / manifestów modów
```

Wersja natywna (wymaga [Rust](https://rustup.rs) + zależności systemowych Tauri):

```bash
npm run desktop        # okno natywne z hot reloadem
npm run desktop:build  # instalator .msi / .dmg / .deb / .rpm / .AppImage
```

Gotowe instalatory bez lokalnego Rusta: workflow `.github/workflows/desktop.yml`
(Actions → *Desktop builds* → *Run workflow*, albo push tagu `v0.1.0` → GitHub Release z
plikami). Wersja przeglądarkowa publikuje się na Pages przez `.github/workflows/pages.yml`.
Pełna instrukcja, wymagania per system i typowe błędy: **[docs/build.md](docs/build.md)**.

Sterowanie: `Space` / `W` / `↑` / `Z`, klik lub tap. Przytrzymaj, żeby skakać po każdym
kontakcie z podłożem. `Esc` pauzuje.

## Architektura w skrócie

```
src/
  core/        czysta symulacja (bez DOM): math, level, player, world  <- testowana w Node
  render/      WebGL2 batch renderer, scena, presety jakości
  platform/    input (klawiatura/mysz/dotyk), zapis postępu
  mods/        loader + API modów w stylu Geode
  ui/          warstwa DOM (HUD, panele, toasty)
  game.ts      pętla fixed-step, kamera, integracja modów
public/mods/   instalowane mody (manifest + entry)
src-tauri/     powłoka natywna (Tauri 2): Cargo.toml, tauri.conf.json, ikony
scripts/       walidator configów + generator ikony (bez zależności)
.github/       CI (testy/build), build instalatorów, deploy na Pages
```

Symulacja nie zna renderera ani DOM-u, dzięki czemu te same testy w Node sprawdzają, czy
poziom da się przejść (test `bot can complete the level`). Testy `tests/ui.test.ts` uruchamiają
prawdziwą pętlę gry, HUD i fallback Canvas2D na własnym stubie DOM — wyłapują rozjazd między
`index.html` a `ui.ts` bez przeglądarki. Szczegóły: `docs/architecture.md`.

## Mody

Mod to folder w `public/mods/` z manifestem i entry pointem:

```
public/mods/practice/mod.json
public/mods/practice/index.js
```

```js
export default function setup(ctx) {
  ctx.hooks.onDeath(({ x }) => ctx.game.setRespawnX(Math.max(0, Math.floor(x) - 2)));
  ctx.ui.toast("practice mode on");
}
```

Pełne API i zasady: `docs/mods.md`. Mody to zaufany kod (tak jak w Geode) — loader izoluje
tylko błędy, nie intencje.

## Wydajność

| Preset | Rozdzielczość | Efekty | Cel |
| --- | --- | --- | --- |
| `low` | 0,75× | brak cząstek/trailu/bloom | stare telefony, 60 fps |
| `medium` | 1× | cząstki, trail, parallax | typowy laptop |
| `high` | 1× (DPR ≤ 2) | + glow, shake, 2 warstwy tła | desktop / Tauri |

Build gry to ~29 kB JS (10,7 kB gzip) — logika jest mała celowo, bo wąskim gardłem na
słabych urządzeniach jest fill rate, nie CPU. Preset można zmienić z menu albo chipem `HQ`
w HUD.

## Licencja

Kod: MIT (`LICENSE`). Nazwa „Geometry Dash" należy do RobTop Games; ten projekt nie jest
powiązany z RobTop Games i nie używa jego assetów ani serwerów.
