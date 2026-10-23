#!/usr/bin/env bash
# Upload ops/edge/worker.js to Cloudflare through Executor (no local token).
#
#   ops/edge/deploy.sh [script-name]     default: automancer-site-edge
#
# The Executor gateway cannot send a module upload (its multipart part loses
# the module media type), so this uploads the same code in service-worker
# form: the two `export` keywords are dropped and a fetch listener calls the
# module's handler. tests/edge-worker.test.ts tests the module itself.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
readonly CF_ACCOUNT=d974bcbc49ae64c2675c1ff7f410ba94            # Automancer account; owns the automancer.uk zone
readonly EXECUTOR_ACCOUNT=acc_64a83ca1-7690-43cb-86c7-287ef67135ec # Executor "Waseem Cloudflare"
script=${1:-automancer-site-edge}

code=$(sed -e 's/^export function /function /' -e 's/^export default {/const handler = {/' "$here/worker.js")
grep -q '^export' <<<"$code" && { echo "deploy.sh: an export survived the transform" >&2; exit 1; }
code+=$'\n'"addEventListener('fetch', (e) => e.respondWith(handler.fetch(e.request)));"

CODE=$code python3 -c '
import json, os, sys
print(json.dumps({"accountId": sys.argv[1], "input": {
  "path": {"account_id": sys.argv[2], "script_name": sys.argv[3]},
  "contentType": "application/javascript", "body": os.environ["CODE"]}}))
' "$EXECUTOR_ACCOUNT" "$CF_ACCOUNT" "$script" |
  executor-tool call 'tools["cloudflare-full-access"].workerScript.workerScriptUploadWorkerModule' - |
  python3 -c 'import json,sys; r=json.load(sys.stdin); ok=r.get("success"); print("uploaded" if ok else r); sys.exit(0 if ok else 1)'
