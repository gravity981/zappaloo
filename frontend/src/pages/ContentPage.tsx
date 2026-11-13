// A page of the website at `/p/<slug>` (sw-architecture.md 6.2, WEB-02, WEB-03; UX mock `info`):
// the title, the Markdown text, and the places the page lists as cards next to the text (CNT-07).
// A place card shows its map image and the link "In Google Maps öffnen" in a new tab; nothing is
// embedded from Google.
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { contentResponseSchema } from "@zappaloo/shared";
import type { ContentPlace } from "@zappaloo/shared";
import Markdown from "../app/Markdown.tsx";
import { useApiData } from "../app/useApi.ts";

/** A place as a card: name, address, its map image, and the link to the map app. */
function PlaceCard({ place }: { place: ContentPlace }) {
  const { t } = useTranslation();
  return (
    <section className="card place-card">
      <b>{place.name}</b>
      {place.address !== null && <span className="hint">{place.address}</span>}
      {place.mapImageId !== null && (
        <img
          className="map-preview"
          src={`/api/content/images/${String(place.mapImageId)}`}
          alt={t("website.mapAlt", { name: place.name })}
        />
      )}
      {place.mapsUrl !== null && (
        <a className="btn soft sm" href={place.mapsUrl} target="_blank" rel="noopener noreferrer">
          {t("website.openMaps")}
        </a>
      )}
    </section>
  );
}

export default function ContentPage() {
  const { t } = useTranslation();
  const { slug = "" } = useParams();
  const content = useApiData("/api/content", contentResponseSchema);
  if (!content) return null;
  const page = content.pages.find((candidate) => candidate.slug === slug);
  if (!page) {
    return (
      <section>
        <h1>{t("website.pageNotFound")}</h1>
        <Link to="/mehr">{t("nav.more")}</Link>
      </section>
    );
  }
  const places = content.places.filter((place) => page.placeIds.includes(place.id));
  return (
    <article className="page-view">
      <nav className="crumb" aria-label={t("website.breadcrumb")}>
        <Link to="/mehr">{t("nav.more")}</Link> › {page.title}
      </nav>
      <div className="page-grid">
        <div className="page-text">
          <h1>{page.title}</h1>
          <Markdown text={page.markdown} />
        </div>
        {places.length > 0 && (
          <div className="stack">
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
