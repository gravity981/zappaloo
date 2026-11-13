// Inhalte, the list (sw-architecture.md 6.2, CNT-05 – CNT-07; UX mock `admin-content`, variant
// "List"): two cards, «Seiten» with the Startseite and the pages in the order of «Mehr», and
// «Orte». A row opens its own editor; the arrows only move a page. Admins and staff with
// `editWebsiteContent` get in (ROLE-06, ROLE-07).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { contentResponseSchema } from "@zappaloo/shared";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";
import { CONTENT_PATH, ORDER_PATH } from "./contentApi.ts";

const START_PATH = "/admin/content/pages/start";
const pagePath = (id: number) => `/admin/content/pages/${String(id)}`;
const placePath = (id: number) => `/admin/content/places/${String(id)}`;

export default function AdminContentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const call = useAdminCall();
  const errorText = useErrorText();
  const { data, reload } = useAdminData(CONTENT_PATH, contentResponseSchema);
  const [error, setError] = useState<string>();
  if (!data) return null;
  const pages = data.pages;

  /** Swaps the page at `index` with its neighbour; the server takes the whole new order. */
  async function move(index: number, direction: -1 | 1) {
    const ids = pages.map((p) => p.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] ?? 0, ids[index] ?? 0];
    const result = await call("PUT", ORDER_PATH, { ids });
    setError(result.ok ? undefined : errorText(result.errorCode));
    reload();
  }

  return (
    <>
      <h1 className="h1">{t("admin.content.title")}</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section className="card" aria-labelledby="pages-title">
        <div className="row">
          <span id="pages-title" className="eyebrow grow">
            {t("admin.content.pages")}
          </span>
          <button
            type="button"
            className="btn soft sm"
            onClick={() => {
              void navigate("/admin/content/pages/new");
            }}
          >
            + {t("admin.content.newPage")}
          </button>
        </div>
        <ul className="list">
          <li className="li li-row">
            <Link className="li-main" to={START_PATH}>
              <span className="grow">
                <b>{t("admin.content.start")}</b>
                <span className="hint">{t("admin.content.startHint")}</span>
              </span>
            </Link>
            <Link className="chevron" to={START_PATH} tabIndex={-1} aria-hidden>
              ›
            </Link>
          </li>
          {pages.map((page, index) => (
            <li key={page.id} className="li li-row">
              <Link className="li-main" to={pagePath(page.id)}>
                <span className="grow">
                  <b>{page.title}</b>
                  <span className="hint">
                    {t("admin.content.address", { slug: page.slug })}
                    {!page.inMore && ` · ${t("admin.content.hiddenFromMore")}`}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                className="btn ghost sm"
                aria-label={t("admin.content.moveUp")}
                disabled={index === 0}
                onClick={() => void move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn ghost sm"
                aria-label={t("admin.content.moveDown")}
                disabled={index === pages.length - 1}
                onClick={() => void move(index, 1)}
              >
                ↓
              </button>
              <Link className="chevron" to={pagePath(page.id)} tabIndex={-1} aria-hidden>
                ›
              </Link>
            </li>
          ))}
        </ul>
        {pages.length === 0 && <span className="hint">{t("admin.content.pagesNone")}</span>}
      </section>
      <section className="card" aria-labelledby="places-title">
        <div className="row">
          <span id="places-title" className="eyebrow grow">
            {t("admin.content.places")}
          </span>
          <button
            type="button"
            className="btn soft sm"
            onClick={() => {
              void navigate("/admin/content/places/new");
            }}
          >
            + {t("admin.content.newPlace")}
          </button>
        </div>
        <ul className="list">
          {data.places.map((place) => (
            <li key={place.id} className="li li-row">
              <Link className="li-main" to={placePath(place.id)}>
                <span className="grow">
                  <b>{place.name}</b>
                  <span className="hint">{place.address ?? t("admin.content.placeNoAddress")}</span>
                </span>
              </Link>
              <Link className="chevron" to={placePath(place.id)} tabIndex={-1} aria-hidden>
                ›
              </Link>
            </li>
          ))}
        </ul>
        {data.places.length === 0 && <span className="hint">{t("admin.content.placesNone")}</span>}
      </section>
    </>
  );
}
