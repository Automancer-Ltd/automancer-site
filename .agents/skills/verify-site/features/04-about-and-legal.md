# Feature 04: About Page, Legal Pages, and Zero First-Party Browser Storage

## Scope
Covers `/about/`, `/privacy/`, and `/terms/`, company registration details (`Automancer Ltd`, `17060907`), the `legalNoMirror` policy on legal pages, and runtime verification that zero first-party browser storage is written.

## Preconditions
- Preview server running on `http://127.0.0.1:$PORT`.

## Steps (`1280x800` and `390x844`)
1. Open `/about/`; assert `<h1>`, founder details (`Waseem`), company number `17060907`, and HTTP 200 on `/about.md`.
2. Open `/privacy/`; assert visible `"23 August 2026"` last-updated date, company number `17060907`, and HTTP 404 on `/privacy.md` (`legalNoMirror` policy).
3. Open `/terms/`; assert visible `"3 July 2026"` last-updated date, company number `17060907`, and HTTP 404 on `/terms.md` (`legalNoMirror` policy).
4. On every visited page, evaluate `localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === ""` in the browser to confirm zero first-party browser storage.

## Evidence
- `desktop-about.png`, `desktop-privacy.png`, `desktop-terms.png`, `mobile-about.png`, `mobile-privacy.png`, `mobile-terms.png`.
