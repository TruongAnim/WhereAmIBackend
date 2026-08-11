#!/usr/bin/env bash
# Fires the same requests the Traccar Client SDK sends, against either the
# emulator or the deployed function.
#
#   ./test-ingest.sh http://127.0.0.1:5001/demo-whereami/asia-southeast1/ingest/local-test-token
#   ./test-ingest.sh https://asia-southeast1-my-project.cloudfunctions.net/ingest/MY_TOKEN
#
# Every case prints the HTTP status followed by the response body.

set -uo pipefail

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "usage: $0 <ingest-url-including-token>" >&2
  exit 64
fi

DEVICE_ID="${2:-123456}"
NOW=$(date +%s)

post() {
  local label=$1
  shift
  local args=()
  for pair in "$@"; do args+=(--data-urlencode "$pair"); done
  printf '%-28s ' "$label"
  curl -sS -o /tmp/ingest-body -w '%{http_code} ' -X POST "${args[@]}" "$URL"
  cat /tmp/ingest-body
  echo
}

echo "POST $URL"
echo

post "full position" \
  "id=$DEVICE_ID" "lat=10.762622" "lon=106.660172" "timestamp=$NOW" \
  "accuracy=12.5" "altitude=8.0" "speed=10" "bearing=180" "batt=77" "charge=true"

post "heartbeat (no coords)" \
  "id=$DEVICE_ID" "timestamp=$((NOW + 1))"

post "sos alarm" \
  "id=$DEVICE_ID" "lat=10.762700" "lon=106.660300" "timestamp=$((NOW + 2))" "alarm=sos"

post "stale replay (older fix)" \
  "id=$DEVICE_ID" "lat=10.700000" "lon=106.600000" "timestamp=$((NOW - 3600))"

# Byte-identical to the first request: this is what an SDK retry looks like
# after an upload succeeded but the response was lost.
post "retry of first" \
  "id=$DEVICE_ID" "lat=10.762622" "lon=106.660172" "timestamp=$NOW" \
  "accuracy=12.5" "altitude=8.0" "speed=10" "bearing=180" "batt=77" "charge=true"

# Expected: 200 {"status":"ignored"} - a 4xx here would jam the SDK queue.
post "malformed (no timestamp)" \
  "id=$DEVICE_ID" "lat=10.762622" "lon=106.660172"

post "malformed (bad coords)" \
  "id=$DEVICE_ID" "lat=999" "lon=106.660172" "timestamp=$NOW"

# Expected: 403 - the SDK keeps retrying, so no data is lost.
printf '%-28s ' "wrong token"
curl -sS -o /tmp/ingest-body -w '%{http_code} ' -X POST \
  --data-urlencode "id=$DEVICE_ID" \
  --data-urlencode "timestamp=$NOW" \
  "${URL%/*}/definitely-not-the-token"
cat /tmp/ingest-body
echo

printf '%-28s ' "health check (GET)"
curl -sS -o /tmp/ingest-body -w '%{http_code} ' "$URL"
cat /tmp/ingest-body
echo

rm -f /tmp/ingest-body
