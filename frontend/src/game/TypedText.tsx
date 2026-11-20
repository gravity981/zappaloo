// The line of a dialogue types itself out (CNT-10). The Markdown is rendered whole, so the box keeps its final size
// and does not grow while it types; then the text of the rendered nodes is cut back and handed out again, character
// by character. A guest who prefers reduced motion sees the whole line at once.
import { useEffect, useLayoutEffect, useRef } from "react";
import Markdown from "../app/Markdown.tsx";
import { TYPE_CHARACTERS_PER_SECOND } from "./reduced-motion.ts";

interface Piece {
  node: Text;
  full: string;
}

export default function TypedText({
  text,
  complete,
  onDone,
}: {
  text: string;
  /** The whole line is to be shown: the guest tapped, or asks for less motion. */
  complete: boolean;
  /** The last character has been shown. */
  onDone: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const pieces = useRef<Piece[]>([]);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const show = (count: number) => {
    let left = count;
    for (const { node, full } of pieces.current) {
      node.nodeValue = full.slice(0, Math.max(0, left));
      left -= full.length;
    }
  };

  // Before the first paint: keep the size of the whole line, then hide the text that has not been typed yet.
  useLayoutEffect(() => {
    const root = host.current;
    if (!root) return undefined;
    const found: Piece[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      found.push({ node: node as Text, full: node.nodeValue ?? "" });
    }
    pieces.current = found;
    root.style.minHeight = `${String(root.offsetHeight)}px`;
    if (!complete) show(0);
    return () => {
      // The effect runs twice in development (StrictMode): the second run must find the whole text again.
      for (const { node, full } of found) node.nodeValue = full;
      root.style.minHeight = "";
    };
    // `complete` is read once, for the first picture; the effect below follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    if (complete) {
      show(Number.POSITIVE_INFINITY);
      return undefined;
    }
    const total = pieces.current.reduce((sum, piece) => sum + piece.full.length, 0);
    let start: number | undefined;
    let handle = 0;
    const tick = (now: number) => {
      start ??= now;
      const count = Math.floor(((now - start) * TYPE_CHARACTERS_PER_SECOND) / 1000);
      show(count);
      if (count >= total) onDoneRef.current();
      else handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
    };
  }, [complete, text]);

  return (
    <div ref={host}>
      <Markdown text={text} />
    </div>
  );
}
