---
name: menuu-visual-review
description: Review or refine the existing Menúu consumer or kitchen interface without changing its approved visual identity. Use for requests about layout, visual polish, responsive behavior, interaction states, or a front that feels generic.
---

# Menúu visual review

Work in `menuu-consumidores`. Read the parent `AGENTS.md` and inspect the relevant route in `src/App.tsx` or `src/KitchenDashboard.tsx`, its CSS, `src/tokens.css`, and `src/components/ui.tsx` before editing. The existing header, original logo, Fredoka, DM Sans, colors, and filled brand icons are approved design decisions. Preserve them unless the user specifically changes one.

Identify the visible problem and the smallest useful adjustment. Compare the current page at 100% zoom at approximately 390, 768, 1024, and 1440 px when browser access is available. Include the actual content and states affected by the task: empty, populated, loading, error, focus, and dialogs as appropriate. Check the first content line under the sticky header, clipping, wrapping, touch targets, and reduced motion. If browser access fails, distinguish code findings from unverified visual claims.

Read later CSS rules before changing an early selector: both stylesheets contain intentional overrides. Reuse tokens and shared controls when they fit. Do not introduce a new visual system to make the interface look less generated. After editing, run the relevant available checks and inspect the affected route again. Report what changed, the observed before/after result, and any view or state that could not be verified.
