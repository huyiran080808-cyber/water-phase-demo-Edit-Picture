#!/usr/bin/env bash
set -euo pipefail

cd /Users/hyr/water-phase-demo-2
exec /Users/hyr/.local/bin/node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4174
