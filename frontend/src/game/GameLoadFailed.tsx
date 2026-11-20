// The game's view when it could not be loaded: the black canvas of GameLoading with the message in white in its middle
// (GAME-43). The way back to the website is the game bar's button above it.
import { useTranslation } from "react-i18next";

export default function GameLoadFailed() {
  const { t } = useTranslation();
  return (
    <div className="game-loading" role="alert" data-testid="game-load-failed">
      {t("game.loadFailed")}
    </div>
  );
}
