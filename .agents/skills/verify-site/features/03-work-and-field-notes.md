# Feature 03: Work Case Studies and Field Notes Collections

## Scope
Covers `/work/`, all 4 published case-study detail pages (`/work/<slug>/`), `/field-notes/`, and published field-note detail pages (`/field-notes/<slug>/`), including `.md` twin routes and RSS/JSON Feed discovery links.

## Preconditions
- Preview server running on `http://127.0.0.1:$PORT`.

## Steps (`1280x800` and `390x844`)
1. Open `/work/`; assert 4 `.case-card` links exist (`/work/care-provider-transformation`, `/work/debiaser-ai-product`, `/work/manufacturer-trade-portal`, `/work/fast-small-business-websites`), canonical is `https://automancer.uk/work/`, and `/work/rss.xml` and `/work/feed.json` return HTTP 200.
2. Open `/work/care-provider-transformation/`; assert `<h1>` is non-empty, canonical link is `https://automancer.uk/work/care-provider-transformation/`, and `/work/care-provider-transformation.md` returns HTTP 200.
3. Open `/field-notes/`; assert 15 non-draft `.note-row` items are listed, canonical is `https://automancer.uk/field-notes/`, and `/field-notes/rss.xml` and `/field-notes/feed.json` return HTTP 200.
4. Open `/field-notes/what-does-an-ai-agent-actually-cost/`; assert `<h1>`, `Article` JSON-LD node, and HTTP 200 on `/field-notes/what-does-an-ai-agent-actually-cost.md`.
5. Verify no horizontal overflow at `390x844` on `/work/`, `/work/care-provider-transformation/`, `/field-notes/`, and `/field-notes/what-does-an-ai-agent-actually-cost/`.

## Evidence
- `desktop-work.png`, `desktop-case-study.png`, `desktop-field-notes.png`, `desktop-field-note-article.png`, `mobile-work.png`, `mobile-field-notes.png`.
