# Kompilacja i wydanie

Trzy niezależne cele: **web** (najszybciej), **desktop** (Tauri 2) i **CI** (instalatory bez
lokalnego Rusta). Poniżej wszystko, co jest potrzebne, żeby każdy z nich zbudować od zera.

## 0. Wymagania

| Cel | Potrzebne |
| --- | --- |
| web + testy | Node.js **≥ 22.6** (testy używają `--experimental-strip-types`) + npm |
| desktop | Node.js + **Rust** (rustup) + zależności systemowe per OS (niżej) |
| CI | tylko konto GitHub (Actions same instalują Rusta i biblioteki) |

```bash
git clone https://github.com/brzoskabartlomiej-cpu/geometry-dash-GEODE.git
cd geometry-dash-GEODE
npm install
```

## 1. Web / przeglądarka

```bash
npm run dev        # dev server + hot reload: http://localhost:5173
npm run typecheck  # sam TypeScript
npm test           # 18 testów w Node (fizyka, kolizje, level design, bot, pętla gry)
npm run build      # typecheck + produkcyjny build do dist/
npm run preview    # serwuje gotowy dist/ na http://localhost:4173
node scripts/validate-configs.mjs   # spójność tauri.conf.json / package.json / modów
```

`dist/` to zwykłe pliki statyczne:

```
dist/index.html
dist/assets/index-<hash>.js      ~29 kB (10,7 kB gzip)
dist/assets/index-<hash>.css     ~5 kB
dist/mods/…                      mody (manifesty + entry)
```

Można to wrzucić na GitHub Pages, Netlify, nginx, cokolwiek. `base` w `vite.config.ts` jest
ustawione na `"./"`, więc build działa też z podkatalogu (np. `/<repo>/` na Pages).

## 2. Desktop (Tauri 2) — pełny build natywny

### 2.1 Rust

```bash
# Linux / macOS
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Windows: instalator z https://rustup.rs (wybierz toolchain MSVC)
```

### 2.2 Zależności systemowe

```bash
# Debian / Ubuntu (Tauri 2 wymaga webkit2gtk-4.1)
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Arch
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg xdotool

# Fedora
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel && sudo dnf group install "c-development"

# macOS
xcode-select --install

# Windows (PowerShell): WebView2 + "Desktop development with C++" w VS Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools
# WebView2 jest w Win11; na Win10: https://developer.microsoft.com/microsoft-edge/webview2/
```

### 2.3 Build

```bash
npm run desktop         # okno natywne + hot reload (tauri dev)
npm run desktop:build   # build + instalatory (tauri build)
```

`desktop:build` sam uruchamia `npm run build` (`beforeBuildCommand`) i pakuje `dist/`.

Gotowe pliki:

| System | Ścieżka |
| --- | --- |
| Windows | `src-tauri/target/release/bundle/msi/*.msi`, `.../nsis/*.exe` |
| macOS | `src-tauri/target/release/bundle/dmg/*.dmg`, `.../macos/*.app` |
| Linux | `src-tauri/target/release/bundle/deb/*.deb`, `rpm/*.rpm`, `appimage/*.AppImage` |

Szybki build bez instalatorów (tylko binarka): `npx tauri build --no-bundle`.

### 2.4 Ikony

Ikony są w repo. Jeśli zmieniasz logo:

```bash
npm run make-icon   # generuje assets/icon.png (1024×1024, czysty Python, bez zależności)
npm run icons       # npx tauri icon -> src-tauri/icons/* (ico, icns, png, Windows Store)
```

### 2.5 Podpisywanie (opcjonalne, ale bez tego systemy ostrzegają)

- **Windows**: certyfikat Authenticode + `bundle.windows.certificateThumbprint` /
  `signCommand` w `tauri.conf.json`. Bez tego SmartScreen pokazuje ostrzeżenie.
  MSI wymaga włączonego VBSCRIPT (Settings → Apps → Optional features), domyślnie jest.
- **macOS**: Developer ID + notaryzacja (`APPLE_CERTIFICATE`, `APPLE_ID`,
  `APPLE_TEAM_ID` w środowisku). Bez tego: `xattr -dr com.apple.quarantine "Geo Dash.app"`.
- **Linux**: podpis nie jest wymagany; AppImage potrzebuje FUSE (`libfuse2`).

## 3. CI na GitHubie (bez lokalnego Rusta)

Trzy workflowy w `.github/workflows/`:

| Plik | Kiedy | Co robi |
| --- | --- | --- |
| `ci.yml` | push na `main`, każdy PR | walidacja configów, typecheck, testy, build web, artefakt `web-dist` |
| `desktop.yml` | ręcznie (Actions → Run workflow) lub tag `v*` | buduje instalatory na Linux/Windows/macOS; na tagu tworzy GitHub Release z plikami |
| `pages.yml` | push na `main` / ręcznie | publikuje grę na GitHub Pages |

Wydanie wersji:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

→ Actions zbudują `.msi`/`.exe`, `.dmg` (universal: Intel + Apple Silicon), `.deb`/`.rpm`/
`.AppImage` i dołączą je do release'u. Bez tagu workflow tworzy tylko artefakty do pobrania
(Actions → wybrany run → Artifacts).

**Pages**: jednorazowo włącz `Settings → Pages → Source: GitHub Actions`. Gra będzie pod
`https://<user>.github.io/geometry-dash-GEODE/`.

Uwaga: workflowy są sprawdzone składniowo i oparte na standardowych akcjach, ale nie były
uruchamiane w tym środowisku (brak runnerów GitHub Actions) — pierwszy run może wymagać
drobnych poprawek wersji akcji.

## 4. Typowe problemy

| Objaw | Przyczyna / rozwiązanie |
| --- | --- |
| `node: bad option: --experimental-strip-types` | Node < 22.6 → podbij Node (`nvm install 22`) |
| `linker 'cc' not found` / `link.exe not found` | brak kompilatora C (build-essential / VS C++ Build Tools), nie Rusta |
| `webkit2gtk-4.1 not found` | Tauri 2 wymaga `libwebkit2gtk-4.1-dev` (Ubuntu 22.04+) |
| `failed to run light.exe` (Windows, MSI) | włącz opcjonalny VBSCRIPT w Windows |
| AppImage nie startuje | `sudo apt install libfuse2` |
| macOS „app is damaged” | build niepodpisany: `xattr -dr com.apple.quarantine "Geo Dash.app"` |
| PowerShell: `npm.ps1 cannot be loaded because running scripts is disabled` | Execution Policy blokuje `npm.ps1`. Doraźnie: `npm.cmd install`. Na stałe: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (potem nowy terminal) |
| PowerShell: `npm : The term 'npm' is not recognized` | brak shimów npm w PATH: sprawdź `where.exe npm`, `Test-Path "C:\Program Files\nodejs\npm.cmd"`; wersja Node ze Microsoft Store bywa okrojona → instalator `.msi` z nodejs.org |
| `npm ci` fails | `package-lock.json` musi być aktualny: `npm install` i commit locka |
| Cross-kompilacja z Linuksa na Windows | nie wspierana „za darmo”; użyj `desktop.yml` w Actions |

## 5. Definicja „gotowe do wydania”

```bash
npm ci
node scripts/validate-configs.mjs
npm run typecheck
npm test
npm run build
npx tauri build          # na docelowym systemie
```
