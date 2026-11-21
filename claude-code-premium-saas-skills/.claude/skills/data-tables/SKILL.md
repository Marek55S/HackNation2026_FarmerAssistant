---
name: data-tables
description: Build production-grade SaaS data tables with sorting, filtering, pagination, selection, bulk actions, column controls, and responsive behavior.
---

# Production Data Tables

Start from the user's workflow and dataset size. Choose a table implementation that matches the product's needs and the repository's existing stack.

## Core behavior
- Sorting must be real and communicate sort direction.
- Filters must be visible, understandable, and removable.
- Show active-filter count or chips when useful.
- Pagination or virtualization must match dataset size.
- Selection must distinguish current-page and all-matching rows.
- Bulk actions need confirmation when destructive.
- Column visibility and resizing should be discoverable if supported.
- Preserve useful state when navigating or refreshing where appropriate.

## Visual design
- Align numeric values consistently.
- Use clear column labels and meaningful formatting.
- Keep row density deliberate and configurable only when useful.
- Use subtle separators and restrained emphasis.
- Avoid excessive badges; reserve color for meaningful status.
- Make row actions discoverable without cluttering every row.

## States and accessibility
Implement loading skeletons, empty results, no-data, errors, permission states, and disabled actions.
Use semantic table markup where appropriate, accessible labels, keyboard navigation, and visible focus.

## Mobile
Do not blindly shrink a wide table. Choose among horizontal scrolling, prioritized columns, row-to-detail views, or a dedicated compact layout.

## QA
Test sorting, filtering, reset, pagination, selection, bulk actions, keyboard use, long text, empty results, and narrow widths.
