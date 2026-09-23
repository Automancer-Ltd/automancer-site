#!/usr/bin/env bash
#
# ops/verify-production.sh — assert that the deployed site actually SERVES.
#
# A green actions/deploy-pages only proves GitHub accepted the artifact. This
# script checks production itself, the way a visitor / crawler / AI agent
# meets it: pages answer 200, unknown paths are a REAL 404 (not a soft 404),
# llms.txt and the sitemap exist, the agent manifest and security.txt answer
# at their non-dot paths (GitHub Pages does not serve dot-prefixed paths —
# measured 2026-08-22, when /.well-known/* 404'd live while every dist/-only
# check stayed green), the legal footer anchor is on the homepage, and the
# TLS certificate is valid and not about to expire. Both
# .github/workflows/deploy.yml (post-deploy verify job) and
# .github/workflows/uptime.yml and the auto-vps production-verifier timer call
# THIS script — the checks exist once so the callers can never drift apart.
#
# Every check retries transiently: Pages can lag a few seconds behind a fresh
# deploy, and a monitor that cries wolf gets muted. Each check polls for up
# to DEADLINE_SECS before failing — bounded, never unlimited.
#
# Exit codes: 0 all checks passed; 1 at least one check failed;
# 64 bad arguments (nothing was probed).
#
set -euo pipefail

# --- the contract under test -------------------------------------------
readonly ROUTES=("/" "/services" "/work" "/field-notes" "/about" "/contact" "/privacy" "/terms")
readonly LLMS_PATH="/llms.txt"
readonly SITEMAP_PATH="/sitemap-index.xml"
# The agent manifest and RFC 9116 security.txt are served at NON-DOT paths:
# GitHub Pages does not serve dot-prefixed paths, so the /.well-known/
# locations build fine and 404 live. These checks exist because exactly that
# shipped: green CI, green deploy, dead URLs that llms.txt advertised.
readonly AGENT_MANIFEST_PATH="/agent.json"
readonly SECURITY_TXT_PATH="/security.txt"
# Structural, not marketing copy: the company registration line from the
# site footer (src/components/Footer.astro ← src/data/business.ts). Marketing
# wording changes; the registered company number does not.
readonly HOMEPAGE_ANCHOR="Company No. 17060907"
# MEASURED 2026-08-22, not estimated. The live certificate is Let's Encrypt,
# 89-day lifetime, and LE renews at ~1/3 life remaining (~29 days out). So the
# threshold must sit BELOW 29 or it fires on every renewal cycle. 21 does, and
# it surfaces a FAILED renewal within about a week instead of sitting silent
# for a fortnight, which a 14-day threshold would have done.
readonly TLS_MIN_DAYS=21
# Expected destination of production errors. Sourced from the Sentry org
# catalogue (org slug `automancer`, EU region, project slug `automancer-site`)
# via a read-only Executor call on 2026-08-31 — NOT from
# vars.PUBLIC_AUT_SENTRY_WEB_DSN. That CI variable is the DSN the build
# inlines; this constant is which project those events must land in. A DSN
# for any other project in the same org, a rotated key on a project nobody
# watches, or a DSN that merely looks like an ingest URL, fails this check.
#
# What this cannot catch: a PR that updates BOTH this constant and the CI
# DSN to a new project together. That changes the intent in two places at
# once and the check would agree with itself. It also cannot catch an alert
# rule that does not actually page anyone.
readonly EXPECTED_SENTRY_PROJECT_ID='4511769898647632'
readonly EXPECTED_SENTRY_PROJECT_SLUG='automancer-site'

# MEASURED: Pages deploys tonight completed in 36-47s end to end. This is a
# BACKSTOP against a hung request, not the check itself — the check is the
# assertion, and it retries until it passes or this budget runs out. Sized at
# roughly 2x the observed worst case.
readonly DEADLINE_SECS=90          # per-check retry budget before declaring failure
readonly POLL_INTERVAL_SECS=5
readonly HTTP_TIMEOUT_SECS=15      # per-request curl timeout
readonly MAX_REDIRECTS=5           # e.g. /services -> /services/ (GitHub Pages trailing slash)

BASE_URL=''
HOST=''       # hostname only (for TLS SNI)
HOST_PORT=''  # hostname[:port]
EXPECTED_REVISION='' # seven-character revision served in the homepage proof strip

FAILED_CHECKS=()

# --self-test state (see self_test below); empty when not self-testing.
SELF_TEST_FAILURES=()
SELFTEST_SERVER_PID=''   # PID of the local fixture server, killed by cleanup
SELFTEST_SCENARIO=''     # scenario file the fixture server reloads per request

# --- scratch-file lifecycle ----------------------------------------------
# ALL scratch files live in ONE directory, created up front and removed as a
# unit by the trap below on EVERY exit path: clean exit, check failures,
# SIGINT, SIGTERM. Being killed by a signal is a NORMAL death for this
# script — CI wraps it in `timeout` and workflow timeout-minutes — so
# "clean up on the way out" cannot live in individual functions: most temp
# files are created inside COMMAND SUBSTITUTIONS (out=$(need_tmp)), where
# an `exit` kills only the subshell and the run carries on regardless. The
# parent owns the one directory name, and the trap reaches it from anywhere.
# When a signal arrives mid-request, bash runs the trap once the in-flight
# command returns — bounded by HTTP_TIMEOUT_SECS/POLL_INTERVAL_SECS.
RUN_TMP_DIR=''
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  [[ -z $SELFTEST_SERVER_PID ]] || kill "$SELFTEST_SERVER_PID" 2>/dev/null
  [[ -z $RUN_TMP_DIR ]] || rm -rf -- "$RUN_TMP_DIR"
  return "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if ! RUN_TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/verify-production.XXXXXXXXXX" 2>/dev/null) || [[ -z $RUN_TMP_DIR ]]; then
  printf '\nFATAL: cannot create a temporary directory in %s.\n' "${TMPDIR:-/tmp}" >&2
  printf 'This is a problem with THIS MACHINE, not with any site — nothing has been checked.\n' >&2
  printf 'Check free space AND free inodes (bytes can be plentiful while inodes are gone):\n' >&2
  printf '  df -h %s\n  df -i %s\n' "${TMPDIR:-/tmp}" "${TMPDIR:-/tmp}" >&2
  exit 3
fi

log() { printf '%s\n' "$*"; }

usage() {
  cat >&2 <<'EOF'
Usage: ops/verify-production.sh <base-url>
       ops/verify-production.sh --expected-revision <7-or-40-char-sha> <base-url>
       ops/verify-production.sh --self-test
       ops/verify-production.sh --assert-sentry-bundle <js-file>

Verify that a deployed Automancer site serves correctly: page statuses,
real 404s, llms.txt, sitemap XML, agent.json + security.txt at their
non-dot paths, homepage footer anchor, TLS certificate, Sentry DSN for
the expected project (not merely "a" Sentry project).

--expected-revision is for the post-deploy gate. It also requires the
homepage proof strip to serve the first seven characters of the supplied
Git SHA. The assertion uses the same bounded 90-second retry window as the
other checks so a normal Pages rollout can finish without paging forever.

--self-test proves the checker itself can still fail AND pass: it drives
each independently-failable assertion against an isolated local fixture on
127.0.0.1 (never production) and asserts both failing and passing directions.

--assert-sentry-bundle runs only the Sentry project assertion against a
local JavaScript file (a fixture or a copy of a bundle). It never prints
a DSN. Used to prove the check against bytes that are not production.

<base-url> must be a BARE https origin:
  - https scheme is required (the check suite includes TLS certificate
    validation, which is impossible over http);
  - no trailing slash — route paths are appended directly, so a trailing
    slash would produce broken URLs like https://example.com//services;
  - no path, query string, fragment, userinfo or whitespace;
  - hostname of the form example.com, optionally with :port.

Examples:
  ops/verify-production.sh https://automancer.uk         # production
  ops/verify-production.sh --expected-revision "$GITHUB_SHA" https://automancer.uk
  ops/verify-production.sh https://preview.example.org   # a preview deploy
  ops/verify-production.sh --self-test                   # the checker checks itself
  ops/verify-production.sh --assert-sentry-bundle ./bundle.js  # local bundle only
EOF
}

validate_expected_revision() {
  local supplied=$1
  if [[ ! $supplied =~ ^([0-9a-fA-F]{7}|[0-9a-fA-F]{40})$ ]]; then
    arg_error "expected revision must be exactly 7 or 40 hexadecimal characters (got \"$supplied\")"
  fi
  EXPECTED_REVISION=${supplied:0:7}
  EXPECTED_REVISION=${EXPECTED_REVISION,,}
}

arg_error() {
  printf '\nERROR: %s\n\n' "$*" >&2
  usage >&2
  exit 64
}

validate_base_url() {
  if [[ $# -ne 1 ]]; then
    arg_error "expected exactly 1 argument (the base URL), got $#"
  fi
  BASE_URL=$1
  [[ -n "$BASE_URL" ]] || arg_error "base URL is empty"
  case "$BASE_URL" in
    https://*) : ;;
    *) arg_error "base URL must start with https:// (got \"$BASE_URL\") — http would silently skip the certificate checks" ;;
  esac
  case "$BASE_URL" in
    */) arg_error "base URL must not end with \"/\" (got \"$BASE_URL\") — routes are appended directly and a trailing slash yields double slashes" ;;
  esac
  HOST_PORT=${BASE_URL#https://}
  case "$HOST_PORT" in
    '') arg_error "base URL has an empty hostname" ;;
    */*) arg_error "base URL must be a bare origin — no path after the hostname (got \"$BASE_URL\")" ;;
    *'?'*) arg_error "base URL must not contain a query string (got \"$BASE_URL\")" ;;
    *'#'*) arg_error "base URL must not contain a fragment (got \"$BASE_URL\")" ;;
    *@*) arg_error "base URL must not contain userinfo (got \"$BASE_URL\")" ;;
    *[[:space:]]*) arg_error "base URL must not contain whitespace (got \"$BASE_URL\")" ;;
  esac
  if [[ ! "$HOST_PORT" =~ ^[A-Za-z0-9._-]+(:[0-9]{1,5})?$ ]]; then
    arg_error "hostname looks malformed: \"$HOST_PORT\" (expected e.g. automancer.uk or staging.automancer.uk:8443)"
  fi
  HOST=${HOST_PORT%%:*}
  [[ -n "$HOST" ]] || arg_error "base URL has an empty hostname"
}

curl_exit_hint() {
  case $1 in
    6)  echo "DNS lookup failed for the hostname" ;;
    7)  echo "connection refused" ;;
    22) echo "server returned an unrepresentable HTTP error" ;;
    28) echo "request timed out after ${HTTP_TIMEOUT_SECS}s" ;;
    35) echo "TLS handshake failed" ;;
    47) echo "redirect chain exceeded ${MAX_REDIRECTS} hops (possible redirect loop)" ;;
    56) echo "connection dropped mid-response" ;;
    60) echo "TLS certificate verification failed (expired, self-signed or wrong host)" ;;
    *)  echo "curl exited with code $1 (see curl man page)" ;;
  esac
}

# need_tmp — print the path of a fresh scratch file INSIDE $RUN_TMP_DIR, or
# abort the whole run with a clear cause.
#
# Why files go inside the run directory rather than straight into /tmp:
# they are created inside command substitutions (out=$(need_tmp)), so no
# function can be trusted to clean up after itself — an `exit` there kills
# only the subshell. Cleanup belongs to the parent's EXIT/INT/TERM trap,
# which removes $RUN_TMP_DIR as a unit (see the lifecycle block above).
#
# Why this is not just `mktemp`: if the temp filesystem is out of space or
# inodes, a bare mktemp returns empty, every redirection then fails, and curl
# is blamed for it. The script goes on to report "page / answers 200 — gave up
# after 90s" about a site that is perfectly healthy — a false production
# incident, arrived at by retrying a condition that retrying cannot fix.
# Verified against a real /tmp inode exhaustion on the build box, 2026-08-22.
need_tmp() {
  local f
  if ! f=$(mktemp "${RUN_TMP_DIR}/tmp.XXXXXXXX" 2>/dev/null) || [[ -z $f ]]; then
    printf '\nFATAL: cannot create a temporary file in %s.\n' "$RUN_TMP_DIR" >&2
    printf 'This is a problem with THIS MACHINE, not with %s — the site has not been checked.\n' "$BASE_URL" >&2
    printf 'Check free space and free inodes:  df -h %s ; df -i %s\n' "${TMPDIR:-/tmp}" "${TMPDIR:-/tmp}" >&2
    exit 3
  fi
  printf '%s' "$f"
}

# probe_status <url> <expected-final-status>
# Follows redirects (bounded), asserts the FINAL status. Prints one line:
# a success summary on success, or a diagnosis naming URL, expected and
# actual on failure. Return 0 only when the expectation held.
probe_status() {
  local url=$1 expected=$2
  local out err meta rc code rest hops effective
  out=$(need_tmp) err=$(need_tmp)
  rc=0
  curl -sS -L --max-redirs "$MAX_REDIRECTS" --max-time "$HTTP_TIMEOUT_SECS" \
    -o /dev/null -w '%{http_code}|%{num_redirects}|%{url_effective}' \
    "$url" >"$out" 2>"$err" || rc=$?
  if (( rc != 0 )); then
    printf 'GET %s did not complete: %s (%s)\n' \
      "$url" "$(tr -d '\n' <"$err")" "$(curl_exit_hint "$rc")"
    rm -f "$out" "$err"
    return 1
  fi
  meta=$(cat "$out")
  rm -f "$out" "$err"
  code=${meta%%|*}; rest=${meta#*|}; hops=${rest%%|*}; effective=${rest#*|}
  if [[ "$code" != "$expected" ]]; then
    if [[ "$expected" == "404" && "$code" == "200" ]]; then
      printf 'GET %s returned HTTP 200 where a REAL 404 is required — soft 404: search engines and AI agents will index a page that does not exist\n' "$url"
    else
      printf 'GET %s returned HTTP %s, expected HTTP %s (followed %s redirect(s), finally landed on %s)\n' \
        "$url" "$code" "$expected" "$hops" "$effective"
    fi
    return 1
  fi
  if (( hops > 0 )); then
    printf 'GET %s -> %s (via %s redirect(s) to %s)\n' "$url" "$code" "$hops" "$effective"
  else
    printf 'GET %s -> %s\n' "$url" "$code"
  fi
}

# fetch_body <url> — writes the response body to BODY_FILE on success,
# asserts final status 200. Prints a diagnosis on failure.
BODY_FILE=''
fetch_body() {
  local url=$1
  local out err meta rc code
  out=$(need_tmp) err=$(need_tmp)
  BODY_FILE=$(need_tmp)
  rc=0
  curl -sS -L --max-redirs "$MAX_REDIRECTS" --max-time "$HTTP_TIMEOUT_SECS" \
    -o "$BODY_FILE" -w '%{http_code}' \
    "$url" >"$out" 2>"$err" || rc=$?
  if (( rc != 0 )); then
    printf 'GET %s did not complete: %s (%s)\n' \
      "$url" "$(tr -d '\n' <"$err")" "$(curl_exit_hint "$rc")"
    rm -f "$out" "$err" "$BODY_FILE"
    return 1
  fi
  meta=$(cat "$out")
  rm -f "$out" "$err"
  code=$meta
  if [[ "$code" != "200" ]]; then
    printf 'GET %s returned HTTP %s, expected HTTP 200 (body was %s bytes)\n' \
      "$url" "$code" "$(wc -c <"$BODY_FILE")"
    rm -f "$BODY_FILE"
    return 1
  fi
}

# poll_check <label> <function> [args...] — retry one check until it passes
# or DEADLINE_SECS elapse. Every WAIT line carries the current diagnosis so
# "still deploying" never looks like a hard failure, and the final FAIL line
# repeats the last observed state verbatim.
poll_check() {
  local label=$1 fn=$2
  shift 2
  local detail='' deadline=$((SECONDS + DEADLINE_SECS))
  while true; do
    if detail=$("$fn" "$@"); then
      log "PASS  $label"
      log "      $detail"
      return 0
    fi
    if (( SECONDS >= deadline )); then
      log "FAIL  $label — gave up after ${DEADLINE_SECS}s of retries. Last observed state:"
      log "      $detail"
      FAILED_CHECKS+=("$label")
      return 1
    fi
    log "WAIT  $label — retrying (budget ${DEADLINE_SECS}s): $detail"
    sleep "$POLL_INTERVAL_SECS"
  done
}

check_route() {
  probe_status "${BASE_URL}$1" 200
}

check_not_found() {
  # Unique per run so a CDN/Pages cache can never serve a stale hit.
  local url="${BASE_URL}/this-route-must-not-exist-$$-${RANDOM}"
  probe_status "$url" 404
}

check_llms_txt() {
  local url="${BASE_URL}${LLMS_PATH}" bytes
  fetch_body "$url" || return 1
  bytes=$(wc -c <"$BODY_FILE")
  if (( bytes == 0 )); then
    printf 'GET %s returned HTTP 200 but a ZERO-BYTE body — llms.txt generation broke\n' "$url"
    rm -f "$BODY_FILE"
    return 1
  fi
  printf 'GET %s -> 200, %s bytes\n' "$url" "$bytes"
  rm -f "$BODY_FILE"
}

json_parses() {
  # Real JSON parse, not a substring sniff. python3 ships on GitHub's Ubuntu
  # runners and every machine this repo is developed on.
  python3 - "$1" <<'PY' || return 1
import sys, json
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        json.load(fh)
except Exception as exc:
    print(f"JSON parse error: {exc}", file=sys.stderr)
    sys.exit(1)
PY
}

# rfc9116_conformant <file> <expected-canonical-url-or-empty> — validate the
# fields RFC 9116 requires: Contact and Expires MUST be present, Expires MUST
# be a parseable timestamp IN THE FUTURE, Preferred-Languages must be
# present, and Canonical must be an absolute URL. When an expected canonical
# URL is supplied (canonical origins only — see below), Canonical must match
# it EXACTLY. That assertion is not pedantry: a Canonical pointing at a path
# that 404s makes the document non-conformant AND re-advertises a dead URL —
# the exact failure mode that put these checks here.
#
# The exact match is applied only when HOST is automancer.uk / www (the
# origin the file is generated to name). On any other host — the preview
# deploys this script also verifies — the served bytes legitimately still
# carry production's Canonical, so only structure is asserted there.
rfc9116_conformant() {
  python3 - "$1" "$2" <<'PY' || return 1
import sys, datetime

path, expected_canonical = sys.argv[1], sys.argv[2]
fields = {}
with open(path, encoding="utf-8") as fh:
    for line in fh:
        key, sep, value = line.partition(":")
        if sep and key.strip() and key.strip() not in fields:
            fields[key.strip()] = value.strip()

missing_contact = "Contact" not in fields
missing_expires = "Expires" not in fields
missing_languages = "Preferred-Languages" not in fields
missing_canonical = "Canonical" not in fields
missing = [
    name
    for name, absent in (
        ("Contact", missing_contact),
        ("Expires", missing_expires),
        ("Preferred-Languages", missing_languages),
        ("Canonical", missing_canonical),
    )
    if absent
]
if missing:
    print(f"missing required field(s): {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)

expires_value = fields.get("Expires")
expires = None
if expires_value is not None:
    try:
        expires = datetime.datetime.fromisoformat(expires_value.replace("Z", "+00:00"))
    except ValueError:
        pass
if expires_value is not None and expires is None:
    print(f"Expires \"{expires_value}\" is not a parseable RFC 3339 timestamp", file=sys.stderr)
    sys.exit(1)
if expires is not None and expires <= datetime.datetime.now(datetime.timezone.utc):
    print(
        f"Expires \"{expires_value}\" is NOT in the future — the document is invalid (RFC 9116 §3.3)",
        file=sys.stderr,
    )
    sys.exit(1)

canonical = fields.get("Canonical")
if canonical is not None and not canonical.startswith(("http://", "https://")):
    print(f"Canonical \"{canonical}\" is not an absolute http(s) URL", file=sys.stderr)
    sys.exit(1)

if canonical is not None and expected_canonical and canonical != expected_canonical:
    print(
        f"Canonical \"{canonical}\" does not match the served URL \"{expected_canonical}\" "
        "- a Canonical that does not resolve makes the file non-conformant",
        file=sys.stderr,
    )
    sys.exit(1)
PY
}

check_agent_manifest() {
  local url="${BASE_URL}${AGENT_MANIFEST_PATH}"
  fetch_body "$url" || return 1
  if ! json_parses "$BODY_FILE"; then
    printf 'GET %s returned HTTP 200 but the body is NOT valid JSON (first bytes: %s)\n' \
      "$url" "$(head -c 120 "$BODY_FILE" | tr -d '\n')"
    rm -f "$BODY_FILE"
    return 1
  fi
  printf 'GET %s -> 200 and parses as JSON\n' "$url"
  rm -f "$BODY_FILE"
}

check_security_txt() {
  local url="${BASE_URL}${SECURITY_TXT_PATH}" verdict expected_canonical=''
  fetch_body "$url" || return 1
  # Exact Canonical match only on the origin the file is generated to name;
  # preview origins get structural validation (see rfc9116_conformant).
  case "$HOST" in
    automancer.uk | www.automancer.uk) expected_canonical="${BASE_URL}${SECURITY_TXT_PATH}" ;;
  esac
  if ! verdict=$(rfc9116_conformant "$BODY_FILE" "$expected_canonical" 2>&1); then
    printf 'GET %s returned HTTP 200 but VIOLATES RFC 9116: %s\n' "$url" "$(printf '%s' "$verdict" | tr -d '\n')"
    rm -f "$BODY_FILE"
    return 1
  fi
  printf 'GET %s -> 200 and satisfies RFC 9116 (Contact, future Expires, Canonical resolves)\n' "$url"
  rm -f "$BODY_FILE"
}

xml_parses() {
  # Real XML parse, not a substring sniff. python3 ships on GitHub's Ubuntu
  # runners and every machine this repo is developed on.
  python3 - "$1" <<'PY' || return 1
import sys, xml.etree.ElementTree as ET
try:
    ET.parse(sys.argv[1])
except Exception as exc:
    print(f"XML parse error: {exc}", file=sys.stderr)
    sys.exit(1)
PY
}

check_sitemap() {
  local url="${BASE_URL}${SITEMAP_PATH}"
  fetch_body "$url" || return 1
  if ! xml_parses "$BODY_FILE"; then
    printf 'GET %s returned HTTP 200 but the body is NOT well-formed XML (first bytes: %s)\n' \
      "$url" "$(head -c 120 "$BODY_FILE" | tr -d '\n')"
    rm -f "$BODY_FILE"
    return 1
  fi
  printf 'GET %s -> 200 and parses as XML\n' "$url"
  rm -f "$BODY_FILE"
}

check_homepage_anchor() {
  local url="${BASE_URL}/"
  fetch_body "$url" || return 1
  if ! grep -qF -- "$HOMEPAGE_ANCHOR" "$BODY_FILE"; then
    printf 'homepage %s does NOT contain the expected structural string \"%s\" — the served page is not the current Automancer homepage (stale deploy, wrong site, or the footer/legal block changed)\n' \
      "$url" "$HOMEPAGE_ANCHOR"
    rm -f "$BODY_FILE"
    return 1
  fi
  printf 'GET %s -> 200 and contains \"%s\"\n' "$url" "$HOMEPAGE_ANCHOR"
  rm -f "$BODY_FILE"
}

check_revision() {
  local url="${BASE_URL}/" match served
  fetch_body "$url" || return 1
  if ! match=$(/usr/bin/grep -oE 'build:</span><b>[0-9a-f]{7}</b>' "$BODY_FILE"); then
    printf 'homepage %s does NOT expose a seven-character build revision in the proof strip — cannot prove which deploy is serving\n' "$url"
    rm -f "$BODY_FILE"
    return 1
  fi
  rm -f "$BODY_FILE"
  match=${match%%$'\n'*}
  served=${match#*<b>}
  served=${served%</b>}
  if [[ $served != "$EXPECTED_REVISION" ]]; then
    printf 'homepage %s serves build revision %s, expected deployed revision %s — the previous deploy may still be live\n' \
      "$url" "$served" "$EXPECTED_REVISION"
    return 1
  fi
  printf 'GET %s -> 200 and serves expected build revision %s\n' "$url" "$served"
}

# Error monitoring is a SETUP condition, and setup conditions must be loud.
#
# src/scripts/sentry.ts initialises only when `PROD && dsn`. The DSN comes from
# a CI repository variable. If that variable is ever unset, renamed, or lost in
# a workflow edit, the site builds green, deploys green, and error monitoring is
# simply OFF — with nothing anywhere reporting it. A missing DSN is a condition
# of OUR SETUP, not of the world, and it is the only kind a human can fix.
#
# Presence of *any* Sentry ingest URL is not enough: a DSN for a different
# project (rotated key, sibling project in the same org, a project nobody
# watches) looks identical to the old grep. The check compares the project
# id in the served bundle against EXPECTED_SENTRY_PROJECT_ID, which is the
# committed intent — not a copy of the CI variable that supplied the DSN.
#
# Checked here rather than in the test suite because the suite builds WITHOUT a
# DSN (correctly — dev, preview and test must not consume the production error
# budget), so only production can answer this.
#
# extract_sentry_project_ids and sentry_bundle_verdict never print a DSN.

extract_sentry_project_ids() {
  # Numeric path after the ingest host, optionally under /api/. The org id
  # lives in the hostname (oNNNN.ingest...) and is not a project id.
  python3 - "$1" <<'PY'
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
ids = re.findall(r"ingest(?:\.de)?\.sentry\.io(?:/api)?/(\d+)", text)
seen = []
for i in ids:
    if i not in seen:
        seen.append(i)
sys.stdout.write("\n".join(seen))
PY
}

# sentry_bundle_verdict <js-file> <label>
# Prints one diagnosis line. Returns 0 only when every extracted project id
# is EXPECTED_SENTRY_PROJECT_ID. Distinguishes "no DSN" (blames the CI
# variable) from "wrong project" (names expected vs found).
sentry_bundle_verdict() {
  local bundle_file=$1 label=$2
  local ids_raw id found_list
  local -a found=() unexpected=()
  if ! ids_raw=$(extract_sentry_project_ids "$bundle_file"); then
    printf 'could not parse %s for a Sentry project id\n' "$label"
    return 1
  fi
  if [[ -z $ids_raw ]]; then
    printf 'bundle %s contains NO Sentry ingest DSN — error monitoring is OFF in production. This is a missing-DSN failure, not a wrong-project mismatch: no ingest URL is present at all. src/scripts/sentry.ts only initialises when PROD && dsn, so a renamed or unset GitHub Actions variable named PUBLIC_AUT_SENTRY_WEB_DSN yields a green build and a silent dark monitor. Check that repository variable'\''s name; the application code is not what went missing.\n' "$label"
    return 1
  fi
  while IFS= read -r id; do
    [[ -n $id ]] || continue
    found+=("$id")
    if [[ $id != "$EXPECTED_SENTRY_PROJECT_ID" ]]; then
      unexpected+=("$id")
    fi
  done <<< "$ids_raw"
  found_list=$(IFS=,; printf '%s' "${found[*]}")
  if (( ${#unexpected[@]} > 0 )); then
    printf 'bundle %s carries a Sentry DSN for project %s, expected %s (%s) — errors would go to the WRONG project. A DSN is present, so this is not the missing-variable failure; PUBLIC_AUT_SENTRY_WEB_DSN is a DSN for a different project than %s.\n' \
      "$label" "$found_list" "$EXPECTED_SENTRY_PROJECT_ID" "$EXPECTED_SENTRY_PROJECT_SLUG" "$EXPECTED_SENTRY_PROJECT_SLUG"
    return 1
  fi
  printf 'bundle %s carries a Sentry DSN for expected project %s (%s) — error monitoring is live on the right project\n' \
    "$label" "$EXPECTED_SENTRY_PROJECT_ID" "$EXPECTED_SENTRY_PROJECT_SLUG"
}

check_sentry_live() {
  local url="${BASE_URL}/" rc=0 script combined
  local -a scripts=()
  fetch_body "$url" || return 1
  # Same-origin JS the homepage actually loads. Sentry, when the DSN is
  # present, is an /_astro/ chunk. When PUBLIC_AUT_SENTRY_WEB_DSN is unset
  # or renamed, Sentry is tree-shaken and only /assets/js/main.js ships —
  # so a check that requires /_astro/*.js would blame the page for not
  # rendering, which is the wrong diagnosis for the failure this exists
  # to catch.
  while IFS= read -r script; do
    [[ -n $script ]] || continue
    scripts+=("$script")
  done < <(grep -oE '/(_astro|assets)/[^"[:space:]>]+\.js' "$BODY_FILE" | sort -u || true)
  rm -f "$BODY_FILE"
  if (( ${#scripts[@]} == 0 )); then
    printf 'could not find a /_astro/*.js or /assets/*.js bundle on %s — the page did not render as expected\n' "$url"
    return 1
  fi
  combined=$(need_tmp)
  : >"$combined"
  for script in "${scripts[@]}"; do
    if ! fetch_body "${BASE_URL}${script}"; then
      rm -f "$combined"
      return 1
    fi
    cat "$BODY_FILE" >>"$combined"
    rm -f "$BODY_FILE"
  done
  sentry_bundle_verdict "$combined" "${scripts[*]}" || rc=$?
  rm -f "$combined"
  return "$rc"
}

# --assert-sentry-bundle <js-file> — run sentry_bundle_verdict against a local
# copy or fixture. Does not fetch production. Exit 0 pass, 1 fail.
assert_sentry_bundle_file() {
  local path=$1 detail
  [[ -n $path ]] || arg_error "--assert-sentry-bundle requires a path to a JavaScript bundle"
  [[ -f $path && -r $path ]] || arg_error "bundle file is not readable: \"$path\""
  if detail=$(sentry_bundle_verdict "$path" "$path"); then
    log "PASS  $detail"
    return 0
  fi
  log "FAIL  $detail"
  return 1
}

# tls_expiry_ok <expiry-epoch> <min-days> [now-epoch]
# The TLS expiry POLICY in isolation: is the certificate still valid MORE THAN
# min_days out from now? Extracted from check_tls so --self-test can drive both
# directions without a network — the handshake half of check_tls needs a real
# trust store, which a local fixture cannot provide. Returns 0 when the expiry
# clears the threshold, 1 when it does not.
tls_expiry_ok() {
  local expiry_epoch=$1 min_days=$2 now_epoch=${3:-$(date +%s)}
  (( expiry_epoch > now_epoch + min_days * 86400 ))
}

parse_tls_expiry() {
  date -d "${1#notAfter=}" +%s 2>/dev/null
}

check_tls() {
  # -verify_return_error makes s_client exit non-zero unless the presented
  # chain verifies against the system trust store (expiry, wrong host and
  # untrusted roots all land here).
  local endline expiry_iso expiry_epoch now_epoch days_left
  local tls_target="$HOST_PORT"
  case "$tls_target" in
    *:*) : ;;                 # explicit port already present
    *)  tls_target="${tls_target}:443" ;;
  esac
  if ! endline=$(printf '' | openssl s_client -servername "$HOST" -connect "$tls_target" -verify_return_error 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null); then
    printf 'TLS handshake with %s failed or the certificate chain could not be verified against system roots — expired, misnamed or untrusted certificate\n' "$tls_target"
    return 1
  fi
  expiry_iso=${endline#notAfter=}
  expiry_epoch=$(parse_tls_expiry "$endline") || {
    printf 'could not parse certificate expiry date \"%s\" for %s\n' "$expiry_iso" "$HOST"
    return 1
  }
  now_epoch=$(date +%s)
  days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
  if ! tls_expiry_ok "$expiry_epoch" "$TLS_MIN_DAYS" "$now_epoch"; then
    printf 'certificate for %s expires %s — only %s day(s) out, renewal threshold is MORE THAN %s days\n' \
      "$HOST" "$expiry_iso" "$days_left" "$TLS_MIN_DAYS"
    return 1
  fi
  printf 'certificate for %s is trusted and expires %s (%s days out, threshold >%s)\n' \
    "$HOST" "$expiry_iso" "$days_left" "$TLS_MIN_DAYS"
}

# Confirm THIS MACHINE can do the job before asserting anything about the site.
#
# Every probe needs temp files. If the temp filesystem is out of space or
# inodes, mktemp returns empty, redirections fail, and curl gets blamed — the
# run then reports "page / answers 200 — gave up after 90s" about a perfectly
# healthy site. A false production incident, reached by retrying a condition
# that retrying cannot fix.
#
# It has to be checked HERE rather than at each call site: the probes run
# inside command substitutions, so an `exit` in one of them kills the subshell
# and the run carries on regardless. Verified against a real /tmp inode
# exhaustion on the build box, 2026-08-22.
#
# The directory itself is created (and its failure handled) up front, before
# main; this preflight additionally proves files can be WRITTEN there.
preflight() {
  local probe
  probe=$(need_tmp)
  if ! printf 'probe\n' >"$probe" 2>/dev/null; then
    rm -f "$probe"
    printf 'FATAL: %s is not writable — nothing has been checked.\n' "${TMPDIR:-/tmp}" >&2
    exit 3
  fi
  rm -f "$probe"
}

# --- self-test ------------------------------------------------------------
#
# `--self-test` proves the checker itself can still fail AND can still pass.
# A check that can no longer fail is worse than no check: deploy.yml and
# uptime.yml both call THIS script, so a silently-green check mutes the deploy
# gate and the uptime monitor at once (measured defect, 2026-08-30). A check
# that can never succeed is as broken, and a dead-address self-test cannot see
# it — a red check against a dead address looks identical to a correct one.
#
# Each independently-failable assertion gets an isolated FAIL fixture and a
# passing control on a server bound to 127.0.0.1 only (never 0.0.0.0 — this box
# is shared). A permanently-green assertion fails the first direction; a
# permanently-red assertion fails the second.
#
# The TLS check's trust-chain half (openssl s_client against system roots)
# cannot have both directions faked locally: a self-signed fixture is,
# correctly, untrusted. Date parsing and the strict TLS_MIN_DAYS boundary are
# driven locally; trust-chain verification remains live-only and is exercised
# by deploy.yml, uptime.yml and every ordinary production run.

find_free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

# start_fixture_server <port> — write and launch the local fixture server.
start_fixture_server() {
  local server_file=$RUN_TMP_DIR/selftest-server.py
  cat >"$server_file" <<'PY'
import http.server, json, os, sys
SCENARIO = os.environ["SELFTEST_SCENARIO"]
def load():
    with open(SCENARIO, encoding="utf-8") as fh:
        return json.load(fh)
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        sc = load()
        entry = sc.get("routes", {}).get(self.path, sc.get("default", {"status": 404, "body": ""}))
        body = entry.get("body", "").encode("utf-8")
        self.send_response(int(entry.get("status", 200)))
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(entry.get("declared_length", len(body))))
        self.end_headers()
        self.wfile.write(body)
        if "declared_length" in entry:
            self.close_connection = True
    def log_message(self, *args):
        pass
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
PY
  SELFTEST_SCENARIO=$RUN_TMP_DIR/selftest-scenario.json
  export SELFTEST_SCENARIO
  printf '{"routes":{},"default":{"status":404,"body":""}}\n' >"$SELFTEST_SCENARIO"
  python3 "$server_file" "$1" &
  SELFTEST_SERVER_PID=$!
}

# self_test_scenario <json> — replace the fixture server's response map. The
# server re-reads this file on every request, so one server serves all 18
# fixtures in turn without a restart.
self_test_scenario() {
  printf '%s\n' "$1" >"$SELFTEST_SCENARIO"
}

self_test_route_scenario() {
  local route=$1 status=$2 body=$3 declared_length=${4:-}
  body=${body//\\/\\\\}
  body=${body//\"/\\\"}
  body=${body//$'\n'/\\n}
  if [[ -n $declared_length ]]; then
    printf '{"routes":{"%s":{"status":%s,"body":"%s","declared_length":%s}},"default":{"status":404,"body":""}}\n' \
      "$route" "$status" "$body" "$declared_length" >"$SELFTEST_SCENARIO"
  else
    printf '{"routes":{"%s":{"status":%s,"body":"%s"}},"default":{"status":404,"body":""}}\n' \
      "$route" "$status" "$body" >"$SELFTEST_SCENARIO"
  fi
}

# self_test_expect <expected> <label> <fn> [args...]
# Run one check directly (no poll_check retry budget) and assert its result is
# the expected direction. Records a failure in SELF_TEST_FAILURES and always
# returns 0 so a red direction never aborts the whole self-test under set -e.
self_test_expect() {
  local expected=$1 label=$2 fn=$3
  shift 3
  local detail rc=0 first
  if detail=$("$fn" "$@" 2>&1); then rc=0; else rc=$?; fi
  first=$(printf '%s\n' "$detail" | head -1)
  [[ -n $first ]] || first='(no output)'
  if [[ $expected == fail ]]; then
    if (( rc == 0 )); then
      log "SELFTEST FAIL  ${label} — expected to FAIL but PASSED: ${first}"
      SELF_TEST_FAILURES+=("${label} (fail direction)")
    else
      log "SELFTEST PASS  ${label} — fails as it must: ${first}"
    fi
  else
    if (( rc != 0 )); then
      log "SELFTEST FAIL  ${label} — expected to PASS but FAILED: ${first}"
      SELF_TEST_FAILURES+=("${label} (pass direction)")
    else
      log "SELFTEST PASS  ${label} — passes as it must: ${first}"
    fi
  fi
}

self_test() {
  local port server_ready i pid canonical_url security_valid security_body
  port=$(find_free_port) || { printf 'SELF-TEST FATAL: cannot find a free local port\n' >&2; exit 3; }
  start_fixture_server "$port"

  server_ready=0
  for i in $(seq 1 50); do
    if curl -sS -o /dev/null --max-time 2 "http://127.0.0.1:${port}/" 2>/dev/null; then
      server_ready=1
      break
    fi
    sleep 0.1
  done
  if (( server_ready == 0 )); then
    printf 'SELF-TEST FATAL: fixture server on 127.0.0.1:%s did not come up\n' "$port" >&2
    exit 3
  fi

  BASE_URL="http://127.0.0.1:${port}"
  HOST='127.0.0.1'
  HOST_PORT="127.0.0.1:${port}"

  log "Self-test: driving 26 independently-failable assertions across 10 checks on ${BASE_URL}"
  log "(fixtures use 127.0.0.1 only; the TLS trust-chain assertion remains live-only)"
  log ""

  # Shared HTTP assertions: exercise each implementation branch once, not once per caller.
  self_test_route_scenario "/" 200 "short" 100
  self_test_expect fail "HTTP status probe completes its transfer" probe_status "${BASE_URL}/" 200
  self_test_route_scenario "/" 200 "complete"
  self_test_expect pass "HTTP status probe completes its transfer" probe_status "${BASE_URL}/" 200

  self_test_route_scenario "/" 418 "teapot"
  self_test_expect fail "HTTP status probe enforces the expected final status" probe_status "${BASE_URL}/" 200
  self_test_route_scenario "/" 200 "ok"
  self_test_expect pass "HTTP status probe enforces the expected final status" probe_status "${BASE_URL}/" 200

  self_test_route_scenario "/" 404 "missing"
  self_test_expect fail "page check requires HTTP 200" check_route "/"
  self_test_route_scenario "/" 200 "ok"
  self_test_expect pass "page check requires HTTP 200" check_route "/"

  self_test_scenario '{"routes":{},"default":{"status":200,"body":"soft 404 page"}}'
  self_test_expect fail "unknown-path check requires a real HTTP 404" check_not_found
  self_test_scenario '{"routes":{},"default":{"status":404,"body":""}}'
  self_test_expect pass "unknown-path check requires a real HTTP 404" check_not_found

  self_test_route_scenario "/body" 200 "short" 100
  self_test_expect fail "body fetch completes its transfer" fetch_body "${BASE_URL}/body"
  self_test_route_scenario "/body" 200 "complete"
  self_test_expect pass "body fetch completes its transfer" fetch_body "${BASE_URL}/body"

  self_test_route_scenario "/body" 404 "complete"
  self_test_expect fail "body fetch requires HTTP 200" fetch_body "${BASE_URL}/body"
  self_test_route_scenario "/body" 200 "complete"
  self_test_expect pass "body fetch requires HTTP 200" fetch_body "${BASE_URL}/body"

  # Content assertions. Every fail fixture changes one rule from its valid control.
  self_test_route_scenario "/llms.txt" 200 ""
  self_test_expect fail "llms.txt body is non-empty" check_llms_txt
  self_test_route_scenario "/llms.txt" 200 "# automancer"
  self_test_expect pass "llms.txt body is non-empty" check_llms_txt

  self_test_route_scenario "/sitemap-index.xml" 200 "this is not xml"
  self_test_expect fail "sitemap is well-formed XML" check_sitemap
  self_test_route_scenario "/sitemap-index.xml" 200 "<sitemapindex><sitemap><loc>https://automancer.uk/sitemap-0.xml</loc></sitemap></sitemapindex>"
  self_test_expect pass "sitemap is well-formed XML" check_sitemap

  self_test_route_scenario "/agent.json" 200 "{ not json"
  self_test_expect fail "agent manifest is valid JSON" check_agent_manifest
  self_test_route_scenario "/agent.json" 200 "{}"
  self_test_expect pass "agent manifest is valid JSON" check_agent_manifest

  canonical_url="${BASE_URL}${SECURITY_TXT_PATH}"
  security_valid="Contact: mailto:security@automancer.uk
Expires: 2099-01-01T00:00:00Z
Preferred-Languages: en
Canonical: ${canonical_url}
"
  HOST='automancer.uk'

  security_body="Expires: 2099-01-01T00:00:00Z
Preferred-Languages: en
Canonical: ${canonical_url}
"
  self_test_route_scenario "/security.txt" 200 "$security_body"
  self_test_expect fail "security.txt requires Contact" check_security_txt
  self_test_route_scenario "/security.txt" 200 "$security_valid"
  self_test_expect pass "security.txt requires Contact" check_security_txt

  security_body="Contact: mailto:security@automancer.uk
Preferred-Languages: en
Canonical: ${canonical_url}
"
  self_test_route_scenario "/security.txt" 200 "$security_body"
  self_test_expect fail "security.txt requires Expires" check_security_txt
  self_test_route_scenario "/security.txt" 200 "$security_valid"
  self_test_expect pass "security.txt requires Expires" check_security_txt

  security_body="Contact: mailto:security@automancer.uk
Expires: 2099-01-01T00:00:00Z
Canonical: ${canonical_url}
"
  self_test_route_scenario "/security.txt" 200 "$security_body"
  self_test_expect fail "security.txt requires Preferred-Languages" check_security_txt
  self_test_route_scenario "/security.txt" 200 "$security_valid"
  self_test_expect pass "security.txt requires Preferred-Languages" check_security_txt

  security_body="Contact: mailto:security@automancer.uk
Expires: 2099-01-01T00:00:00Z
Preferred-Languages: en
"
  self_test_route_scenario "/security.txt" 200 "$security_body"
  self_test_expect fail "security.txt requires Canonical" check_security_txt
  self_test_route_scenario "/security.txt" 200 "$security_valid"
  self_test_expect pass "security.txt requires Canonical" check_security_txt

  security_body="Contact: mailto:security@automancer.uk
Expires: not-a-date
Preferred-Languages: en
Canonical: ${canonical_url}
"
  self_test_route_scenario "/security.txt" 200 "$security_body"
  self_test_expect fail "security.txt Expires is parseable" check_security_txt
  self_test_route_scenario "/security.txt" 200 "$security_valid"
  self_test_expect pass "security.txt Expires is parseable" check_security_txt

  security_body="Contact: mailto:security@automancer.uk
Expires: 2020-01-01T00:00:00Z
Preferred-Languages: en
Canonical: ${canonical_url}
"
  self_test_route_scenario "/security.txt" 200 "$security_body"
  self_test_expect fail "security.txt Expires is in the future" check_security_txt
  self_test_route_scenario "/security.txt" 200 "$security_valid"
  self_test_expect pass "security.txt Expires is in the future" check_security_txt

  HOST='127.0.0.1'
  security_body="Contact: mailto:security@automancer.uk
Expires: 2099-01-01T00:00:00Z
Preferred-Languages: en
Canonical: /security.txt
"
  self_test_route_scenario "/security.txt" 200 "$security_body"
  self_test_expect fail "security.txt Canonical is an absolute HTTP(S) URL" check_security_txt
  self_test_route_scenario "/security.txt" 200 "$security_valid"
  self_test_expect pass "security.txt Canonical is an absolute HTTP(S) URL" check_security_txt

  HOST='automancer.uk'
  security_body="Contact: mailto:security@automancer.uk
Expires: 2099-01-01T00:00:00Z
Preferred-Languages: en
Canonical: https://example.com/security.txt
"
  self_test_route_scenario "/security.txt" 200 "$security_body"
  self_test_expect fail "security.txt Canonical matches the served URL" check_security_txt
  self_test_route_scenario "/security.txt" 200 "$security_valid"
  self_test_expect pass "security.txt Canonical matches the served URL" check_security_txt
  HOST='127.0.0.1'

  self_test_route_scenario "/" 200 "<html><body>nothing to see</body></html>"
  self_test_expect fail "homepage contains its structural anchor" check_homepage_anchor
  self_test_route_scenario "/" 200 "<html><body>Company No. 17060907</body></html>"
  self_test_expect pass "homepage contains its structural anchor" check_homepage_anchor

  EXPECTED_REVISION='abc1234'
  self_test_route_scenario "/" 200 "<html><body>no build marker</body></html>"
  self_test_expect fail "homepage exposes a build revision" check_revision
  self_test_route_scenario "/" 200 "<span>build:</span><b>abc1234</b>"
  self_test_expect pass "homepage exposes a build revision" check_revision

  self_test_route_scenario "/" 200 "<span>build:</span><b>def5678</b>"
  self_test_expect fail "served build revision matches the expected deploy" check_revision
  self_test_route_scenario "/" 200 "<span>build:</span><b>abc1234</b>"
  self_test_expect pass "served build revision matches the expected deploy" check_revision

  # Sentry fixtures carry an ingest HOST + project path, never a key. A full
  # DSN is credential-shaped even when semi-public; these strings are not.
  # The pass-direction project id MUST equal EXPECTED_SENTRY_PROJECT_ID —
  # any other id (including a real sibling project in the same org) is a
  # failure. The wrong-project fixture uses 4511769883574352, which is a
  # different project in org automancer, so "any ingest URL" would pass it.
  self_test_scenario '{"routes":{"/":{"status":200,"body":"<html><body>no bundle reference</body></html>"},"/_astro/app.js":{"status":200,"body":"const dsn=o4511673494732800.ingest.de.sentry.io/4511769898647632"}},"default":{"status":404,"body":""}}'
  self_test_expect fail "homepage exposes an Astro JavaScript bundle" check_sentry_live
  self_test_scenario '{"routes":{"/":{"status":200,"body":"<script src=/_astro/app.js></script>"},"/_astro/app.js":{"status":200,"body":"const dsn=o4511673494732800.ingest.de.sentry.io/4511769898647632"}},"default":{"status":404,"body":""}}'
  self_test_expect pass "homepage exposes an Astro JavaScript bundle" check_sentry_live

  self_test_scenario '{"routes":{"/":{"status":200,"body":"<script src=/_astro/app.js></script>"},"/_astro/app.js":{"status":200,"body":"no DSN here"}},"default":{"status":404,"body":""}}'
  self_test_expect fail "bundle contains a Sentry ingest DSN" check_sentry_live
  self_test_scenario '{"routes":{"/":{"status":200,"body":"<script src=/_astro/app.js></script>"},"/_astro/app.js":{"status":200,"body":"const dsn=o4511673494732800.ingest.de.sentry.io/4511769898647632"}},"default":{"status":404,"body":""}}'
  self_test_expect pass "bundle contains a Sentry ingest DSN" check_sentry_live

  self_test_scenario '{"routes":{"/":{"status":200,"body":"<script src=/_astro/app.js></script>"},"/_astro/app.js":{"status":200,"body":"const dsn=o4511673494732800.ingest.de.sentry.io/4511769883574352"}},"default":{"status":404,"body":""}}'
  self_test_expect fail "bundle DSN is the expected Sentry project automancer-site" check_sentry_live
  self_test_scenario '{"routes":{"/":{"status":200,"body":"<script src=/_astro/app.js></script>"},"/_astro/app.js":{"status":200,"body":"const dsn=o4511673494732800.ingest.de.sentry.io/4511769898647632"}},"default":{"status":404,"body":""}}'
  self_test_expect pass "bundle DSN is the expected Sentry project automancer-site" check_sentry_live

  # Rename case: sentry.ts still reads PUBLIC_AUT_SENTRY_WEB_DSN, so a
  # differently-named CI variable produces a production build with Sentry
  # tree-shaken out. Only /assets/js/main.js ships. That must fail naming
  # the variable, not "the page did not render".
  self_test_scenario '{"routes":{"/":{"status":200,"body":"<script src=/assets/js/main.js></script>"},"/assets/js/main.js":{"status":200,"body":"console.log(1)"}},"default":{"status":404,"body":""}}'
  self_test_expect fail "renamed PUBLIC_AUT_SENTRY_WEB_DSN leaves no ingest DSN" check_sentry_live
  self_test_scenario '{"routes":{"/":{"status":200,"body":"<script src=/_astro/app.js></script>"},"/_astro/app.js":{"status":200,"body":"const dsn=o4511673494732800.ingest.de.sentry.io/4511769898647632"}},"default":{"status":404,"body":""}}'
  self_test_expect pass "renamed PUBLIC_AUT_SENTRY_WEB_DSN leaves no ingest DSN" check_sentry_live

  self_test_expect fail "TLS certificate expiry date is parseable" parse_tls_expiry "notAfter=not-a-date"
  self_test_expect pass "TLS certificate expiry date is parseable" parse_tls_expiry "notAfter=Jan 1 00:00:00 2099 GMT"

  self_test_expect fail "TLS certificate expiry is strictly more than ${TLS_MIN_DAYS} days away" \
    tls_expiry_ok "$((2000000000 + TLS_MIN_DAYS * 86400))" "$TLS_MIN_DAYS" 2000000000
  self_test_expect pass "TLS certificate expiry is strictly more than ${TLS_MIN_DAYS} days away" \
    tls_expiry_ok "$((2000000000 + TLS_MIN_DAYS * 86400 + 1))" "$TLS_MIN_DAYS" 2000000000

  # Tear the fixture server down by pid and prove it is gone.
  pid=$SELFTEST_SERVER_PID
  kill "$pid" 2>/dev/null
  SELFTEST_SERVER_PID=''
  for i in $(seq 1 50); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 "$pid" 2>/dev/null; then
    printf 'SELF-TEST FATAL: fixture server (pid %s) refused to stop\n' "$pid" >&2
    exit 3
  fi
  log ""
  log "Fixture server on 127.0.0.1:${port} (pid ${pid}) stopped and gone."

  log ""
  if (( ${#SELF_TEST_FAILURES[@]} > 0 )); then
    log "SELF-TEST RESULT: ${#SELF_TEST_FAILURES[@]} direction(s) FAILED:"
    for i in "${SELF_TEST_FAILURES[@]}"; do log "  - $i"; done
    exit 1
  fi
  log "SELF-TEST RESULT: all 26 locally isolatable assertions across 10 checks can fail AND can pass."
}
main() {
  if [[ ${1:-} == '--self-test' ]]; then
    [[ $# -eq 1 ]] || arg_error "--self-test takes no arguments (got $#)"
    preflight
    self_test
    return
  fi
  if [[ ${1:-} == '--assert-sentry-bundle' ]]; then
    [[ $# -eq 2 ]] || arg_error "--assert-sentry-bundle requires exactly one path (got $# arguments)"
    preflight
    assert_sentry_bundle_file "$2"
    return
  fi
  if [[ ${1:-} == '--expected-revision' ]]; then
    [[ $# -ge 2 ]] || arg_error "--expected-revision requires a Git SHA"
    validate_expected_revision "$2"
    shift 2
  fi
  validate_base_url "$@"
  preflight
  log "Verifying ${BASE_URL} (each check retries for up to ${DEADLINE_SECS}s before failing)"
  log ""

  # A failed check must not abort the run under `set -e`: one red run should
  # report EVERYTHING that is wrong, not just the first thing. poll_check
  # records each failure in FAILED_CHECKS; the summary below decides the
  # exit status.
  #
  # Every independently-failable assertion below has an isolated fail+pass
  # fixture in self_test(). Add an assertion here and add its fixture there.
  local route
  for route in "${ROUTES[@]}"; do
    if ! poll_check "page ${route} answers 200" check_route "$route"; then :; fi
  done
  if ! poll_check "unknown path answers a REAL 404 (not a soft 404)" check_not_found; then :; fi
  if ! poll_check "${LLMS_PATH} answers 200 with a non-empty body" check_llms_txt; then :; fi
  if ! poll_check "${SITEMAP_PATH} answers 200 and parses as XML" check_sitemap; then :; fi
  if ! poll_check "${AGENT_MANIFEST_PATH} answers 200 and parses as JSON" check_agent_manifest; then :; fi
  if ! poll_check "${SECURITY_TXT_PATH} answers 200 and satisfies RFC 9116" check_security_txt; then :; fi
  if ! poll_check "homepage contains structural anchor \"${HOMEPAGE_ANCHOR}\"" check_homepage_anchor; then :; fi
  if [[ -n $EXPECTED_REVISION ]]; then
    if ! poll_check "homepage serves expected build revision ${EXPECTED_REVISION}" check_revision; then :; fi
  fi
  if ! poll_check "error monitoring is live on Sentry project ${EXPECTED_SENTRY_PROJECT_SLUG} (${EXPECTED_SENTRY_PROJECT_ID})" check_sentry_live; then :; fi
  if ! poll_check "TLS certificate valid and expires >${TLS_MIN_DAYS} days out" check_tls; then :; fi

  log ""
  if (( ${#FAILED_CHECKS[@]} > 0 )); then
    log "RESULT: ${#FAILED_CHECKS[@]} check(s) FAILED against ${BASE_URL}:"
    local c
    for c in "${FAILED_CHECKS[@]}"; do
      log "  - $c"
    done
    exit 1
  fi
  log "RESULT: all checks passed against ${BASE_URL}"
}

main "$@"
