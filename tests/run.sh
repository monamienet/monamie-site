#!/usr/bin/env bash
# Runs tests/onboarding.test.js against onboarding.html in headless Chrome.
# Usage: tests/run.sh            (exit code 0 when every check passes)
#
# Chrome runs in real time on purpose: --virtual-time-budget/--dump-dom race async
# work (FileReader, image decoding), so results are POSTed back to a tiny local server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
PORT="${PORT:-8767}"
CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

python3 - "$ROOT" "$WORK" <<'PY'
import sys
root, work = sys.argv[1], sys.argv[2]
page = open(f'{root}/onboarding.html', encoding='utf-8').read()
test = open(f'{root}/tests/onboarding.test.js', encoding='utf-8').read()
inject = f'<script>\n{test}\n</script>\n</body>'
start = page.index('const APPS_SCRIPT_URL')
end = page.index(';', start)
with_url = lambda url: page[:start] + f"const APPS_SCRIPT_URL = '{url}'" + page[end:]
# Never hit the real deployment from tests: one copy has no URL, the other a fake one (fetch is stubbed).
open(f'{work}/unconfigured.html', 'w', encoding='utf-8').write(with_url('COLE_AQUI_A_URL_DO_APPS_SCRIPT').replace('</body>', inject))
fake = with_url('https://script.google.com/macros/s/TEST/exec')
open(f'{work}/configured.html', 'w', encoding='utf-8').write(fake.replace('</body>', inject))
open(f'{work}/server.py', 'w').write('''
import http.server, sys
class H(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        open(self.path.strip("/") + ".txt", "wb").write(body)
        self.send_response(200); self.end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
''')
PY

(cd "$WORK" && exec python3 -I server.py "$PORT") &
SERVER_PID=$!
sleep 1

for v in unconfigured configured; do
  timeout 60 "$CHROME" --headless=new --disable-gpu --no-sandbox --user-data-dir="$WORK/profile-$v" \
    "http://127.0.0.1:$PORT/$v.html?variant=$v" >/dev/null 2>&1 &
done

for _ in $(seq 1 60); do
  [ -f "$WORK/result-unconfigured.txt" ] && [ -f "$WORK/result-configured.txt" ] && break
  sleep 1
done

status=0
for v in unconfigured configured; do
  f="$WORK/result-$v.txt"
  if [ ! -f "$f" ]; then echo "== $v: NO RESULT (timeout)"; status=1; continue; fi
  echo "== $v: $(grep -c '^PASS' "$f") passed, $(grep -c '^FAIL' "$f" || true) failed"
  grep '^FAIL' "$f" && status=1 || true
done
pkill -f "user-data-dir=$WORK" 2>/dev/null || true
exit $status
