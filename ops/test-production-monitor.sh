#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
service="$root/ops/systemd/user/automancer-site-production-verify.service"
timer="$root/ops/systemd/user/automancer-site-production-verify.timer"
deploy="$root/ops/deploy-production-monitor.sh"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/automancer-site-monitor-test.XXXXXXXX")
trap 'rm -rf -- "$scratch"' EXIT

grep -Fqx 'ExecStart=/opt/automancer/auto/automancer-detectors/site/ops/verify-production.sh https://automancer.uk' "$service"
grep -Fqx 'OnFailure=alert-email@%n.service' "$service"
grep -Fqx 'TimeoutStartSec=25min' "$service"
grep -Fqx 'OnCalendar=*:0/30' "$timer"
grep -Fqx 'Persistent=true' "$timer"
grep -Fqx 'AccuracySec=1min' "$timer"

AUTOMANCER_USER_UNIT_DIR="$scratch/units" "$deploy" --preflight-only >/dev/null

mkdir -p "$scratch/units"
ln -s "$scratch/missing.service" "$scratch/units/wick-release-notes-catchup.service"
if AUTOMANCER_USER_UNIT_DIR="$scratch/units" "$deploy" --preflight-only >"$scratch/out" 2>"$scratch/err"; then
  printf 'expected dangling release-note unit preflight to fail\n' >&2
  exit 1
fi
grep -Fq 'Resolve AUT-9801 first' "$scratch/err"

printf 'production monitor unit and deployment preflight tests passed\n'
