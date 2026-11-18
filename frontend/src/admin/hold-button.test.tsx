// The confirmation button of risky actions: it needs four seconds of holding (design reset,
// world rollback).
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HoldButton } from "./ui.tsx";

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const onConfirm = vi.fn();
  render(
    <div className="admin">
      <HoldButton onConfirm={onConfirm}>Ja, löschen</HoldButton>
    </div>,
  );
  return { onConfirm, button: screen.getByRole("button", { name: "Ja, löschen" }) };
}
const wait = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("the hold button", () => {
  it("[THM-01][MAP-08] confirms only after four seconds of holding, and fills up meanwhile", () => {
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button);
    expect(button).toHaveClass("holding");
    wait(3900);
    expect(onConfirm).not.toHaveBeenCalled();
    wait(100);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button).not.toHaveClass("holding");
  });

  it("[THM-01][MAP-08] letting go early, or a plain click, does nothing and the fill starts over", () => {
    const { onConfirm, button } = setup();
    fireEvent.click(button);
    fireEvent.pointerDown(button);
    wait(3000);
    fireEvent.pointerUp(button);
    expect(button).not.toHaveClass("holding");
    wait(5000);
    expect(onConfirm).not.toHaveBeenCalled();
    // Leaving the button cancels, too, and a new hold counts from zero.
    fireEvent.pointerDown(button);
    wait(3000);
    fireEvent.pointerLeave(button);
    fireEvent.pointerDown(button);
    wait(3900);
    expect(onConfirm).not.toHaveBeenCalled();
    wait(100);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("[THM-01][MAP-08] the Enter key held for four seconds confirms as well", () => {
    const { onConfirm, button } = setup();
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: "Enter", repeat: true });
    wait(4000);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(button, { key: " " });
    wait(2000);
    fireEvent.keyUp(button, { key: " " });
    wait(4000);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
