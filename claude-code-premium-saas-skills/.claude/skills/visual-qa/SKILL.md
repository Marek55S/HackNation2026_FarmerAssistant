---
name: visual-qa
description: Inspect a running web app in a real browser, identify visual and interaction defects, and iterate until the changed UI is verified.
---

# Visual QA

Never declare a UI task complete solely because the code compiles.

## Procedure
1. Identify how to run the app and start it using the project's documented command.
2. Use the available browser tool (prefer Playwright MCP when configured) to open the relevant route.
3. Inspect the page at desktop and mobile widths; include tablet when the layout warrants it.
4. Capture screenshots and inspect actual rendering.
5. Exercise every changed interaction: navigation, forms, menus, dialogs, filters, tabs, charts, map controls, and table actions.
6. Check loading, empty, error, success, disabled, hover, and focus states where applicable.
7. Fix the highest-impact defects first.
8. Repeat browser inspection after changes.

## Visual review checklist
- Hierarchy and reading order
- Typography, line length, wrapping, and truncation
- Spacing and alignment
- Contrast and semantic color
- Responsive overflow and clipping
- Sticky headers, sidebars, and overlays
- Focus visibility and keyboard behavior
- Chart labels, legends, tooltips, and resizing
- Map controls, attribution, selection, and panel synchronization
- Table sorting, filters, pagination, and bulk actions

## Reporting
Summarize what was tested, viewport sizes, defects fixed, and anything not verified. Do not claim a test passed if it was not run.
