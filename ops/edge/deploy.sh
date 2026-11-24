#!/usr/bin/env bash
# Upload ops/edge/worker.js to Cloudflare through Executor (no local token) and deploy it.
#
#   ops/edge/deploy.sh [script-name] [worker-file]
#       default: automancer-site-edge ops/edge/worker.js
#
# The Worker goes up as the ES module tests/edge-worker.test.ts tests, byte for byte, on the
# Workers runtime of COMPATIBILITY_DATE (t21891). It uses Cloudflare's JSON Workers API
# (createWorkerVersion, deploy=true), which carries the module and its date in one JSON body. The
# older multipart upload could not go through the Executor gateway (its module part lost its
# media type), so until t21891 this script rewrote the module into a service-worker script with
# no date at all, which Cloudflare runs on its 2021 runtime.
#
# Moving COMPATIBILITY_DATE forward changes runtime behaviour: read the compatibility-flags
# history (developers.cloudflare.com/workers/configuration/compatibility-flags/) for every flag
# that turned on since the old date, rehearse on automancer-site-edge-probe with
# ops/edge/probe-matrix.mjs, and diff it against the live Worker (docs/DEPLOYMENT.md).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
readonly CF_ACCOUNT=d974bcbc49ae64c2675c1ff7f410ba94            # Automancer account; owns the automancer.uk zone
readonly EXECUTOR_ACCOUNT=acc_64a83ca1-7690-43cb-86c7-287ef67135ec # Executor "Waseem Cloudflare"
# The newest date at least three days old when it was set, so a runtime default that changed in
# the last few days has had time to be caught upstream (the same idea as the one-day package
# quarantine in pnpm-workspace.yaml).
readonly COMPATIBILITY_DATE=2026-11-15
script=${1:-automancer-site-edge}
worker=${2:-$here/worker.js}

revision=$(git -C "$here" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)
dirty=$(git -C "$here" status --porcelain -- "$worker" 2>/dev/null || echo outside)
message="$(basename "$worker") at ${revision}${dirty:+ (not as committed)}"
# What this version runs, named on every response it sends (EDGE_SOURCE_HEADER in worker.js,
# t25749). Hashed from the bytes uploaded below, so it is true of a branch or a working copy too,
# and the release verifier (check_edge_source) tells either apart from the file it checks.
edge_source="sha256:$(python3 -I -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$worker")"

python3 -I -c '
import base64, hashlib, json, sys
account, cf_account, script, date, path, message, source = sys.argv[1:8]
code = open(path, "rb").read()
if source != "sha256:" + hashlib.sha256(code).hexdigest():
    sys.exit("worker file changed while deploying; run again")
print(json.dumps({"accountId": account, "input": {
  "path": {"account_id": cf_account, "worker_id": script},
  "query": {"deploy": True},
  "contentType": "application/json",
  "body": {
    "compatibility_date": date,
    "main_module": "worker.js",
    "modules": [{"name": "worker.js", "content_type": "application/javascript+module",
                 "content_base64": base64.b64encode(code).decode()}],
    "annotations": {"workers/message": message},
    # The error tunnel bindings (t24883): the secret SENTRY_KEY is set once per script
    # (workerPutScriptSecret) and carried from version to version, never read here.
    "bindings": [
      {"type": "inherit", "name": "SENTRY_KEY"},
      {"type": "ratelimit", "name": "ERROR_REPORTS", "namespace_id": "24883",
       "simple": {"limit": 10, "period": 60}},
      {"type": "plain_text", "name": "EDGE_SOURCE", "text": source},
    ],
    # Executor checks this body against the response schema, which requires these read-only
    # fields; Cloudflare sets them itself and ignores what is sent.
    "id": "", "number": 0, "urls": [], "created_on": "",
  }}}))
' "$EXECUTOR_ACCOUNT" "$CF_ACCOUNT" "$script" "$COMPATIBILITY_DATE" "$worker" "$message" "$edge_source" |
  executor-tool call 'tools["cloudflare-full-access"].api.versions.createWorkerVersion' - |
  python3 -I -c '
import json, sys
r = json.load(sys.stdin)
v = r.get("result") if isinstance(r, dict) else None
if not (isinstance(r, dict) and r.get("success") and v):
    print(r); sys.exit(1)
print("uploaded and deployed version", v.get("id"), "compatibility_date", v.get("compatibility_date"))
'

# Read back what Cloudflare now runs: the date must be the one sent, and the error tunnel
# bindings must be there (without SENTRY_KEY the Worker keeps no error report).
python3 -I -c '
import json, sys
print(json.dumps({"accountId": sys.argv[1], "input": {"path": {"account_id": sys.argv[2], "script_name": sys.argv[3]}}}))
' "$EXECUTOR_ACCOUNT" "$CF_ACCOUNT" "$script" |
  executor-tool call 'tools["cloudflare-full-access"].api.workerScript.workerScriptGetSettings' - |
  python3 -I -c '
import json, sys
r = json.load(sys.stdin); s = r.get("result", {}) if isinstance(r, dict) else {}
want = sys.argv[1]
if s.get("compatibility_date") != want:
    print("read back compatibility_date", repr(s.get("compatibility_date")), "expected", want); sys.exit(1)
bound = {b.get("name"): b.get("type") for b in s.get("bindings") or []}
if bound.get("SENTRY_KEY") != "secret_text" or bound.get("ERROR_REPORTS") != "ratelimit":
    print("read back bindings", bound, "expected SENTRY_KEY secret_text and ERROR_REPORTS ratelimit (docs/DEPLOYMENT.md, error reports)"); sys.exit(1)
source = {b.get("name"): b.get("text") for b in s.get("bindings") or []}.get("EDGE_SOURCE")
if bound.get("EDGE_SOURCE") != "plain_text" or source != sys.argv[2]:
    print("read back EDGE_SOURCE", repr(source), "expected", sys.argv[2], "(docs/DEPLOYMENT.md, which Worker is live)"); sys.exit(1)
print("read back: compatibility_date", want, "flags", s.get("compatibility_flags"), "bindings", sorted(bound), "EDGE_SOURCE", source)
' "$COMPATIBILITY_DATE" "$edge_source"

# Read back what visitors are served: production names the source just uploaded (t25749). A new
# version reaches every location within seconds; a minute without it means it is not live.
if [[ $script == automancer-site-edge ]]; then
  for _ in $(seq 1 12); do
    served=$(curl -sS --max-time 10 -o /dev/null -D - https://automancer.uk/ |
      python3 -I -c 'import sys; print(next((l.split(":", 1)[1].strip() for l in sys.stdin if l.lower().startswith("x-edge-source:")), ""))')
    if [[ $served == "$edge_source" ]]; then
      echo "read back: https://automancer.uk/ is served by $edge_source"
      exit 0
    fi
    sleep 5
  done
  echo "https://automancer.uk/ names X-Edge-Source '${served:-none}', expected $edge_source" >&2
  exit 1
fi
