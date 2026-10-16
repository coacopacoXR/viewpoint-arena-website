/**
 * video.ts — `<video>` elements inside a `Figure` play only when they are on
 * screen, and never under `prefers-reduced-motion` (DESIGN.md §5, §4).
 * `preload="none"` means the file is not fetched until it is actually needed.
 */

const videos = Array.from(
  document.querySelectorAll<HTMLVideoElement>('[data-video-in-view]'),
);

if (videos.length > 0) {
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting && !reduceQuery.matches) {
          /* autoplay can be refused; the poster is the fallback either way */
          void video.play().catch(() => undefined);
        } else if (!entry.isIntersecting) {
          video.pause();
        }
      }
    },
    { threshold: 0.25 },
  );

  for (const video of videos) observer.observe(video);

  /* reduced motion turned on mid-session: stop everything, show the poster */
  reduceQuery.addEventListener('change', () => {
    if (!reduceQuery.matches) return;
    for (const video of videos) video.pause();
  });
}
