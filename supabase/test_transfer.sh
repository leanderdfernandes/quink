#!/usr/bin/env bash
# End-to-end ownership-transfer acceptance run:  bash supabase/test_transfer.sh
#
# The claim link IS the acquisition funnel � we hand a stranger a help center we built for
# their product and it has to be right the first time, with no second attempt. That is worth
# a real end-to-end proof rather than a unit test of claim_kb().
#
# WARNING: this runs against the LIVE project (reads worker/.env + web/.env.local). It
# creates three throwaway users, transfers a KB between them, and deletes them at the end.
# It never touches an existing account: the only pre-existing row it reads is the owner
# profile id, and it grants admin to a THROWAWAY user rather than toggling anyone real.
# Two throwaway NON-ADMIN accounts, because the main account is is_admin and would pass the
# "A loses access" checks for the wrong reason.
set -uo pipefail
cd /c/Qunk

URL=$(grep '^SUPABASE_URL=' worker/.env | cut -d= -f2- | tr -d '\r')
SRV=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' worker/.env | cut -d= -f2- | tr -d '\r')
ANON=$(grep '^VITE_SUPABASE_ANON_KEY=' web/.env.local | cut -d= -f2- | tr -d '"\r')

pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
no()  { fail=$((fail+1)); printf '  \033[31mFAIL\033[0m %s  <%s>\n' "$1" "$2"; }
chk() { if [ "$2" = "$3" ]; then ok "$1"; else no "$1" "got:$2 want:$3"; fi; }

srv=(-H "apikey: $SRV" -H "Authorization: Bearer $SRV" -H "Content-Type: application/json")

mkuser() {
  local em="$1" pw="$2"
  curl -s -X POST "$URL/auth/v1/admin/users" "${srv[@]}" \
    -d "{\"email\":\"$em\",\"password\":\"$pw\",\"email_confirm\":true}" \
    | grep -o '"id":"[0-9a-f-]\{36\}"' | head -1 | cut -d'"' -f4
}
login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4
}

STAMP=$(date +%s)
EA="xfer-a-$STAMP@example.com"; EB="xfer-b-$STAMP@example.com"; PW="Xfer-$STAMP-yZ!"
UA=$(mkuser "$EA" "$PW"); UB=$(mkuser "$EB" "$PW")
TA=$(login "$EA" "$PW");  TB=$(login "$EB" "$PW")
a=(-H "apikey: $ANON" -H "Authorization: Bearer $TA" -H "Content-Type: application/json")
b=(-H "apikey: $ANON" -H "Authorization: Bearer $TB" -H "Content-Type: application/json")
echo "A=$UA  B=$UB"

KBA=$(curl -s "$URL/rest/v1/knowledge_bases?select=id&owner_id=eq.$UA" "${srv[@]}" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
KBB0=$(curl -s "$URL/rest/v1/knowledge_bases?select=id&owner_id=eq.$UB" "${srv[@]}" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "KB(A)=$KBA  KB(B, auto-provisioned)=$KBB0"

# --- A generates an article. The pipeline itself is not exercised (it costs money and
# needs the deployed worker); the DATA SHAPE it produces is reproduced exactly, which is
# what every ownership check below actually reads.
VID="$KBA/source.mp4"
curl -s -o /dev/null -X POST "$URL/storage/v1/object/videos/$VID" \
  -H "apikey: $SRV" -H "Authorization: Bearer $SRV" -H "Content-Type: video/mp4" --data-binary "fake-video"
ART=$(curl -s -X POST "$URL/rest/v1/articles" "${srv[@]}" -H "Prefer: return=representation" \
  -d "{\"kb_id\":\"$KBA\",\"title\":\"Getting started\",\"subtitle\":\"s\",\"status\":\"ready\",\"source_video_path\":\"$VID\"}" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
SHOT="$KBA/$ART/step-1.webp"
curl -s -o /dev/null -X POST "$URL/storage/v1/object/frames/$SHOT" \
  -H "apikey: $SRV" -H "Authorization: Bearer $SRV" -H "Content-Type: image/webp" --data-binary "frame"
curl -s -o /dev/null -X POST "$URL/rest/v1/steps" "${srv[@]}" \
  -d "{\"article_id\":\"$ART\",\"step_number\":1,\"heading\":\"Open it\",\"body_text\":\"<p>x</p>\",\"screenshot_url\":\"$SHOT\",\"timestamp_seconds\":3}"
curl -s -o /dev/null -X POST "$URL/rest/v1/jobs" "${srv[@]}" \
  -d "{\"kb_id\":\"$KBA\",\"user_id\":\"$UA\",\"article_id\":\"$ART\",\"status\":\"done\",\"stage\":\"writing\",\"counted_against_quota\":true,\"est_cost_usd\":0.02}"
curl -s -o /dev/null -X POST "$URL/storage/v1/object/branding/$KBA/logo.png" \
  -H "apikey: $SRV" -H "Authorization: Bearer $SRV" -H "Content-Type: image/png" --data-binary "logo"

TRIAL_BEFORE=$(curl -s "$URL/rest/v1/knowledge_bases?select=trial_started_at&id=eq.$KBA" "${srv[@]}")
echo "trial clock on A's KB after first article (A is on free): $TRIAL_BEFORE"

echo; echo "=== transfer ==="
TOKEN=$(curl -s -X POST "$URL/rest/v1/rpc/issue_claim_token" "${a[@]}" -d "{\"p_kb_id\":\"$KBA\"}" | tr -d '"')
chk "A (owner) can issue a claim token" "$([ ${#TOKEN} -eq 36 ] && echo y || echo n)" "y"
CLAIMED=$(curl -s -X POST "$URL/rest/v1/rpc/claim_kb" "${b[@]}" -d "{\"p_token\":\"$TOKEN\"}" | tr -d '"')
chk "B claims the KB" "$CLAIMED" "$KBA"

echo; echo "=== B has full control ==="
chk "opens the KB" "$(curl -s "$URL/rest/v1/knowledge_bases?select=name&id=eq.$KBA" "${b[@]}" | grep -c 'Help Center\|name')" "1"
chk "sees every article" "$(curl -s "$URL/rest/v1/articles?select=id&kb_id=eq.$KBA" "${b[@]}" | grep -c '"id"')" "1"
chk "edits article text" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$URL/rest/v1/articles?id=eq.$ART" "${b[@]}" -d '{"title":"B renamed this"}')" "204"
chk "edits step text" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$URL/rest/v1/steps?article_id=eq.$ART" "${b[@]}" -d '{"heading":"B edited"}')" "204"
chk "REPLACES a screenshot (write policy)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/storage/v1/object/frames/$KBA/$ART/step-1-new.webp" -H "apikey: $ANON" -H "Authorization: Bearer $TB" -H "Content-Type: image/webp" --data-binary 'new')" "200"
SIGNED=$(curl -s -X POST "$URL/storage/v1/object/sign/videos/$VID" "${b[@]}" -d '{"expiresIn":60}')
chk "reaches the source video (frame picker)" "$(echo "$SIGNED" | grep -c signedURL)" "1"
chk "uploads branding" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/storage/v1/object/branding/$KBA/logo-b.png" -H "apikey: $ANON" -H "Authorization: Bearer $TB" -H "Content-Type: image/png" --data-binary 'l')" "200"
curl -s -o /dev/null -X PATCH "$URL/rest/v1/knowledge_bases?id=eq.$KBA" "${b[@]}" -d '{"name":"Bees Own Docs"}'
SUB=$(curl -s "$URL/rest/v1/knowledge_bases?select=subdomain&id=eq.$KBA" "${b[@]}" | grep -o '"subdomain":"[^"]*"' | cut -d'"' -f4)
chk "renaming moves the subdomain" "$SUB" "bees-own-docs"
curl -s -o /dev/null -X PATCH "$URL/rest/v1/articles?id=eq.$ART" "${b[@]}" \
  -d '{"visibility":"listed","slug":"getting-started","published_content":{"title":"B renamed this","subtitle":"s","steps":[{"step_number":1,"heading":"B edited","body_text":"<p>x</p>","screenshot_url":null}]},"published_at":"2026-07-25T00:00:00Z"}'
RK=$(curl -s -X POST "$URL/rest/v1/rpc/reader_kb" -H "apikey: $ANON" -H "Content-Type: application/json" -d "{\"p_key\":\"$SUB\"}")
chk "article is live on the reader site" "$(curl -s -X POST "$URL/rest/v1/rpc/reader_article" -H "apikey: $ANON" -H "Content-Type: application/json" -d "{\"p_kb_id\":\"$KBA\",\"p_slug\":\"getting-started\"}" | grep -c 'getting-started')" "1"
chk "inherits B's plan: watermarked" "$(echo "$RK" | grep -o '"watermark":[a-z]*' | cut -d: -f2)" "true"
chk "inherits B's plan: noindexed" "$(echo "$RK" | grep -o '"noindex":[a-z]*' | cut -d: -f2)" "true"

echo; echo "=== A has none ==="
chk "KB gone from A's list" "$(curl -s "$URL/rest/v1/knowledge_bases?select=id&owner_id=eq.$UA" "${a[@]}")" "[]"
chk "direct URL to the KB denied" "$(curl -s "$URL/rest/v1/knowledge_bases?select=id&id=eq.$KBA" "${a[@]}")" "[]"
chk "direct URL to its articles denied" "$(curl -s "$URL/rest/v1/articles?select=id&kb_id=eq.$KBA" "${a[@]}")" "[]"
chk "cannot write to its articles" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$URL/rest/v1/articles?id=eq.$ART" "${a[@]}" -d '{"title":"A is back"}'; )" "204"
chk "  ...and the write changed nothing" "$(curl -s "$URL/rest/v1/articles?select=title&id=eq.$ART" "${srv[@]}" | grep -c 'B renamed this')" "1"
chk "cannot read the source video" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/storage/v1/object/sign/videos/$VID" "${a[@]}" -d '{"expiresIn":60}')" "400"
chk "cannot upload into the KB's frames" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/storage/v1/object/frames/$KBA/$ART/a-sneaks-in.webp" -H "apikey: $ANON" -H "Authorization: Bearer $TA" -H "Content-Type: image/webp" --data-binary 'x')" "400"

echo; echo "=== entitlement handover ==="
ROW=$(curl -s "$URL/rest/v1/knowledge_bases?select=trial_started_at,reader_views,is_demo,claim_token,offline_at&id=eq.$KBA" "${srv[@]}")
echo "  $ROW"
NOWY=$(date -u +%Y-%m-%d)
chk "trial clock reset to transfer time" "$(echo "$ROW" | grep -c "\"trial_started_at\":\"$NOWY")" "1"
chk "is_demo cleared" "$(echo "$ROW" | grep -o '"is_demo":[a-z]*' | cut -d: -f2)" "false"
chk "claim token consumed" "$(echo "$ROW" | grep -o '"claim_token":[a-z]*' | cut -d: -f2)" "null"
RA=$(curl -s -I "$URL/rest/v1/jobs?select=id&user_id=eq.$UA&counted_against_quota=is.true" "${srv[@]}" -H "Prefer: count=exact" -H "Range: 0-0" | grep -oi 'content-range: [^ ]*' | cut -d/ -f2 | tr -d '\r')
RB=$(curl -s -I "$URL/rest/v1/jobs?select=id&user_id=eq.$UB&counted_against_quota=is.true" "${srv[@]}" -H "Prefer: count=exact" -H "Range: 0-0" | grep -oi 'content-range: [^ ]*' | cut -d/ -f2 | tr -d '\r')
chk "A keeps the run they spent" "$RA" "1"
chk "B's quota untouched by A's history" "$RB" "0"
chk "B's empty auto-provisioned KB removed" "$(curl -s "$URL/rest/v1/knowledge_bases?select=id&id=eq.$KBB0" "${srv[@]}")" "[]"
chk "B now holds exactly one KB" "$(curl -s "$URL/rest/v1/knowledge_bases?select=id&owner_id=eq.$UB" "${srv[@]}" | grep -c '"id"')" "1"
LAST=$(curl -s "$URL/rest/v1/profiles?select=last_kb_id&id=eq.$UA" "${srv[@]}")
chk "A's last_kb_id no longer points at it" "$(echo "$LAST" | grep -c "$KBA")" "0"

echo; echo "=== admin still sees it (separate check, by design) ==="
EADM="xfer-adm-$STAMP@example.com"
UADM=$(mkuser "$EADM" "$PW"); curl -s -o /dev/null -X PATCH "$URL/rest/v1/profiles?id=eq.$UADM" "${srv[@]}" -d '{"is_admin":true}'
TADM=$(login "$EADM" "$PW"); adm=(-H "apikey: $ANON" -H "Authorization: Bearer $TADM" -H "Content-Type: application/json")
chk "an admin can still read the transferred KB" "$(curl -s "$URL/rest/v1/knowledge_bases?select=id&id=eq.$KBA" "${adm[@]}" | grep -c "$KBA")" "1"

echo; echo "=== cleanup ==="
for u in $UA $UB $UADM; do curl -s -o /dev/null -X DELETE "$URL/auth/v1/admin/users/$u" "${srv[@]}"; done
# Deleting a KB does NOT remove its storage objects — nothing sweeps them yet (that lands
# with the day-37 purge). So this cleans up after itself explicitly, by the exact paths it
# created, rather than leaving orphaned prefixes behind on every run.
curl -s -o /dev/null -X DELETE "$URL/storage/v1/object/videos"   "${srv[@]}" -d "{\"prefixes\":[\"$VID\"]}"
curl -s -o /dev/null -X DELETE "$URL/storage/v1/object/frames"   "${srv[@]}" -d "{\"prefixes\":[\"$SHOT\",\"$KBA/$ART/step-1-new.webp\"]}"
curl -s -o /dev/null -X DELETE "$URL/storage/v1/object/branding" "${srv[@]}" -d "{\"prefixes\":[\"$KBA/logo.png\",\"$KBA/logo-b.png\"]}"
echo "  users + storage deleted"
echo
printf '%s passed, %s failed\n' "$pass" "$fail"
