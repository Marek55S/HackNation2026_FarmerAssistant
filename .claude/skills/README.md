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

## Skills from emilkowalski/skills

Copied from https://github.com/emilkowalski/skills (commit `64eb3de`, MIT licence — see `LICENSE-emilkowalski-skills`), unchanged:

- `mobile-native` — make the PWA feel native on phones (tap highlight, sticky hover, 100vh, input zoom, safe areas, status bar)
- `prototype` — build several different versions of one UI piece behind a live picker (run explicitly with `/prototype`)
- `break-ui` — stress-test a screen with worst-case data (long names, empty lists, huge numbers)
- `emil-design-eng` — interaction polish: press/hover states, popovers, tooltips, transitions
- `learn-taste` — turn the user's design corrections from a session into rules in `DESIGN.md`

Some of them mention other skills from that repo (e.g. `animate`, `review-animations`) that are not copied here; install them from the same repo if needed.
