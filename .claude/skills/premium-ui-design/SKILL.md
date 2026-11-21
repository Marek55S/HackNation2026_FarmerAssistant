---
name: premium-ui-design
description: Design and implement distinctive, production-grade SaaS interfaces. Use when creating or redesigning pages, flows, navigation, forms, settings, onboarding, or shared UI.
---

# Premium UI Design

Act as a senior product designer and frontend engineer. Make deliberate, product-specific design decisions rather than defaulting to generic AI SaaS patterns.

## Before coding
1. Inspect the existing app, routes, components, tokens, package manager, and conventions.
2. Understand the user's task, primary action, information hierarchy, and key states.
3. For a substantial screen, state a concise art direction: visual character, typography, density, color strategy, layout, and interaction principles.
4. Reuse the existing design system. Do not introduce a competing one.

## Visual quality
- Establish a clear hierarchy through scale, weight, contrast, spacing, and grouping.
- Use whitespace intentionally; do not wrap every item in a card.
- Avoid gratuitous gradients, glassmorphism, oversized rounded cards, decorative badges, and arbitrary icons.
- Use a restrained, purposeful color palette and consistent semantic colors.
- Choose typography appropriate to the product; avoid relying on one font size and weight everywhere.
- Use icons consistently; prefer the project's icon library over emoji.
- Make layouts feel composed, not assembled from repeated templates.

## UX and states
Design real loading, empty, error, success, disabled, hover, focus, and selected states where relevant.
Every visible control must do what its label implies. Do not add fake buttons or decorative controls.

## Responsive behavior
Consider narrow screens from the beginning. Define how navigation, tables, sidebars, charts, dialogs, and dense content adapt rather than merely shrinking the desktop layout.

## Implementation
- Follow the repository's existing framework and patterns.
- Prefer semantic HTML and accessible components.
- Keep components composable and avoid needless abstraction.
- Do not replace working functionality just to change appearance.
- Do not invent product data, metrics, or user content.

## Completion
Run available checks and inspect the rendered result when browser tooling is available. Report any unverified areas honestly.
