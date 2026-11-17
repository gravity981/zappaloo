// The hint for newcomers (GAME-17): shown until the player uses the first object, on this device.
import { useTranslation } from "react-i18next";

function hasFinePointer(): boolean {
  try {
    return window.matchMedia("(pointer: fine)").matches;
  } catch {
    return false;
  }
}

export default function GameHint() {
  const { t } = useTranslation();
  const fine = hasFinePointer();
  return (
    <p className="game-hint" data-testid="game-hint">
      {t(fine ? "game.hint.desktop" : "game.hint.touch")}
    </p>
  );
}
