// The site's motion: entrances that resume where the prerendered page left them, elements that
// reveal as they scroll into view (staggered among siblings), and nothing at all when the visitor
// asks for reduced motion. Everything is visible without JavaScript.
export function setupMotion() {
  const root = document.documentElement;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // The live app replaces the prerendered DOM a moment after the first paint: entrance animations
  // pick up from where the static page's were, instead of starting over.
  root.style.setProperty("--t0", `${-performance.now()}ms`);
  root.classList.add("motion");
  const seen = new WeakSet<Element>();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  const scan = () => {
    for (const el of document.querySelectorAll<HTMLElement>(".reveal")) {
      if (seen.has(el)) continue;
      seen.add(el);
      // Siblings that reveal together come in one after another.
      const i = [...(el.parentElement?.children ?? [])].filter((c) => c.classList.contains("reveal")).indexOf(el);
      el.style.setProperty("--i", String(Math.min(i, 7)));
      io.observe(el);
    }
  };
  scan();
  new MutationObserver(scan).observe(document.getElementById("app")!, { childList: true, subtree: true });
}
