// The JSX runtime of the eval's Next.js pages. A root layout renders <html> and <body>: React 19 takes
// over the document's own for those, which would wipe the page the simulated browser mounted in.
// Here they're plain containers, so what a layout puts around the page (a menu) is on screen.
import { Fragment, jsx as reactJsx, jsxs as reactJsxs } from "react/jsx-runtime";

const tag = (type: any) => (type === "html" || type === "body" ? "div" : type === "head" ? Fragment : type);
const drop = (type: any, props: any) => (type === "head" ? { children: props?.children } : props);

export { Fragment };
export const jsx = (type: any, props: any, key?: any) => reactJsx(tag(type), drop(type, props), key);
export const jsxs = (type: any, props: any, key?: any) => reactJsxs(tag(type), drop(type, props), key);
