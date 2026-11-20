// The game's view before the engine starts (GAME-43): a black canvas of the game's size with the loading text in white
// in its middle. The engine takes over with its own progress bar over the same black.
import { useTranslation } from "react-i18next";

export default function GameLoading() {
  const { t } = useTranslation();
  return (
    <div className="game-loading" role="status" data-testid="game-loading">
      {t("game.loading")}
    </div>
  );
}
