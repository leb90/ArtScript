// The two things the page still needs plain DOM code for.

/**
 * The prerendered HTML is replaced by the live app when the bundle loads (ArtScript does not
 * hydrate), which would restart the entrance animation. On the first page of a visit, a negative
 * animation delay equal to the time already spent makes the new elements pick the animation up
 * where the old ones left it. Pages reached later (client-side navigation) play it from the start.
 */
let entered = false;
export function syncEntrance(): void {
  const offset = entered ? 0 : Math.round(performance.now());
  entered = true;
  document.documentElement.style.setProperty("--enter-offset", `-${offset}ms`);
}

/**
 * Reveal on scroll. Only elements that start below the fold are hidden (class `pre`), so nothing
 * that is already on screen flashes; they get `in` when they scroll into view. Without JS, or with
 * reduced motion, everything simply stays visible. Returns the cleanup.
 */
export function reveal(root: ParentNode = document): () => void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.remove("pre");
      e.target.classList.add("in");
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  for (const n of root.querySelectorAll(".reveal")) {
    if (n.getBoundingClientRect().top > innerHeight * 0.92) {
      n.classList.add("pre");
      io.observe(n);
    }
  }
  return () => io.disconnect();
}
