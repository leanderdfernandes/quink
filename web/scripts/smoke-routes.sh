#!/usr/bin/env bash
# Routing smoke test against a REAL deployment. Nothing here can be checked locally:
# `vite dev` does the SPA fallback itself, so every one of these passes in dev whatever
# vercel.json says. This is production-only by construction.
#
#   ./scripts/smoke-routes.sh https://www.quink.online
#   ./scripts/smoke-routes.sh https://quink-<hash>-<team>.vercel.app     # a preview
#
# TWO THINGS ARE BEING PROVEN, and they pull against each other:
#
#   1. Every client-side route serves index.html rather than Vercel's own 404. Without the
#      fallback rewrite, /claim/:token and /invite/:token — the entire cold-outreach and
#      teammate-invite funnels, and the OAuth redirect back to both — are dead links, and
#      so is every article URL a customer shares.
#
#   2. The four legal pages still serve their STATIC markup, not the SPA shell. Vercel
#      applies rewrites only after the filesystem check, so `/(.*)` -> /index.html does not
#      touch them — but that is a property of the platform, not of our config, and the
#      day it changes nothing in a browser would look wrong. Google's OAuth review and
#      Razorpay's activation review both fetch these URLs directly, and an empty
#      <div id="root"> is what they would get.
#
# The failure mode this exists for was real: an exclusion list was added to the rewrite
# source to "protect" the legal pages, and it silently stopped matching anything at all —
# every deep link 404'd in production for six days while the legal pages, which needed no
# protecting, were fine. Do not reintroduce it.
set -u

BASE="${1:-}"
if [ -z "$BASE" ]; then
  echo "usage: $0 https://deployment-url" >&2
  exit 2
fi
BASE="${BASE%/}"

SPA_MARKER='<div id="root">'
# Present on every generated legal page and on nothing the SPA serves.
STATIC_MARKER='<link rel="canonical"'

fails=0

check() { # path  expected_status  spa|static
  local path="$1" want_status="$2" want_kind="$3"
  local body status kind
  body="$(curl -sS -w $'\n%{http_code}' "$BASE$path" 2>/dev/null)" || { echo "FAIL  $path  (request failed)"; fails=$((fails + 1)); return; }
  status="${body##*$'\n'}"
  body="${body%$'\n'*}"

  case "$body" in
    *"$STATIC_MARKER"*) kind=static ;;
    *"$SPA_MARKER"*) kind=spa ;;
    *) kind=neither ;;
  esac

  if [ "$status" = "$want_status" ] && [ "$kind" = "$want_kind" ]; then
    printf 'PASS  %-34s %s  %s\n' "$path" "$status" "$kind"
  else
    printf 'FAIL  %-34s %s (want %s)  %s (want %s)\n' "$path" "$status" "$want_status" "$kind" "$want_kind"
    fails=$((fails + 1))
  fi
}

echo "== $BASE =="

# --- the SPA, including paths with no file behind them -------------------------------
check /                          200 spa
check /app                       200 spa
# A token that does not exist must still reach the app: the invalid-token SCREEN is the
# correct answer, and it can only render if index.html was served.
check /claim/does-not-exist      200 spa
check /invite/does-not-exist     200 spa
# The reader runs on this same deployment (subdomains and customer domains point at this
# Vercel project), so an article path has to fall back too.
check /some-article-slug         200 spa

# --- the four legal pages, which must NOT be the SPA ---------------------------------
check /privacy                   200 static
check /terms                     200 static
check /refunds                   200 static
check /contact                   200 static

# --- static assets are still served from the filesystem ------------------------------
robots_status="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/robots.txt")"
if [ "$robots_status" = "200" ]; then
  printf 'PASS  %-34s 200  file\n' /robots.txt
else
  printf 'FAIL  %-34s %s (want 200)\n' /robots.txt "$robots_status"
  fails=$((fails + 1))
fi

echo
if [ "$fails" -eq 0 ]; then
  echo "routes OK"
else
  echo "$fails FAILED"
fi
exit $((fails > 0))
