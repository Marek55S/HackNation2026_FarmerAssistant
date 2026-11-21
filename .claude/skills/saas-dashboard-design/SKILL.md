---
name: saas-dashboard-design
description: Design and implement premium SaaS dashboards, analytics overviews, KPI surfaces, operational consoles, and data-dense application screens.
---

# SaaS Dashboard Design

Create dashboards that help users understand a situation and decide what to do next. Do not treat a dashboard as a grid of decorative cards.

## Information architecture
1. Identify the audience, key questions, and decisions the dashboard supports.
2. Prioritize the most actionable information.
3. Group related metrics and controls logically.
4. Make date range, filters, comparison periods, and data freshness explicit when relevant.
5. Keep global navigation, page navigation, and contextual actions distinct.

## KPI design
- Show units, time periods, and comparison context.
- Use trends only when there is a meaningful baseline.
- Avoid ambiguous metrics and unexplained abbreviations.
- Do not invent values or imply sample data is real.
- Use sparklines only when they add useful context.

## Charts
- Choose chart type based on the question and data, not visual variety.
- Label axes, units, series, and time ranges.
- Use tooltips that explain exact values and context.
- Keep colors consistent across the product and accessible.
- Avoid 3D charts, unnecessary chart junk, and misleading axes.
- Provide useful empty, loading, error, and no-permission states.
- Include a text/table alternative when the chart is essential to understanding.

## Data density
- Use alignment, spacing, typography, and subtle separators to structure information.
- Do not put every metric in an identical card.
- Use progressive disclosure for secondary detail.
- Make important anomalies and next actions easy to find.

## Responsive
Define behavior for desktop, tablet, and mobile. On small screens, prioritize tasks and allow deliberate horizontal scrolling for genuinely tabular data rather than compressing everything.

## QA
Check labels, units, legends, filters, date controls, sorting, tooltips, keyboard access, and all data states. Verify that charts resize without clipping.
