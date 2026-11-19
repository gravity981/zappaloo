// The picture of the guest's own figure in the profile card "Figur" (UX mock `profile`). Nothing is shown while
// the figure or its art is not loaded, or when the world has no figure for the guest.
import { useEffect, useState } from "react";
import { avatarResponseSchema } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { loadFigureArt } from "../avatar/figure-art.ts";
import { FigureImage } from "../avatar/FigurePreview.tsx";

export default function OwnFigure() {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    void Promise.all([apiRequest("GET", "/api/avatar"), loadFigureArt()]).then(
      ([result, art]) => {
        const parsed = avatarResponseSchema.safeParse(result.body);
        const figure = result.ok && parsed.success ? parsed.data.persons[0]?.figure : undefined;
        if (!cancelled && figure != null) setUrl(art.get(figure)?.stand);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);
  if (url === undefined) return null;
  return (
    <div className="avatar-stage own-figure">
      <FigureImage url={url} scale={5} />
    </div>
  );
}
