// Small DOM helpers for things ArtScript has no syntax for: ARIA attributes, the reveal-on-scroll
// observer and the favicon link. Everything is a progressive enhancement: the page reads fine
// (and is fully visible) without any of it.

// `art build --prerender` runs `mount` blocks too, against a minimal fake DOM (a `window` with no
// matchMedia, elements without a real `style`): a throw there aborts the build, so do nothing.
const live = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function";

/** Calls `cb(true|false)` now and on scroll: whether the page is scrolled away from the top. */
export function watchScroll(cb: (scrolled: boolean) => void): () => void {
  if (!live()) return () => {};
  const on = () => cb(window.scrollY > 8);
  on();
  window.addEventListener("scroll", on, { passive: true });
  return () => window.removeEventListener("scroll", on);
}

/** True when the page is currently shown with the dark palette. */
export function isDark(mode: string): boolean {
  return mode === "dark" || (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
}

/**
 * The prerendered HTML is replaced by the live app when the bundle loads, which would restart the
 * entrance animation. On the first page of a visit, a negative animation delay equal to the time
 * already spent makes the new elements pick the animation up where the old ones left it. Pages
 * reached later (client-side navigation) play it from the start.
 */
let entered = false;
export function syncEntrance(): void {
  if (!live()) return;
  const offset = entered ? 0 : Math.round(performance.now());
  entered = true;
  document.documentElement.style.setProperty("--enter-offset", `-${offset}ms`);
}

/** Adds the favicon link once (the generated HTML shell has no hook for it). */
export function favicon(href: string): void {
  if (!live()) return;
  if (document.head.querySelector("link[rel=icon]")) return;
  const l = document.createElement("link");
  l.rel = "icon";
  l.type = "image/svg+xml";
  l.href = href;
  document.head.appendChild(l);
}

/**
 * ARIA by class name:
 *   .deco            decorative: hidden from assistive tech
 *   .h1 / .h3        heading levels (ArtScript's `title` is always an <h2>)
 *   .stars           the rating's text alternative
 */
export function aria(root: ParentNode = globalThis.document): void {
  if (!live()) return;
  for (const n of root.querySelectorAll(".deco")) n.setAttribute("aria-hidden", "true");
  for (const n of root.querySelectorAll(".h1")) n.setAttribute("aria-level", "1");
  for (const n of root.querySelectorAll(".h3")) n.setAttribute("aria-level", "3");
  for (const n of root.querySelectorAll(".stars")) n.setAttribute("aria-label", "Rated 4.9 out of 5");
}

/**
 * Reveal on scroll. Only elements that start below the fold are hidden (class `pre`), so nothing
 * that is already on screen flashes; they get `in` when they scroll into view. Without JS, or with
 * reduced motion, everything simply stays visible. Returns the cleanup.
 */
export function reveal(root: ParentNode = globalThis.document): () => void {
  if (!live() || typeof IntersectionObserver === "undefined") return () => {};
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (s: string): boolean => EMAIL.test(s);
