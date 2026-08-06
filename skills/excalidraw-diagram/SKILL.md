---
name: excalidraw-diagram
description: >
  Use when creating or editing an Excalidraw diagram via the excalidraw MCP
  tools (create_element, batch_create_elements, create_from_mermaid,
  update_element). Covers drawing workflow, layout rules, and verification
  before reporting a diagram as done.
  Triggers: "diagram", "draw", "excalidraw", "architecture diagram",
  "flowchart", "sketch this out"
---

# Excalidraw Diagram Workflow

## Before drawing

Call `read_diagram_guide` first. It returns the server's own color palette,
sizing rules (minimum shape size, font sizes, padding), layout patterns, and
arrow-binding conventions. Follow it — don't invent your own palette or
spacing per diagram.

## While drawing

- Use `batch_create_elements` for anything with more than one or two
  elements. Bind every arrow with `startElementId`/`endElementId` — never
  set arrow coordinates manually; the server auto-routes to shape edges.
- Use real Excalidraw groups (`group_elements`) for zones or clusters of
  related shapes. A large background rectangle drawn behind other shapes is
  *not* a group — `describe_scene` and this plugin's verification hook only
  recognize real `groupIds` as zones. A background-rectangle "zone" looks
  right visually but is invisible to both as a grouping signal.
- Label arrows with `text` describing the relationship (e.g. "HTTP",
  "publishes"). Bare unlabeled arrows are flagged by the verification hook.
- Match complexity to content. A 3-step pipeline doesn't need zones and
  annotations. A multi-component architecture diagram with no supporting
  text and no grouping usually reads as too sparse — if the request
  describes several distinct responsibilities (e.g. "the MCP server and its
  backend"), the diagram should show more than a handful of undifferentiated
  boxes.

## After drawing — before reporting success

1. If you're about to view the diagram in a browser tab that might already
   have a different project open, first `PUT` the canvas server's active
   tenant to match what you just drew to:
   ```bash
   curl -s -X PUT http://localhost:3000/api/tenant/active \
     -H "Content-Type: application/json" \
     -d '{"tenantId":"<tenantId from the create/batch_create response'"'"'s canvasStatus.scope, before the "/">"}'
   ```
   Skipping this step was a real cause of "I drew it but the browser shows
   nothing" during testing — the MCP tool call and the browser's default
   view can silently point at different tenants.
2. If a fresh browser tab is being opened on a project that already has
   content, tell the user (or check) that "Auto" sync is off first —
   opening a tab with "Auto" sync enabled while the browser's local canvas
   is empty can silently delete every existing element in the project. This
   is a confirmed bug in the current frontend, not a hypothetical.
3. Use Playwright (`browser_navigate` to `http://localhost:3000`, then
   `browser_take_screenshot`) to get a real visual check. Don't rely on the
   `get_canvas_screenshot` MCP tool alone — it silently no-ops if no browser
   happens to already be connected, which produced a `no_clients_in_scope`/
   `ack_timeout` status with no visual feedback during testing.
4. Actually look at the screenshot, combined with the structural playback
   the verification hook already added to context after your draw call
   (overlaps, tight spacing, unlabeled arrows, missing groups). Fix anything
   flagged before reporting the diagram as done.
