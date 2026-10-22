#!/usr/bin/env bash
# verify-local.sh — Build/serve automancer-site locally and drive all 6 feature-map
# journeys in agent-browser at desktop (1280x800) and mobile (390x844) widths.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"

EVIDENCE_DIR="${EVIDENCE_DIR:-/tmp/verify-site-evidence}"
mkdir -p "$EVIDENCE_DIR"

SESSION="verify-site-$$"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
BASE_URL="http://127.0.0.1:$PORT"
PREVIEW_PID=""

cleanup() {
  local code=$?
  agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
  if [[ -n "$PREVIEW_PID" ]]; then
    pkill -P "$PREVIEW_PID" >/dev/null 2>&1 || true
    kill "$PREVIEW_PID" >/dev/null 2>&1 || true
    wait "$PREVIEW_PID" >/dev/null 2>&1 || true
  fi
  fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
  for _ in $(seq 1 10); do
    if ! ss -tln 2>/dev/null | grep -q ":$PORT "; then
      break
    fi
    sleep 0.2
  done
  if ss -tln 2>/dev/null | grep -q ":$PORT "; then
    echo "WARNING: port $PORT still listening after cleanup" >&2
  fi
  exit "$code"
}
trap cleanup EXIT INT TERM

echo "[1/5] Launch: ensuring production build in dist/..."
if [[ "${SKIP_BUILD:-0}" != "1" || ! -f "$ROOT/dist/index.html" ]]; then
  if command -v checkq >/dev/null 2>&1; then
    checkq -- pnpm run build
  else
    pnpm run build
  fi
fi

"$ROOT/node_modules/.bin/astro" preview --host 127.0.0.1 --port "$PORT" >"$EVIDENCE_DIR/preview.log" 2>&1 &
PREVIEW_PID=$!

echo "[2/5] Doctor: checking dependencies, dist/, preview port $PORT, and agent-browser..."
for bin in agent-browser curl jq python3; do
  command -v "$bin" >/dev/null 2>&1 || { echo "Missing required binary: $bin" >&2; exit 1; }
done
[[ -f "$ROOT/dist/index.html" && -f "$ROOT/dist/agent.json" ]] || {
  echo "dist/index.html or dist/agent.json missing" >&2
  exit 1
}

ready=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "$BASE_URL/" 2>/dev/null && curl -fsS -o /dev/null "$BASE_URL/agent.json" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.5
done
[[ "$ready" -eq 1 ]] || { echo "Preview server on $BASE_URL failed to become ready" >&2; exit 1; }

ab() {
  agent-browser --session "$SESSION" "$@"
}

ab_eval() {
  ab eval "$1" --json | jq -r '.data.result'
}

assert_eq() {
  local actual="$1" expected="$2" msg="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "ASSERTION FAILED ($msg): expected '$expected', got '$actual'" >&2
    exit 1
  fi
}

echo "[3/5] Drive (Desktop 1280x800): exercising features 01–06..."
ab set viewport 1280 800 >/dev/null

# Feature 01: Home & Navigation
ab open "$BASE_URL/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-home.png" >/dev/null

home_checks="$(ab_eval 'JSON.stringify({
  h1Count: document.querySelectorAll("h1").length,
  rungCount: document.querySelectorAll(".rung").length,
  proofStrip: Boolean(document.querySelector(".proof-strip")),
  canonical: document.querySelector("link[rel=\"canonical\"]")?.getAttribute("href"),
  storage: localStorage.length + sessionStorage.length + document.cookie.length
})')"
assert_eq "$(echo "$home_checks" | jq -r '.h1Count')" "1" "home h1 count"
assert_eq "$(echo "$home_checks" | jq -r '.rungCount')" "4" "home service ladder rungs"
assert_eq "$(echo "$home_checks" | jq -r '.proofStrip')" "true" "home proof strip present"
assert_eq "$(echo "$home_checks" | jq -r '.canonical')" "https://automancer.uk/" "home canonical URL"
assert_eq "$(echo "$home_checks" | jq -r '.storage')" "0" "home zero browser storage"

# Feature 02: Services & Pricing
ab open "$BASE_URL/services/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-services.png" >/dev/null

services_checks="$(ab_eval 'JSON.stringify({
  h1Count: document.querySelectorAll("h1").length,
  overviewRows: document.querySelectorAll(".overview-row").length,
  offers: Array.from(document.querySelectorAll(".offer")).map(o => ({
    amt: o.querySelector(".offer__amt")?.textContent?.trim()
  })),
  canonical: document.querySelector("link[rel=\"canonical\"]")?.getAttribute("href"),
  storage: localStorage.length + sessionStorage.length + document.cookie.length
})')"
assert_eq "$(echo "$services_checks" | jq -r '.h1Count')" "1" "services h1 count"
assert_eq "$(echo "$services_checks" | jq -r '.overviewRows')" "4" "services overview rows"
assert_eq "$(echo "$services_checks" | jq -c '[.offers[].amt]')" '["£450","£1,950","£4,500","£495"]' "services offer prices"
assert_eq "$(echo "$services_checks" | jq -r '.canonical')" "https://automancer.uk/services/" "services canonical URL"
assert_eq "$(echo "$services_checks" | jq -r '.storage')" "0" "services zero browser storage"

# Feature 03: Work & Field Notes
ab open "$BASE_URL/work/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-work.png" >/dev/null
work_checks="$(ab_eval 'JSON.stringify({
  h1Count: document.querySelectorAll("h1").length,
  cardCount: document.querySelectorAll(".case-card").length,
  canonical: document.querySelector("link[rel=\"canonical\"]")?.getAttribute("href"),
  storage: localStorage.length + sessionStorage.length + document.cookie.length
})')"
assert_eq "$(echo "$work_checks" | jq -r '.h1Count')" "1" "work h1 count"
assert_eq "$(echo "$work_checks" | jq -r '.cardCount')" "4" "work case-card count"
assert_eq "$(echo "$work_checks" | jq -r '.canonical')" "https://automancer.uk/work/" "work canonical URL"
assert_eq "$(echo "$work_checks" | jq -r '.storage')" "0" "work zero browser storage"

ab open "$BASE_URL/work/care-provider-transformation/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-case-study.png" >/dev/null
cs_checks="$(ab_eval 'JSON.stringify({
  h1Count: document.querySelectorAll("h1").length,
  canonical: document.querySelector("link[rel=\"canonical\"]")?.getAttribute("href"),
  storage: localStorage.length + sessionStorage.length + document.cookie.length
})')"
assert_eq "$(echo "$cs_checks" | jq -r '.h1Count')" "1" "case-study h1 count"
assert_eq "$(echo "$cs_checks" | jq -r '.canonical')" "https://automancer.uk/work/care-provider-transformation/" "case-study canonical"
assert_eq "$(echo "$cs_checks" | jq -r '.storage')" "0" "case-study zero browser storage"

ab open "$BASE_URL/field-notes/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-field-notes.png" >/dev/null
fn_checks="$(ab_eval 'JSON.stringify({
  h1Count: document.querySelectorAll("h1").length,
  noteCount: document.querySelectorAll(".note-row").length,
  canonical: document.querySelector("link[rel=\"canonical\"]")?.getAttribute("href"),
  storage: localStorage.length + sessionStorage.length + document.cookie.length
})')"
assert_eq "$(echo "$fn_checks" | jq -r '.h1Count')" "1" "field-notes h1 count"
assert_eq "$(echo "$fn_checks" | jq -r '.noteCount')" "15" "field-notes note-row count"
assert_eq "$(echo "$fn_checks" | jq -r '.canonical')" "https://automancer.uk/field-notes/" "field-notes canonical URL"
assert_eq "$(echo "$fn_checks" | jq -r '.storage')" "0" "field-notes zero browser storage"

ab open "$BASE_URL/field-notes/what-does-an-ai-agent-actually-cost/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-field-note-article.png" >/dev/null
fna_checks="$(ab_eval 'JSON.stringify({
  h1Count: document.querySelectorAll("h1").length,
  canonical: document.querySelector("link[rel=\"canonical\"]")?.getAttribute("href"),
  storage: localStorage.length + sessionStorage.length + document.cookie.length
})')"
assert_eq "$(echo "$fna_checks" | jq -r '.h1Count')" "1" "field-note article h1 count"
assert_eq "$(echo "$fna_checks" | jq -r '.canonical')" "https://automancer.uk/field-notes/what-does-an-ai-agent-actually-cost/" "field-note article canonical"
assert_eq "$(echo "$fna_checks" | jq -r '.storage')" "0" "field-note article zero browser storage"

# Feature 04: About & Legal Pages
ab open "$BASE_URL/about/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-about.png" >/dev/null
about_checks="$(ab_eval 'JSON.stringify({
  h1Count: document.querySelectorAll("h1").length,
  hasCompanyNo: document.body.textContent.includes("17060907"),
  canonical: document.querySelector("link[rel=\"canonical\"]")?.getAttribute("href"),
  storage: localStorage.length + sessionStorage.length + document.cookie.length
})')"
assert_eq "$(echo "$about_checks" | jq -r '.h1Count')" "1" "about h1 count"
assert_eq "$(echo "$about_checks" | jq -r '.hasCompanyNo')" "true" "about company number"
assert_eq "$(echo "$about_checks" | jq -r '.canonical')" "https://automancer.uk/about/" "about canonical"
assert_eq "$(echo "$about_checks" | jq -r '.storage')" "0" "about zero browser storage"

ab open "$BASE_URL/privacy/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-privacy.png" >/dev/null
privacy_checks="$(ab_eval 'JSON.stringify({
  h1Count: document.querySelectorAll("h1").length,
  hasDate: document.body.textContent.includes("23 August 2026"),
  storage: localStorage.length + sessionStorage.length + document.cookie.length
})')"
assert_eq "$(echo "$privacy_checks" | jq -r '.h1Count')" "1" "privacy h1 count"
assert_eq "$(echo "$privacy_checks" | jq -r '.hasDate')" "true" "privacy lastUpdated date"
assert_eq "$(echo "$privacy_checks" | jq -r '.storage')" "0" "privacy zero browser storage"

ab open "$BASE_URL/terms/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-terms.png" >/dev/null
terms_checks="$(ab_eval 'JSON.stringify({
  h1Count: document.querySelectorAll("h1").length,
  hasDate: document.body.textContent.includes("3 July 2026"),
  storage: localStorage.length + sessionStorage.length + document.cookie.length
})')"
assert_eq "$(echo "$terms_checks" | jq -r '.h1Count')" "1" "terms h1 count"
assert_eq "$(echo "$terms_checks" | jq -r '.hasDate')" "true" "terms lastUpdated date"
assert_eq "$(echo "$terms_checks" | jq -r '.storage')" "0" "terms zero browser storage"

# Feature 05: Contact & Intake Validation
ab open "$BASE_URL/contact/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-contact.png" >/dev/null

contact_empty_name="$(ab_eval '(() => {
  const form = document.getElementById("contact-form");
  form.name.value = "";
  form.email.value = "visitor@example.com";
  form.time_sink.value = "Manual spreadsheet reconciliation.";
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  return JSON.stringify({
    err: document.getElementById("form-error")?.textContent?.trim(),
    nameInvalid: form.name.getAttribute("aria-invalid"),
    activeId: document.activeElement?.id
  });
})()')"
assert_eq "$(echo "$contact_empty_name" | jq -r '.err')" "Please add your name." "contact empty-name error message"
assert_eq "$(echo "$contact_empty_name" | jq -r '.nameInvalid')" "true" "contact #name aria-invalid"
assert_eq "$(echo "$contact_empty_name" | jq -r '.activeId')" "name" "contact focus moved to #name"

contact_empty_email="$(ab_eval '(() => {
  const form = document.getElementById("contact-form");
  form.name.value = "Test Visitor";
  form.email.value = "";
  form.time_sink.value = "Manual spreadsheet reconciliation.";
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  return JSON.stringify({
    err: document.getElementById("form-error")?.textContent?.trim(),
    emailInvalid: form.email.getAttribute("aria-invalid"),
    nameInvalid: form.name.getAttribute("aria-invalid"),
    activeId: document.activeElement?.id
  });
})()')"
assert_eq "$(echo "$contact_empty_email" | jq -r '.err')" "Please add a valid email so Waseem can reply." "contact empty-email error message"
assert_eq "$(echo "$contact_empty_email" | jq -r '.emailInvalid')" "true" "contact #email aria-invalid"
assert_eq "$(echo "$contact_empty_email" | jq -r '.nameInvalid')" "null" "contact #name aria-invalid cleared"
assert_eq "$(echo "$contact_empty_email" | jq -r '.activeId')" "email" "contact focus moved to #email"
ab screenshot "$EVIDENCE_DIR/desktop-contact-validation.png" >/dev/null

contact_turnstile_err="$(ab_eval '(() => {
  const handled = typeof window.onTurnstileError === "function" ? window.onTurnstileError() : false;
  const err = document.getElementById("form-error")?.textContent?.trim() ?? "";
  return JSON.stringify({
    handled,
    hasEmailFallback: err.includes("waseem@automancer.uk"),
    leaksCode: err.includes("600010") || err.includes("turnstile_failed")
  });
})()')"
assert_eq "$(echo "$contact_turnstile_err" | jq -r '.handled')" "true" "contact onTurnstileError callback"
assert_eq "$(echo "$contact_turnstile_err" | jq -r '.hasEmailFallback')" "true" "contact Turnstile fallback email"
assert_eq "$(echo "$contact_turnstile_err" | jq -r '.leaksCode')" "false" "contact no raw code leak"

# Feature 06: Developers & 404
ab open "$BASE_URL/developers/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-developers.png" >/dev/null
dev_checks="$(ab_eval 'JSON.stringify({
  h1Count: document.querySelectorAll("h1").length,
  hasOpenApi: document.body.textContent.includes("/openapi.json"),
  hasAgentJson: document.body.textContent.includes("/agent.json"),
  storage: localStorage.length + sessionStorage.length + document.cookie.length
})')"
assert_eq "$(echo "$dev_checks" | jq -r '.h1Count')" "1" "developers h1 count"
assert_eq "$(echo "$dev_checks" | jq -r '.hasOpenApi')" "true" "developers mentions /openapi.json"
assert_eq "$(echo "$dev_checks" | jq -r '.hasAgentJson')" "true" "developers mentions /agent.json"
assert_eq "$(echo "$dev_checks" | jq -r '.storage')" "0" "developers zero browser storage"

ab open "$BASE_URL/404" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/desktop-404.png" >/dev/null
notfound_h1="$(ab_eval 'document.querySelector("h1")?.textContent?.trim()')"
[[ "$notfound_h1" == *"404"* ]] || { echo "Expected 404 in /404 h1, got '$notfound_h1'" >&2; exit 1; }

echo "[4/5] Drive (Mobile 390x844 + Machine Surfaces)..."
ab set viewport 390 844 >/dev/null

ab open "$BASE_URL/" >/dev/null
ab wait --load networkidle >/dev/null
ab screenshot "$EVIDENCE_DIR/mobile-home.png" >/dev/null

# Exercise mobile menu open and close
ab eval 'document.querySelector(".hamburger")?.click()' >/dev/null
sleep 0.2
ab screenshot "$EVIDENCE_DIR/mobile-menu-open.png" >/dev/null
menu_open_state="$(ab_eval 'JSON.stringify({
  isOpen: document.querySelector(".mobile-menu")?.classList.contains("is-open"),
  ariaExpanded: document.querySelector(".hamburger")?.getAttribute("aria-expanded")
})')"
assert_eq "$(echo "$menu_open_state" | jq -r '.isOpen')" "true" "mobile menu opens on click"
assert_eq "$(echo "$menu_open_state" | jq -r '.ariaExpanded')" "true" "mobile hamburger aria-expanded=true"

# Keyboard focus must stay in the full-screen menu, not reach the hidden page.
ab eval 'document.querySelector(".mobile-menu a:last-child").focus()' >/dev/null
ab press Tab >/dev/null
# A native dialog may let Tab visit browser chrome (activeElement becomes body).
assert_eq "$(ab_eval 'document.activeElement === document.body || document.querySelector(".mobile-menu").contains(document.activeElement)')" "true" "Tab cannot focus the page behind the open menu"
ab press Tab >/dev/null
assert_eq "$(ab_eval 'document.querySelector(".mobile-menu").contains(document.activeElement)')" "true" "Tab returns to the menu after browser chrome"
ab eval 'document.querySelector(".mobile-menu__close").focus()' >/dev/null
ab press Shift+Tab >/dev/null
assert_eq "$(ab_eval 'document.querySelector(".mobile-menu").contains(document.activeElement)')" "true" "Shift+Tab cannot escape the open mobile menu"
ab eval 'document.querySelector("main a").focus()' >/dev/null
assert_eq "$(ab_eval 'document.querySelector(".mobile-menu").contains(document.activeElement)')" "true" "background links are inert while the menu is open"

ab eval 'document.querySelector(".mobile-menu__close")?.click()' >/dev/null
sleep 0.2
menu_closed_state="$(ab_eval 'JSON.stringify({
  isOpen: document.querySelector(".mobile-menu")?.classList.contains("is-open"),
  ariaExpanded: document.querySelector(".hamburger")?.getAttribute("aria-expanded")
})')"
assert_eq "$(echo "$menu_closed_state" | jq -r '.isOpen')" "false" "mobile menu closes on close button"
assert_eq "$(echo "$menu_closed_state" | jq -r '.ariaExpanded')" "false" "mobile hamburger aria-expanded=false"
assert_eq "$(ab_eval 'document.activeElement === document.querySelector(".hamburger")')" "true" "closing the menu restores focus"

ab eval 'document.querySelector(".hamburger").click()' >/dev/null
ab press Escape >/dev/null
assert_eq "$(ab_eval 'document.querySelector(".mobile-menu").classList.contains("is-open")')" "false" "Escape closes the menu"
assert_eq "$(ab_eval 'document.activeElement === document.querySelector(".hamburger")')" "true" "Escape restores focus"

for item in \
  "/:mobile-home-check" \
  "/services/:mobile-services.png" \
  "/work/:mobile-work.png" \
  "/field-notes/:mobile-field-notes.png" \
  "/about/:mobile-about.png" \
  "/contact/:mobile-contact.png" \
  "/developers/:mobile-developers.png" \
  "/privacy/:mobile-privacy.png" \
  "/terms/:mobile-terms.png"; do
  route="${item%%:*}"
  shot="${item#*:}"
  ab open "$BASE_URL$route" >/dev/null
  ab wait --load networkidle >/dev/null
  if [[ "$shot" == *.png ]]; then
    ab screenshot "$EVIDENCE_DIR/$shot" >/dev/null
  fi
  overflow="$(ab_eval 'document.documentElement.scrollWidth <= window.innerWidth')"
  assert_eq "$overflow" "true" "mobile 390px no horizontal overflow on $route"
done

# Machine-readable HTTP checks (25 endpoints + 2 legal no-mirror 404 checks)
for endpoint in \
  "/llms.txt" \
  "/llms-full.txt" \
  "/agent.json" \
  "/.well-known/agent.json" \
  "/security.txt" \
  "/.well-known/security.txt" \
  "/openapi.json" \
  "/api/index.json" \
  "/api/business.json" \
  "/api/services.json" \
  "/api/case-studies.json" \
  "/api/field-notes.json" \
  "/api/pages.json" \
  "/work/rss.xml" \
  "/work/feed.json" \
  "/field-notes/rss.xml" \
  "/field-notes/feed.json" \
  "/index.md" \
  "/services.md" \
  "/work.md" \
  "/work/care-provider-transformation.md" \
  "/field-notes.md" \
  "/field-notes/what-does-an-ai-agent-actually-cost.md" \
  "/about.md" \
  "/contact.md"; do
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "$BASE_URL$endpoint")"
  assert_eq "$code" "200" "HTTP 200 on $endpoint"
done

for legal_md in "/privacy.md" "/terms.md"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL$legal_md")"
  assert_eq "$code" "404" "HTTP 404 on unmirrored legal page $legal_md"
done

jq -n \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg baseUrl "$BASE_URL" \
  --arg session "$SESSION" \
  --argjson home "$home_checks" \
  --argjson services "$services_checks" \
  --argjson contactEmptyName "$contact_empty_name" \
  --argjson contactEmptyEmail "$contact_empty_email" \
  --argjson contactTurnstile "$contact_turnstile_err" \
  --argjson mobileMenuOpen "$menu_open_state" \
  --argjson mobileMenuClosed "$menu_closed_state" \
  '{
    status: "passed",
    timestamp: $timestamp,
    baseUrl: $baseUrl,
    session: $session,
    desktop: {
      home: $home,
      services: $services,
      contactEmptyName: $contactEmptyName,
      contactEmptyEmail: $contactEmptyEmail,
      contactTurnstile: $contactTurnstile
    },
    mobile: {
      viewport: "390x844",
      menuOpen: $mobileMenuOpen,
      menuClosed: $mobileMenuClosed,
      overflowFreeRoutes: ["/", "/services/", "/work/", "/field-notes/", "/about/", "/contact/", "/developers/", "/privacy/", "/terms/"]
    },
    machineEndpointsChecked: 27
  }' >"$EVIDENCE_DIR/summary.json"

echo "[5/5] Evidence written to $EVIDENCE_DIR/summary.json and 20 screenshots captured."
