---
name: excalidraw-doctor
description: >
  Use when excalidraw MCP tools are failing, the user wants to check their
  setup, or a diagram unexpectedly lost content. Checks canvas
  reachability, build freshness, a live functional write probe, and scans
  for signs of the known auto-sync mass-deletion bug.
user-invocable: true
allowed-tools: Bash, AskUserQuestion
---

# excalidraw — Doctor

Run four checks and report a clear pass/fail summary.

## Step 1 — Canvas server reachable

```bash
curl -s http://localhost:3000/health
```

A passing result is JSON with `"status":"healthy"`. If this fails outright
(connection refused), nothing else in this checklist will work — report
that first and stop.

## Step 2 — Build freshness

```bash
cd /Users/gardamr/Documents/git/mcp-excalidraw-local
python3 -c "
import pathlib
src = max((p.stat().st_mtime for p in pathlib.Path('src').glob('*.ts')), default=0)
dist_index = pathlib.Path('dist/index.js')
if not dist_index.exists():
    print('dist/index.js MISSING')
else:
    dist = dist_index.stat().st_mtime
    print('dist is STALE (src is newer)' if src > dist else 'dist is fresh')
"
```

## Step 3 — Functional canary probe (catches stale Docker images)

```bash
TENANT="doctor-canary-$$"
RESP=$(curl -s -X POST http://localhost:3000/api/elements \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $TENANT" \
  -d '{"type":"rectangle","x":0,"y":0,"width":10,"height":10}')
echo "$RESP"
if echo "$RESP" | grep -q "FOREIGN KEY constraint failed"; then
  echo "CANARY FAILED — stale build/image"
else
  echo "CANARY PASSED"
  ID=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['element']['id'])")
  curl -s -X DELETE "http://localhost:3000/api/elements/$ID" -H "X-Tenant-Id: $TENANT" > /dev/null
fi
```

A `FOREIGN KEY constraint failed` response means the running canvas server
predates the tenant auto-create fix (`src/server.ts` `resolveTenantProject`
calling `dbEnsureTenant` before `getDefaultProjectForTenant`). This exact
failure mode was caused by a stale public Docker Hub image during testing.

## Step 4 — Mass-deletion heuristic

```bash
cd /Users/gardamr/Documents/git/mcp-excalidraw-local
DB_PATH="${EXCALIDRAW_DB_PATH:-$HOME/.excalidraw-mcp/excalidraw.db}"
node -e "
const Database = require('better-sqlite3');
const db = new Database('$DB_PATH', { readonly: true });
const rows = db.prepare(\"SELECT created_at FROM element_versions WHERE operation = 'delete' ORDER BY created_at\").all();
const timestamps = rows.map(r => new Date(r.created_at).getTime());
let burstFound = null;
for (let i = 0; i + 4 < timestamps.length; i++) {
  if (timestamps[i + 4] - timestamps[i] <= 10000) {
    burstFound = rows[i].created_at;
    break;
  }
}
console.log(burstFound ? \`POSSIBLE AUTO-SYNC WIPE at \${burstFound}\` : 'No mass-deletion burst detected');
"
```

## Step 5 — Playwright plugin available

The diagram skill's visual verification step depends on the Playwright
plugin's `browser_navigate`/`browser_take_screenshot` tools. Check it's
enabled:

```bash
python3 -c "
import json, pathlib
p = pathlib.Path('~/.claude/settings.json').expanduser()
if not p.exists():
    print('NOT FOUND: ~/.claude/settings.json missing')
else:
    cfg = json.loads(p.read_text())
    enabled = cfg.get('enabledPlugins', {})
    hits = [k for k in enabled if k.startswith('playwright@') and enabled[k]]
    print(f'FOUND: {hits[0]}' if hits else 'NOT ENABLED')
"
```

A passing result shows `FOUND: playwright@<marketplace>`.

## Step 6 — Report findings

Summarise all checks in this format:

```
excalidraw doctor
─────────────────────────────────────────────────
✓  Canvas server reachable (healthy)
✓  Build fresh
✗  Canary probe FAILED — FOREIGN KEY constraint failed
✓  No mass-deletion burst detected
✓  Playwright plugin enabled (playwright@claude-plugins-official)
─────────────────────────────────────────────────
1 check failed. See fix guidance below.
```

Replace `✓` with `✗` for any failure and add fix guidance below the summary.

---

## Fix guidance

### ✗ Canvas server unreachable

Start it: `node dist/index.js` from the repo root (starts MCP stdio + the
embedded canvas server on `:3000`). If a Docker container is holding the
port, `docker compose stop canvas mcp` first.

### ✗ Build stale

```bash
pnpm run build
```

### ✗ Canary probe failed (`FOREIGN KEY constraint failed`)

The running canvas server predates the tenant auto-create fix. If it's
running via Docker, the published image is stale — rebuild it from current
source (`docker compose build canvas mcp`, which requires network access
for `apt-get`), or run the canvas server directly on the host instead:

```bash
docker compose stop canvas mcp
node dist/server.js
```

### ✗ Playwright plugin not enabled

Install/enable it: `/plugin install playwright@claude-plugins-official` (or
whichever marketplace hosts it in your setup). The diagram skill's visual
verification step won't work without it — structural checks from the
verification hook will still run either way.

### ✗ Possible auto-sync wipe detected

A burst of deletes with no matching `clear_canvas` call usually means a
browser tab was opened on this project with "Auto" sync enabled while its
local canvas was empty, which silently deletes existing server-side
elements on load. Toggle "Auto" off in the canvas UI before opening a fresh
tab on a project with existing content.

---

## Step 7 — Confirm

After printing fix instructions, use `AskUserQuestion`:

- Question: "Have you applied the fix(es) above?"
- Option 1 — "Yes, done": re-run `/excalidraw:excalidraw-doctor` to confirm.
- Option 2 — "Not yet / need more help": walk through the specific step
  they're stuck on.
