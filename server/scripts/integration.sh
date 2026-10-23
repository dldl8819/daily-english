#!/usr/bin/env bash
# 통합 검증: 로컬 Supabase(마이그레이션 적용) + wrangler dev(Workers 런타임) 위에서 server/test/integration.test.ts를 돌린다.
# CI(.github/workflows/ci.yml)용이다. server/.dev.vars를 새로 쓰므로 CI=true일 때만 동작한다.
set -euo pipefail

if [ "${CI:-}" != "true" ]; then
  echo "CI에서만 실행해요. server/.dev.vars를 덮어써요." >&2
  exit 1
fi

cd "$(dirname "$0")/../.."
SUPABASE=(supabase)
command -v supabase >/dev/null || SUPABASE=(npx -y supabase@2.121.0)
KONG=supabase_kong_daily-english
LOG="$(mktemp)"

npm run questions
"${SUPABASE[@]}" start -x gotrue,realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

# 로컬 Supabase 키는 게이트웨이 설정에 있다(auth를 띄우지 않으면 supabase status가 키를 보여 주지 않는다).
key() { docker exec "$KONG" sh -c "grep -o '$1[A-Za-z0-9_-]*' /home/kong/kong.yml | head -1"; }
SECRET_KEY="$(key sb_secret_)"
PUBLISHABLE_KEY="$(key sb_publishable_)"
SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
if [ -z "$SECRET_KEY" ] || [ -z "$PUBLISHABLE_KEY" ]; then
  echo "로컬 Supabase 키를 찾지 못했어요." >&2
  exit 1
fi
# 공개 저장소의 CI 로그는 누구나 본다. 일회용 로컬 키라도 가린다.
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "::add-mask::$SECRET_KEY"
  echo "::add-mask::$PUBLISHABLE_KEY"
  echo "::add-mask::$SESSION_SECRET"
fi
printf 'SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_SECRET_KEY=%s\nSESSION_SECRET=%s\nDEV_AUTH=true\n' "$SECRET_KEY" "$SESSION_SECRET" > server/.dev.vars

(cd server && exec npx wrangler dev --ip 127.0.0.1 --port 8787 > "$LOG" 2>&1) &
WRANGLER=$!
trap 'kill "$WRANGLER" 2>/dev/null || true' EXIT

if ! curl -sf --retry 60 --retry-delay 1 --retry-connrefused --retry-all-errors -o /dev/null -X POST \
  -H 'content-type: application/json' -d '{"code":"dev:ci-probe"}' http://127.0.0.1:8787/api/v1/auth/anonymous; then
  echo "wrangler dev가 응답하지 않아요." >&2
  tail -50 "$LOG" >&2
  exit 1
fi

if ! API_URL=http://127.0.0.1:8787 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" \
  npx vitest run server/test/integration.test.ts; then
  tail -50 "$LOG" >&2
  exit 1
fi
