/**
 * Escape text destined for `innerHTML`.
 *
 * Lived as a private `esc()` in both MapInfo.ts and BuildingDrawer.ts until
 * round 10.3 needed every string on the concept screen to pass through
 * `bindShortWords` as well — two copies of an escaper is one copy too many once
 * something has to be composed with it.
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
  );
}
