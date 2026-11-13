// The editor of a page and of the Startseite (sw-architecture.md 6.2, CNT-05, CNT-06; UX mock
// `admin-content`, variant "Edit page"): title and address, the Markdown text with a live preview,
// the images of this page, the places it shows, «In «Mehr» sichtbar», «Veröffentlichen» and the
// delete. The Startseite uses the same screen without address, visibility and places.
import { useState } from "react";
import type { ReactNode, SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import {
  CONTENT_MAX_LENGTH,
  contentResponseSchema,
  imagesResponseSchema,
  pageRequestSchema,
  startRequestSchema,
} from "@zappaloo/shared";
import type { ContentImage, ContentPage, ContentPlace, StartSettings } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import Markdown from "../app/Markdown.tsx";
import { useSession } from "../app/session.ts";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";
import {
  CONTENT_LIST,
  CONTENT_PATH,
  IMAGES_PATH,
  PAGES_PATH,
  START_PATH,
  imageMarkdown,
  imagesPath,
  pageItem,
  slugFrom,
  textUsesImage,
} from "./contentApi.ts";
import { Switch, ToggleChip } from "./ui.tsx";

/** The Markdown field with its preview. */
function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid-2">
      <label className="field">
        <span>{label}</span>
        <textarea
          className="input"
          rows={14}
          value={value}
          maxLength={CONTENT_MAX_LENGTH}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      </label>
      <div className="card">
        <span className="eyebrow">{t("admin.content.preview")}</span>
        <Markdown text={value} />
      </div>
    </div>
  );
}

/** The images of one owner (CNT-06): upload, Markdown to copy, and removal while no text uses one. */
function ImagesPanel({
  owner,
  label,
  savedMarkdown,
}: {
  owner: string;
  label: string;
  /** The text as it is saved: a picture that the text still shows cannot be removed. */
  savedMarkdown: string;
}) {
  const { t } = useTranslation();
  const { csrfToken } = useSession();
  const call = useAdminCall();
  const errorText = useErrorText();
  const { data, reload } = useAdminData(imagesPath(owner), imagesResponseSchema);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<number>();

  async function upload(file: File | undefined) {
    if (!file) return;
    const result = await apiRequest("POST", imagesPath(owner), { csrfToken, raw: file });
    setError(result.ok ? undefined : errorText(result.errorCode));
    reload();
  }

  async function remove(image: ContentImage) {
    const result = await call("DELETE", `${IMAGES_PATH}/${String(image.id)}`);
    setError(result.ok ? undefined : errorText(result.errorCode));
    reload();
  }

  function copy(image: ContentImage) {
    try {
      void navigator.clipboard
        .writeText(imageMarkdown(t("admin.content.imageAlt"), image.id))
        .then(() => {
          setCopied(image.id);
        })
        .catch(() => undefined);
    } catch {
      // No clipboard (plain http): the Markdown is shown in the list for copying by hand.
    }
  }

  return (
    <section className="card" aria-labelledby="images-title">
      <div className="row">
        <b id="images-title" className="grow">
          {label}
        </b>
        <label className="btn soft sm">
          {t("admin.content.uploadImage")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <span className="hint">{t("admin.content.imagesHint")}</span>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data?.images.length === 0 && <span className="hint">{t("admin.content.imagesNone")}</span>}
      <ul className="list sm">
        {data?.images.map((image) => (
          <li key={image.id} className="li">
            <span className="grow">
              <b className="sm">
                {t("admin.content.imageLabel", {
                  id: image.id,
                  type: image.mime.replace("image/", "").toUpperCase(),
                  kb: Math.round(image.bytes / 1024),
                })}
              </b>
              <span className="hint">
                {textUsesImage(savedMarkdown, image.id)
                  ? t("admin.content.imageInText")
                  : t("admin.content.imageNotInText")}
              </span>
              <span className="hint">{imageMarkdown(t("admin.content.imageAlt"), image.id)}</span>
            </span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                copy(image);
              }}
            >
              {copied === image.id ? t("admin.content.copied") : t("admin.content.copyMarkdown")}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => void remove(image)}>
              {t("admin.content.removeImage")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The hero image of the start page (WEB-10): one of its images, with the alt text. */
function HeroCard({
  value,
  onChange,
}: {
  value: StartSettings;
  onChange: (next: StartSettings) => void;
}) {
  const { t } = useTranslation();
  const images = useAdminData(imagesPath("start"), imagesResponseSchema);
  return (
    <div className="card">
      <span className="eyebrow">{t("admin.content.heroTitle")}</span>
      {value.heroImageId !== null && (
        <img
          className="map-preview"
          src={`${IMAGES_PATH}/${String(value.heroImageId)}`}
          alt={value.heroAlt ?? ""}
        />
      )}
      <div className="row">
        <label className="field grow">
          <span>{t("admin.content.heroPick")}</span>
          <select
            className="input"
            value={value.heroImageId === null ? "" : String(value.heroImageId)}
            onChange={(event) => {
              const id = event.target.value === "" ? null : Number(event.target.value);
              onChange({ ...value, heroImageId: id });
            }}
          >
            <option value="">{t("admin.content.noHero")}</option>
            {images.data?.images.map((image) => (
              <option key={image.id} value={image.id}>
                {t("admin.content.imageOption", { id: image.id })}
              </option>
            ))}
          </select>
        </label>
        {value.heroImageId !== null && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              onChange({ heroImageId: null, heroAlt: null, countdown: value.countdown });
            }}
          >
            {t("admin.content.removeHero")}
          </button>
        )}
      </div>
      <label className="field">
        <span>{t("admin.content.heroAlt")}</span>
        <input
          className="input"
          value={value.heroAlt ?? ""}
          maxLength={200}
          onChange={(event) => {
            onChange({ ...value, heroAlt: event.target.value });
          }}
        />
      </label>
      <span className="hint">{t("admin.content.heroHint")}</span>
    </div>
  );
}

interface FormProps {
  /** The Startseite: its text, the hero image and the countdown switch. */
  isStart: boolean;
  page?: ContentPage;
  startMarkdown: string;
  start: StartSettings;
  places: ContentPlace[];
  /** The images card, between the text and the places. */
  images: ReactNode;
  onSaved: () => void;
  /** A new page is saved: the screen goes back to the list. */
  onCreated: () => void;
  onDeleted: () => void;
}

/** Title, address, text, places, visibility and publish of one page; the text alone for the start page. */
function PageForm({
  isStart,
  page,
  startMarkdown,
  start,
  places,
  images,
  onSaved,
  onCreated,
  onDeleted,
}: FormProps) {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const [title, setTitle] = useState(page?.title ?? "");
  const [slug, setSlug] = useState(page?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(page !== undefined);
  const [markdown, setMarkdown] = useState(isStart ? startMarkdown : (page?.markdown ?? ""));
  const [hero, setHero] = useState<StartSettings>(start);
  const [inMore, setInMore] = useState(page?.inMore ?? true);
  const [placeIds, setPlaceIds] = useState<number[]>(page?.placeIds ?? []);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isStart) {
      const parsed = startRequestSchema.safeParse({
        markdown,
        heroImageId: hero.heroImageId,
        heroAlt: hero.heroAlt,
        countdown: hero.countdown,
      });
      if (!parsed.success) return;
      const result = await call("PUT", START_PATH, parsed.data);
      setError(result.ok ? undefined : errorText(result.errorCode));
      setSaved(result.ok);
      if (result.ok) onSaved();
      return;
    }
    const input = { title: title.trim(), slug: slug.trim(), markdown, inMore, placeIds };
    const parsed = pageRequestSchema.safeParse(input);
    if (!parsed.success) {
      setError(t("admin.content.invalid"));
      setSaved(false);
      return;
    }
    if (page) {
      const result = await call("PUT", `${PAGES_PATH}/${String(page.id)}`, parsed.data);
      setError(result.ok ? undefined : errorText(result.errorCode));
      setSaved(result.ok);
      if (result.ok) onSaved();
      return;
    }
    const result = await call("POST", PAGES_PATH, parsed.data);
    if (!result.ok) {
      setError(errorText(result.errorCode));
      return;
    }
    onCreated();
  }

  async function remove() {
    if (!page) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const result = await call("DELETE", `${PAGES_PATH}/${String(page.id)}`);
    if (result.ok) onDeleted();
    else setError(errorText(result.errorCode));
  }

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!isStart && (
        <div className="card">
          <label className="field">
            <span>{t("admin.content.titleField")}</span>
            <input
              className="input"
              value={title}
              maxLength={120}
              onChange={(event) => {
                setTitle(event.target.value);
                if (!slugEdited) setSlug(slugFrom(event.target.value));
                setSaved(false);
              }}
            />
          </label>
          <label className="field">
            <span>{t("admin.content.slugField")}</span>
            <input
              className="input"
              value={slug}
              maxLength={60}
              onChange={(event) => {
                setSlug(event.target.value);
                setSlugEdited(true);
                setSaved(false);
              }}
            />
          </label>
          <small className="hint">{t("admin.content.slugHint", { slug: slug.trim() })}</small>
        </div>
      )}
      {isStart && (
        <HeroCard
          value={hero}
          onChange={(next) => {
            setHero(next);
            setSaved(false);
          }}
        />
      )}
      <TextField
        label={isStart ? t("admin.content.startText") : t("admin.content.text")}
        value={markdown}
        onChange={(value) => {
          setMarkdown(value);
          setSaved(false);
        }}
      />
      {images}
      {isStart && (
        <div className="card">
          <div className="setrow">
            <div className="grow">
              <b className="sm">{t("admin.content.countdownSwitch")}</b>
              <span className="hint">{t("admin.content.countdownHint")}</span>
            </div>
            <Switch
              checked={hero.countdown}
              label={t("admin.content.countdownSwitch")}
              onChange={(value) => {
                setHero({ ...hero, countdown: value });
                setSaved(false);
              }}
            />
          </div>
        </div>
      )}
      {!isStart && (
        <div className="card">
          <span className="eyebrow">{t("admin.content.pagePlaces")}</span>
          <span className="hint">{t("admin.content.pagePlacesHint")}</span>
          {places.length === 0 && <span className="hint">{t("admin.content.placesNone")}</span>}
          <div className="row">
            {places.map((place) => (
              <ToggleChip
                key={place.id}
                small
                pressed={placeIds.includes(place.id)}
                onToggle={() => {
                  setPlaceIds((current) =>
                    current.includes(place.id)
                      ? current.filter((id) => id !== place.id)
                      : [...current, place.id],
                  );
                  setSaved(false);
                }}
              >
                {place.name}
              </ToggleChip>
            ))}
          </div>
        </div>
      )}
      {!isStart && (
        <>
          <div className="row">
            <Switch
              checked={inMore}
              label={t("admin.content.moreSwitch")}
              onChange={(value) => {
                setInMore(value);
                setSaved(false);
              }}
            />
            <span className="hint">{t("admin.content.moreSwitch")}</span>
          </div>
          <small className="hint">{t("admin.content.moreHint")}</small>
        </>
      )}
      <div className="row">
        <button type="submit" className="btn sm">
          {t("admin.content.publish")}
        </button>
        {saved && (
          <span role="status" className="hint">
            {t("admin.content.saved")}
          </span>
        )}
        <span className="grow" />
        {page && (
          <button type="button" className="btn ghost sm" onClick={() => void remove()}>
            {confirming ? t("admin.content.deleteConfirm") : t("admin.content.delete")}
          </button>
        )}
      </div>
    </form>
  );
}

/** The page editor screen: `/admin/content/pages/:id`, `…/new` or `…/start`. */
export default function ContentPageEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { data, reload } = useAdminData(CONTENT_PATH, contentResponseSchema);
  if (!data) return null;

  const isStart = id === "start";
  const isNew = id === "new";
  const page = isStart || isNew ? undefined : data.pages.find((p) => String(p.id) === id);
  if (!isStart && !isNew && !page) {
    return (
      <>
        <Link className="sm" to="/admin/content">
          ‹ {t("admin.content.title")}
        </Link>
        <p className="hint">{t("admin.content.choose")}</p>
      </>
    );
  }
  const owner = isStart ? "start" : page ? pageItem(page.id) : undefined;
  const savedMarkdown = isStart ? data.startMarkdown : (page?.markdown ?? "");

  return (
    <>
      <Link className="sm" to="/admin/content">
        ‹ {t("admin.content.title")}
      </Link>
      <h1 className="h1">
        {isStart ? t("admin.content.start") : page ? page.title : t("admin.content.newPageTitle")}
      </h1>
      <PageForm
        key={id}
        isStart={isStart}
        page={page}
        startMarkdown={data.startMarkdown}
        start={data.start}
        places={data.places}
        images={
          owner ? (
            <ImagesPanel
              owner={owner}
              label={isStart ? t("admin.content.startImages") : t("admin.content.pageImages")}
              savedMarkdown={savedMarkdown}
            />
          ) : (
            <span className="hint">{t("admin.content.imagesAfterSave")}</span>
          )
        }
        onSaved={reload}
        onCreated={() => {
          void navigate(CONTENT_LIST, { replace: true });
        }}
        onDeleted={() => {
          void navigate(CONTENT_LIST);
        }}
      />
    </>
  );
}
