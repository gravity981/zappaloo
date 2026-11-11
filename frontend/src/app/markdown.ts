// Markdown becomes HTML in the browser and is sanitised before it is shown (SEC-05): raw HTML
// and scripts do not run, event handlers and `javascript:` links are removed. The same renderer
// serves the privacy notice and, later, the website content.
import DOMPurify from "dompurify";
import { marked } from "marked";

/** True if the URL points to another site; relative URLs stay on this one. */
function foreign(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin !== window.location.origin;
  } catch {
    return true;
  }
}

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  // Links to other sites never hand the opener window to them.
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("rel", "noopener noreferrer");
  }
  // Images from other sites would tell them who reads the page.
  if (node.tagName === "IMG" && foreign(node.getAttribute("src") ?? "")) node.remove();
});

/**
 * Text needs none of these: forms and fields could imitate a sign-in on a public page, and
 * styles could cover the page with something else.
 */
const FORBID_TAGS = ["form", "input", "button", "textarea", "select", "option", "style"];
const FORBID_ATTR = ["style"];

/** Sanitised HTML for the Markdown text. */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false, gfm: true });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS, FORBID_ATTR });
}
