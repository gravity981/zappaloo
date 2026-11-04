import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

// Phaser is only downloaded when the game is opened, so the website stays light.
const GameCanvas = lazy(() => import("../game/GameCanvas.tsx"));

export default function GamePage() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<p>{t("game.loading")}</p>}>
      <GameCanvas />
    </Suspense>
  );
}
