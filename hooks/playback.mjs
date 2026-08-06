#!/usr/bin/env node
// Reads a Claude Code PostToolUse hook payload from stdin, fetches the
// elements the tool call just touched, and emits a structural "playback"
// (types, connections, groups, geometric overlap/spacing checks) as
// additionalContext — so Claude can catch layout problems from the raw
// coordinates without needing a screenshot for this part.

import { readFileSync } from 'node:fs';

const CANVAS_PORT = process.env.CANVAS_PORT || '3000';
const BASE_URL = `http://localhost:${CANVAS_PORT}`;
const MIN_ARROW_GAP = 80;
const MIN_SHAPE_GAP = 40;

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Tool response text is prose-wrapped, e.g.
// "Element created successfully!\n\n{...}\n\n✅ Synced..." (src/index.ts
// create_element/batch_create_elements handlers) — not pure JSON, so the
// whole block.text can never be JSON.parse'd directly. Extract the first
// balanced {...} substring before parsing (found during final review: an
// earlier version assumed pure JSON and never matched any real response —
// see ledger).
//
// Only batch_create_elements's embedded object actually carries
// canvasStatus.scope (src/index.ts serializes the full `result`, which
// includes it). create_element/update_element only embed the bare element
// object with no canvasStatus at all — for those (and create_from_mermaid/
// import_scene), this correctly returns null and the caller falls back to
// the canvas server's active-tenant scope, which is safe in the common
// single-tenant case (both sides read the same underlying active-tenant
// value) but can misattribute if multiple tenants are legitimately active
// close together. This is a known, documented limitation, not a bug to
// silently paper over — fixing it fully would require changing what
// src/index.ts's response text embeds, which is out of scope for this
// plugin (it wraps the existing server; it doesn't modify it).
function extractTenantId(payload) {
  const content = payload.tool_response?.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (block?.type !== 'text' || typeof block.text !== 'string') continue;
    const jsonMatch = block.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) continue;
    try {
      const scope = JSON.parse(jsonMatch[0])?.canvasStatus?.scope;
      if (typeof scope === 'string' && scope.includes('/')) {
        return scope.split('/')[0];
      }
    } catch {
      // not valid JSON even after extraction, or missing expected shape — try next block
    }
  }
  return null;
}

function bboxOf(el) {
  const w = el.width || 0;
  const h = el.height || 0;
  return { x1: el.x, y1: el.y, x2: el.x + w, y2: el.y + h };
}

// Negative return = overlap depth (boxes intersect on both axes).
// Positive return = gap distance between nearest edges.
function bboxGap(a, b) {
  const dx = Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2);
  const dy = Math.max(a.y1, b.y1) - Math.min(a.y2, b.y2);
  if (dx < 0 && dy < 0) {
    return -Math.min(-dx, -dy);
  }
  return Math.max(dx, dy);
}

function emit(additionalContext) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext,
    },
  }));
}

async function main() {
  const raw = readStdin();
  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    // No usable stdin payload — proceed with server's default scope.
  }

  const tenantId = extractTenantId(payload);
  const headers = { 'Content-Type': 'application/json' };
  if (tenantId) headers['X-Tenant-Id'] = tenantId;

  let elements;
  try {
    const res = await fetch(`${BASE_URL}/api/elements`, { headers });
    const data = await res.json();
    elements = data.elements || [];
  } catch (err) {
    emit(`Diagram playback unavailable: could not reach canvas server at ${BASE_URL} (${err.message}).`);
    return;
  }

  if (elements.length === 0) {
    emit('Diagram playback: canvas is empty.');
    return;
  }

  const typeCounts = {};
  for (const el of elements) typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;

  const groupCount = new Set(elements.flatMap((el) => el.groupIds || [])).size;

  const arrows = elements.filter((el) => el.type === 'arrow');
  const unlabeledArrows = arrows.filter((a) => !a.label?.text && !a.text);

  // Arrow-bound pairs get the stricter MIN_ARROW_GAP threshold (connected
  // shapes per the design guide); everything else uses MIN_SHAPE_GAP.
  const connectedPairs = new Set();
  for (const arrow of arrows) {
    const from = arrow.startBinding?.elementId;
    const to = arrow.endBinding?.elementId;
    if (from && to) connectedPairs.add([from, to].sort().join('|'));
  }

  const shapes = elements.filter((el) => el.width || el.height);
  const overlaps = [];
  const tightGaps = [];
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i];
      const b = shapes[j];
      const gap = bboxGap(bboxOf(a), bboxOf(b));
      const isConnected = connectedPairs.has([a.id, b.id].sort().join('|'));
      const minGap = isConnected ? MIN_ARROW_GAP : MIN_SHAPE_GAP;
      if (gap < 0) {
        overlaps.push(`${a.id} (${a.type}) overlaps ${b.id} (${b.type}) by ~${Math.round(-gap)}px`);
      } else if (gap < minGap) {
        const reason = isConnected ? `connected shapes, guide minimum: ${MIN_ARROW_GAP}px` : `guide minimum: ${MIN_SHAPE_GAP}px`;
        tightGaps.push(`${a.id} and ${b.id} are only ${Math.round(gap)}px apart (${reason})`);
      }
    }
  }

  const lines = [];
  lines.push('## Diagram playback (structural, computed from element coordinates)');
  lines.push(`Elements: ${elements.length} — ${Object.entries(typeCounts).map(([t, c]) => `${t}(${c})`).join(', ')}`);
  lines.push(`Groups/zones detected: ${groupCount}`);
  lines.push(`Arrows: ${arrows.length} total, ${unlabeledArrows.length} unlabeled`);

  if (overlaps.length > 0) {
    lines.push('');
    lines.push('OVERLAPS FOUND:');
    overlaps.forEach((o) => lines.push(`  - ${o}`));
  }
  if (tightGaps.length > 0) {
    lines.push('');
    lines.push(`TIGHT SPACING (below ${MIN_SHAPE_GAP}px design guide minimum):`);
    tightGaps.forEach((g) => lines.push(`  - ${g}`));
  }
  if (unlabeledArrows.length > 0) {
    lines.push('');
    lines.push(`UNLABELED ARROWS: ${unlabeledArrows.map((a) => a.id).join(', ')}`);
  }
  if (groupCount === 0 && elements.length > 8) {
    lines.push('');
    lines.push(`NOTE: ${elements.length} elements with no groups — consider whether related elements should be grouped (group_elements), and whether this diagram is detailed enough for what it's trying to show.`);
  }
  if (overlaps.length === 0 && tightGaps.length === 0 && unlabeledArrows.length === 0) {
    lines.push('');
    lines.push('No structural issues detected. Still worth a visual check (Playwright screenshot) before reporting success.');
  }

  emit(lines.join('\n'));
}

main();
