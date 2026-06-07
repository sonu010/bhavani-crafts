/**
 * RFC 4180 CSV cell escaping. Single source of truth — anything that
 * emits CSV in this codebase must go through these helpers so an
 * accountant's import doesn't break on a single rogue comma.
 *
 * Rules per RFC 4180:
 *   - A cell containing a comma, double-quote, CR, or LF must be
 *     surrounded by double-quotes.
 *   - Any double-quotes inside a quoted cell must be doubled.
 *   - Empty cells emit as an empty string. Numbers stringify normally.
 *   - null / undefined emit as empty (NOT the literal "null").
 */

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}
