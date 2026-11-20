// The name of what an object shows (GAME-40): the label of its edge indicator and of the label in the game.
import { beforeAll, describe, expect, it } from "vitest";
import i18next from "i18next";
import { initI18n } from "../i18n/i18n.ts";
import { objectTitle } from "./titles.ts";

beforeAll(async () => {
  await initI18n();
});

const pages = new Map([["anreise", "Anreise & Parkieren"]]);
const dialogues = new Map([["pfarrer-keller", "Pfarrer Keller"]]);
const title = (action: Parameters<typeof objectTitle>[0]) =>
  objectTitle(action, i18next.t.bind(i18next), pages, dialogues);

describe("the title of what an object opens (GAME-40)", () => {
  it("[GAME-40] is the name of a built-in page as the navigation has it", () => {
    expect(title({ kind: "page", page: "programme" })).toBe("Programm");
    expect(title({ kind: "page", page: "rsvp" })).toBe("Anmeldung");
    expect(title({ kind: "page", page: "profile" })).toBe("Profil");
    expect(title({ kind: "page", page: "seating" })).toBe("Wo sitze ich?");
  });

  it("[GAME-40] is the title of a content page; a page the guest cannot read has none, so the object's own label stands", () => {
    expect(title({ kind: "page", page: "p/anreise" })).toBe("Anreise & Parkieren");
    expect(title({ kind: "page", page: "p/geheim" })).toBeUndefined();
  });

  it("[GAME-40][CNT-09] a dialogue is named by the figure name of the dialogue; one that no longer exists has none", () => {
    expect(title({ kind: "dialog", dialogId: "pfarrer-keller" })).toBe("Pfarrer Keller");
    expect(title({ kind: "dialog", dialogId: "gibt-es-nicht" })).toBeUndefined();
  });

  it("[GAME-40] a minigame or no action has none", () => {
    expect(title({ kind: "minigame", minigameId: "quiz-01" })).toBeUndefined();
    expect(title({ kind: "none" })).toBeUndefined();
  });
});
