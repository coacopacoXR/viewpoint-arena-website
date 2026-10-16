/**
 * section-index.ts — highlights the current section in the vertical index
 * (DESIGN.md §4 "Nav"). An IntersectionObserver watches a band across the
 * middle of the viewport; the topmost section inside it is current. With JS
 * off nothing is highlighted and every link still works.
 */

const links = new Map<string, HTMLAnchorElement>();
for (const link of Array.from(
  document.querySelectorAll<HTMLAnchorElement>('[data-index-link]'),
)) {
  const id = link.dataset.indexLink;
  if (id) links.set(id, link);
}

const sections = Array.from(links.keys())
  .map((id) => document.getElementById(id))
  .filter((el): el is HTMLElement => el !== null);

function setActive(current: string | null): void {
  for (const [id, link] of links) {
    if (id === current) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }
}

if (sections.length > 0) {
  const inside = new Set<string>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inside.add(entry.target.id);
        else inside.delete(entry.target.id);
      }
      setActive(sections.find((section) => inside.has(section.id))?.id ?? null);
    },
    /* a band across the middle of the viewport, so a section becomes current
       while it is actually being read */
    { rootMargin: '-40% 0px -50% 0px', threshold: 0 },
  );
  for (const section of sections) observer.observe(section);
}
