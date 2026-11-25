#!/usr/bin/env bash
# Which release each page a browser gets from automancer.uk was built by (t26545).
#
# Reads every page in the served sitemap and asks for each once, as a browser does (Accept:
# text/html, Accept-Encoding: br). GitHub Pages dates every file of a release with the same
# Last-Modified, the moment that release was published, and the edge Worker keeps a page's own
# headers with its copy (keptPage, t25774). So a page answered with an older Last-Modified than
# Pages' own is a copy kept from an earlier release. Prints per page the data centre, the
# Worker's X-Edge-Cache (hit, miss, reload, release) and whether the page is the live release,
# then how many were behind.
#
#   ops/perf/kept-release.sh [base-url=https://automancer.uk]
#
# Every view makes the Worker fetch the page again after answering, so running it twice in a row
# reads fresh copies the second time: the first run at a data centre is the one that measures.
# Different machines reach different data centres (cf-ray's suffix). Exits 1 when any page is
# behind.
set -euo pipefail
base=${1:-https://automancer.uk}
base=${base%/}
pages_origin=https://automancer-ltd.github.io/automancer-site
live=$(curl -sSI --max-time 15 "$pages_origin/robots.txt" | grep -i '^last-modified:' | cut -d' ' -f2- | tr -d '\r')
[[ -n $live ]] || { echo "Pages sent no Last-Modified" >&2; exit 1; }
live_s=$(date -ud "$live" +%s)
echo "live release published $(date -ud "@$live_s" '+%F %T') UTC"
pages=$(curl -sS --max-time 15 "$base/sitemap-0.xml" | grep -o '<loc>[^<]*</loc>' | sed -E 's#</?loc>##g; s#^https://automancer.uk##')
[[ -n $pages ]] || { echo "no pages in $base/sitemap-0.xml" >&2; exit 1; }
behind=0
total=0
for p in $pages; do
  out=$(curl -sS --max-time 15 -o /dev/null -D - -H 'Accept: text/html' -H 'Accept-Encoding: br' "$base$p")
  header() { grep -i "^$1:" <<<"$out" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
  colo=$(header cf-ray); colo=${colo##*-}
  cache=$(header x-edge-cache)
  modified=$(header last-modified)
  total=$((total + 1))
  if [[ -n $modified ]] && (( $(date -ud "$modified" +%s) < live_s )); then
    behind=$((behind + 1))
    state="behind (from $(date -ud "$modified" '+%F %T'))"
  else
    state=live
  fi
  printf '%s\t%s\t%s\t%s\n' "$colo" "${cache:--}" "$state" "$p"
done
echo "$behind of $total pages behind the live release"
(( behind == 0 ))
