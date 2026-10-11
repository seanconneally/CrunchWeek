#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -r requirements.lock
if [ ! -f frontend/dist/index.html ]; then
  (cd frontend && npm ci --no-fund && npm run build)
fi
echo 'Open http://127.0.0.1:8000 . Press Ctrl+C to stop.'
exec .venv/bin/python -m uvicorn crunch_week.api:app --host 127.0.0.1 --port 8000
