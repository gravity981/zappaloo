// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./keys.ts";

/** The first element of a small piece of HTML. */
function element(html: string): Element | null {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return holder.firstElementChild;
}

describe("the keys the page keeps (GAME-09)", () => {
  it("[GAME-09] a field, a select, a button, a link and an editable element keep their keys", () => {
    expect(isTypingTarget(element("<input />"))).toBe(true);
    expect(isTypingTarget(element("<textarea></textarea>"))).toBe(true);
    expect(isTypingTarget(element("<select><option>a</option></select>"))).toBe(true);
    expect(isTypingTarget(element("<button>Weiter</button>"))).toBe(true);
    expect(isTypingTarget(element('<a href="/programme">Programm</a>'))).toBe(true);
    expect(isTypingTarget(element('<div contenteditable="true"></div>'))).toBe(true);
  });

  it("[GAME-09] the body, a plain element, a link without a target and no element leave the game its keys", () => {
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(element("<div>Welt</div>"))).toBe(false);
    expect(isTypingTarget(element("<a>ohne Ziel</a>"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
