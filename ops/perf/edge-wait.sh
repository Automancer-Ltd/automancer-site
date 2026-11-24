#!/usr/bin/env bash
# How long automancer.uk takes to start answering each page, as a browser asks for it (t25774).
#
# Reads every page in the served sitemap, then asks for each once, as a browser does (Accept:
# text/html, Accept-Encoding: br), on a fresh connection, and prints per page the wait from the
# end of the TLS handshake to the first byte of the response, and the edge Worker's X-Edge-Cache
# header (hit, miss or bypass; absent before t25774). Then the median and p75 of the waits.
#
#   ops/perf/edge-wait.sh [base-url=https://automancer.uk] [--label=name] [--reload]
#
# --reload asks as a hard reload does (Cache-Control: no-cache): the Worker fetches each page from
# Pages, keeps that copy at this data centre and answers with it (X-Edge-Cache: reload). The
# deploy's production journey runs it first, so it reads the release just published, not a copy
# kept before it (deploy.yml). It exits 1 when any page does not answer 200.
#
# A page the Worker has to fetch from GitHub Pages waits for Pages' own cache, which for a quiet
# site is mostly cold (Fastly answered MISS minutes after the same file was asked for). To see
# what a visitor who comes some time after the last one waits, run it once to warm what can be
# warmed, wait (15 minutes in t25774), and run it again.
set -euo pipefail
base=${1:-https://automancer.uk}
base=${base%/}
label=run
reload=()
for a in "$@"; do
  case $a in
    --label=*) label=${a#--label=} ;;
    --reload) reload=(-H 'Cache-Control: no-cache' -H 'Pragma: no-cache') ;;
  esac
done
pages=$(curl -sS --max-time 15 "$base/sitemap-0.xml" | grep -o '<loc>[^<]*</loc>' | sed -E 's#</?loc>##g; s#^https://automancer.uk##')
[[ -n $pages ]] || { echo "no pages in $base/sitemap-0.xml" >&2; exit 1; }
waits=()
failed=0
for p in $pages; do
  out=$(curl -sS --max-time 15 -o /dev/null -D - -H 'Accept: text/html' -H 'Accept-Encoding: br' "${reload[@]}" \
    -w 'TIMING %{time_appconnect} %{time_starttransfer} %{http_code} %{size_download}\n' "$base$p")
  read -r _ tls first code size <<<"$(grep '^TIMING' <<<"$out")"
  cache=$(grep -i '^x-edge-cache:' <<<"$out" | tr -d '\r' | awk '{print $2}' || true)
  ms=$(awk -v a="$tls" -v b="$first" 'BEGIN { printf "%d", (b - a) * 1000 }')
  waits+=("$ms")
  [[ $code == 200 ]] || failed=1
  printf '%s\t%s\t%5d ms\t%s\t%s B\t%s\n' "$label" "$code" "$ms" "${cache:--}" "$size" "$p"
done
printf '%s\n' "${waits[@]}" | sort -n | awk -v label="$label" '{ v[NR] = $1 } END {
  printf "%s: %d pages, wait after TLS median %d ms, p75 %d ms, max %d ms\n", label, NR, v[int((NR + 1) / 2)], v[int(NR * 0.75 + 0.5)], v[NR] }'
exit "$failed"
