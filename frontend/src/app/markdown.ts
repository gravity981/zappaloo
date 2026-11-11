// Markdown becomes HTML in the browser and is sanitised before it is shown (SEC-05): raw HTML
// and scripts do not run, event handlers and `javascript:` links are removed. The same renderer
// serves the privacy notice and, later, the website content.
import DOMPurify from "dompurify";
import { marked } from "marked";

// Links to other sites never hand the opener window to them.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/** Sanitised HTML for the Markdown text. */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false, gfm: true });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
