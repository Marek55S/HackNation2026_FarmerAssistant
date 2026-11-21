---
name: design-system-governance
description: Maintain a consistent SaaS design system, tokens, component patterns, and documentation across an existing codebase.
---

# Design System Governance

The repository's existing design system is the source of truth. Inspect before changing.

## Inspect
Find theme files, CSS variables, Tailwind configuration, typography setup, component primitives, and existing patterns. Identify duplicates and inconsistencies.

## Tokens
Prefer semantic tokens for:
- Background and surfaces
- Foreground and muted text
- Borders and focus rings
- Primary, secondary, destructive, and status colors
- Typography scale
- Spacing scale
- Radius and elevation
- Motion and duration

Avoid arbitrary one-off values. Add a token only when it represents a reusable design decision.

## Components
- Reuse existing components before creating new ones.
- Keep variants intentional and limited.
- Separate primitive components from product-specific compositions.
- Document non-obvious props and interaction behavior.
- Avoid forking a component for a tiny visual difference.

## Governance
When changing a shared token or component, inspect its impact across the application. Avoid breaking unrelated routes. Update documentation and examples where needed.

## Quality
Check contrast, focus states, responsive behavior, disabled states, and consistency across light/dark themes if both exist.
