---
name: map-interface-design
description: Design and implement interactive map-based SaaS interfaces with markers, clustering, layers, filters, detail panels, and synchronized data tables.
---

# Map Interface Design

Use a map only when spatial context helps users understand or act on the data. Treat it as an interactive workspace, not a decorative background.

## Choose the mapping stack
Inspect the project first. Prefer its existing map library. If none exists:
- Mapbox GL JS when hosted styles, polished basemaps, geocoding, and Mapbox services fit the product and budget.
- MapLibre GL JS for an open-source renderer and compatible vector-tile workflows.
- Leaflet / React Leaflet for simpler marker-and-popup maps and raster tile use cases.

Do not add a mapping dependency without explaining the trade-offs and required API keys, tile sources, attribution, and billing implications.

## Map composition
- Establish a clear hierarchy between map, filters, toolbar, legend, and selected-feature panel.
- Keep controls discoverable without obscuring important geography.
- Use clustering for dense point sets.
- Use distinct, accessible visual encodings for categories and statuses.
- Provide selected, hover, focus, and disabled states.
- Make layer visibility and legend meaning explicit.
- Include map attribution and respect tile-provider terms.

## Interaction
- Synchronize selected map features with side panels and tables.
- Support useful filters and clear-filter behavior.
- Make marker hit targets usable.
- Provide keyboard-accessible alternatives to map-only interactions.
- Handle empty results, loading, errors, missing coordinates, and permission restrictions.
- Preserve selection sensibly when filters or viewport change.

## Performance and correctness
- Avoid rendering thousands of DOM markers when a WebGL layer or clustering is more suitable.
- Do not fabricate coordinates or geographic data.
- Debounce expensive filtering where appropriate.
- Avoid exposing secret API keys in client code; follow the provider's key restrictions.
- Consider privacy implications before displaying precise user or customer locations.

## Responsive
Define a mobile-specific interaction model. A map with a collapsible bottom sheet or list may work better than squeezing a desktop sidebar onto a phone.

## QA
Test zoom, pan, marker selection, clustering, filters, layer toggles, panel synchronization, keyboard alternatives, attribution, and narrow viewports.
