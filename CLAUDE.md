# Asystent Wodny – instrukcje dla Claude Code

## Projekt
- Plan i logika: `pipeline_plan.md` (identyfikatory P*, F*, C*, R*), zadania: `TODO.md`, metody: `METODY.md`, źródła: `ZRODLA_DANYCH.md`.
- Makiety UI: `makieta-ui/*.dc.html` – specyfikacja układu, tekstów i interakcji.
- Frontend: `frontend/` (Next.js 16 + TypeScript + Tailwind 4, PWA, docelowo Google Cloud Run). Uruchomienie i mock API: `frontend/README.md`.
  Kontrakt danych raportu: `frontend/src/lib/types.ts`. Tokeny kolorów: `frontend/src/app/globals.css`.
- Język interfejsu i dokumentacji: polski.

## Premium SaaS UI Standards

Use the project skills in `.claude/skills/` when relevant:
- `premium-ui-design` for product screens and visual direction
- `saas-dashboard-design` for dashboards and analytics
- `map-interface-design` for geospatial interfaces
- `data-tables` for data-heavy tables
- `design-system-governance` for shared tokens and components
- `visual-qa` before declaring UI work complete

### Global rules
- Inspect the existing stack and design system before changing them.
- Make product-specific design decisions; avoid generic AI-generated layouts.
- Do not wrap every element in a card or add decorative gradients, badges, and effects without purpose.
- Preserve working functionality and existing architecture.
- Do not invent business data, metrics, locations, or user content.
- Every visible control must work.
- Include loading, empty, error, success, disabled, hover, and focus states as appropriate.
- Design responsive behavior deliberately, not as an afterthought.
- Use semantic HTML and accessible interaction patterns.
- Never call a UI task complete based only on successful compilation; use browser-based visual QA when available.

### Workflow
1. Inspect product context, routes, components, and tokens.
2. Define UX intent and visual direction for substantial screens.
3. Reuse or extend the existing design system.
4. Implement one coherent feature or screen at a time.
5. Run checks and inspect the rendered UI with the `visual-qa` skill.
6. Report what was verified and what remains unverified.
