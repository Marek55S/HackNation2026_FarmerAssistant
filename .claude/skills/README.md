# Claude Code – Premium SaaS UI Skills

This is a project-local starter pack of original Agent Skills for Claude Code. It is designed to reduce generic "vibe-coded" UI and cover SaaS screens, dashboards, maps, data tables, design-system consistency, and visual QA.

## Install
Installed: the skills live in `.claude/skills/` and the rules in `CLAUDE.md` at the repository root.
Restart Claude Code in the repository root to pick them up.

Claude Code discovers project skills in `.claude/skills/<skill-name>/SKILL.md`.

## Included skills
- `premium-ui-design`
- `saas-dashboard-design`
- `map-interface-design`
- `data-tables`
- `visual-qa`
- `design-system-governance`

## Important
These are original project instructions, not bundled copies of third-party repositories or paid assets. They do not install MCP servers or npm dependencies automatically.

For browser-based QA, configure Playwright MCP separately. For mapping, choose Mapbox, MapLibre, or Leaflet based on product requirements, tile/data licensing, API keys, and budget. For charts and tables, use the libraries already present in your project where possible.
