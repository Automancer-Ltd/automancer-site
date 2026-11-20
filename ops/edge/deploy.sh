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

python3 -I -c '
import base64, json, sys
account, cf_account, script, date, path, message = sys.argv[1:7]
code = open(path, "rb").read()
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
    # Executor checks this body against the response schema, which requires these read-only
    # fields; Cloudflare sets them itself and ignores what is sent.
    "id": "", "number": 0, "urls": [], "created_on": "",
  }}}))
' "$EXECUTOR_ACCOUNT" "$CF_ACCOUNT" "$script" "$COMPATIBILITY_DATE" "$worker" "$message" |
  executor-tool call 'tools["cloudflare-full-access"].api.versions.createWorkerVersion' - |
  python3 -I -c '
import json, sys
r = json.load(sys.stdin)
v = r.get("result") if isinstance(r, dict) else None
if not (isinstance(r, dict) and r.get("success") and v):
    print(r); sys.exit(1)
print("uploaded and deployed version", v.get("id"), "compatibility_date", v.get("compatibility_date"))
'

# Read back what Cloudflare now runs: the date must be the one sent.
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
print("read back: compatibility_date", want, "flags", s.get("compatibility_flags"))
' "$COMPATIBILITY_DATE"
