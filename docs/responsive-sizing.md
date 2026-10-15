# Responsive sizing

`apps/web/src/sizing.css` is loaded after the page themes. It owns shared sizing;
the existing themes continue to supply colors and page-specific arrangements.

## Metric cards

Add `metric-grid` to a collection of summary cards. This is used by Overview,
Proxmox and its management tabs, Docker tabs, Storage tabs, Network tabs,
Backups tabs, Monitoring, Alerts tabs, Users and Audit Logs.

- The standard card minimum height is 144px, padding is 16px, and gap is 12px.
- Desktop columns use the available content width and a 200px minimum. Empty
  columns remain available, so a short collection does not stretch into huge cards.
- Icons have a 44px square background and a 22px glyph. They cannot shrink into
  ovals. Direct SVG variants include padding inside this same footprint.
- Values use the card's available width, from 18px to 24px. Labels use 12px and
  supporting text uses 11px. Long content wraps and can increase card height;
  cards are equal in height within the collection, without hiding information.
- At 800px and below, cards use two columns, 36px icon backgrounds, 20px glyphs,
  and 22px values. Icons sit beside labels so values can use the full card width.
- At 380px and below, cards use one column.
- Compact appearance keeps the same layout with smaller spacing and icons.

Use this class only for metric collections, not chart legends, detail panes,
tables, or arbitrary groups of content cards. Performance cards keep their
sparklines beneath the metric content. Fully clickable cards retain their
existing button or link and accessible name.

## Pages and controls

Page headings use 22–26px type, section headings use 16px, and common action
buttons use 13px text. Table content uses 12px with 11px headers. Dense backup
report annotations have an 11px minimum in the affected panels.

Mobile controls have at least a 44px height. Form fields use 16px text on mobile
to avoid focus zoom in Safari. xterm's helper textarea is excluded. Dialogs can
scroll within the available viewport; table overflow stays inside table wrappers.
The Proxmox tab roots use `minmax(0, 1fr)` so wide table content cannot enlarge
their implicit grid columns beyond the page.

## Visual verification

Use fixture API responses rather than a live infrastructure connection when
checking these layouts. Visit each primary route and its tab query strings at
320, 375, 390, 768, 1024, 1440 and 1920px viewport widths. Check:

1. Card collections have equal widths and heights within each row, square icon
   backgrounds, and no overlap between labels, values, icons and footnotes.
2. Unknown/unavailable readings, long resource names, GiB/TiB values and dates
   remain readable. Collections can grow vertically when their content needs it.
3. The document has no horizontal overflow. Wide data tables and tab bars scroll
   inside their own containers.
4. Buttons, filters, forms and dialog content fit the available width. Check both
   comfortable and compact appearance, the desktop collapsed sidebar, and the
   mobile hamburger menu.
5. Double metric text sizes to check that cards expand without clipping text.
   Real Safari/iOS keyboard and browser zoom behavior still requires device QA.

Run `npm test` and `npm run build` after changing shared sizing or its consumers.
