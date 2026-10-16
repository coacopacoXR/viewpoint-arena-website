/**
 * Figure numbers (DESIGN.md §3, §5).
 *
 * One sequence per page, counted down the document: the hero is `FIG. 00`, the
 * next figure that carries caption copy is `FIG. 01`, and so on. A figure with
 * no caption copy takes no number, because captions are copy (CONTENT.md, or the
 * asset registry's ASSETS.md column) and are never invented — so the printed
 * sequence is gapless and no two figures on a page share a number.
 *
 * The counter belongs to the page, since only the page fixes the document order
 * of its sections. It is deliberately not module state: `astro build` renders
 * pages concurrently, so a module-level counter would race between them.
 *
 * A section head's `FIG. 0n` tag is not part of this sequence — DESIGN.md §3
 * pairs it with the section number (`[03] FEATURES` ↔ `FIG. 03`).
 */
export interface FigureCounter {
  /** The next number in this page's sequence, e.g. `FIG. 01`. */
  next(): string;
}

export function figureCounter(): FigureCounter {
  let issued = 0;
  return {
    next() {
      const label = `FIG. ${String(issued).padStart(2, '0')}`;
      issued += 1;
      return label;
    },
  };
}
