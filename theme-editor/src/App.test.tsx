import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App.tsx";

describe("theme package editor shell (THM-08)", () => {
  it("[THM-08] shows the editor's title", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Theme package editor" })).toBeTruthy();
  });
});
