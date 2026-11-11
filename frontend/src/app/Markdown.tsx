// Shows Markdown as sanitised HTML (SEC-05).
import { useMemo } from "react";
import { renderMarkdown } from "./markdown.ts";

export default function Markdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  // The HTML has been sanitised by `renderMarkdown`.
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
