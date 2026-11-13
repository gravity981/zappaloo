// The place editor (sw-architecture.md 6.2, CNT-07; UX mock `admin-content`, variant "Edit place"):
// name, address, Google Maps link (https only) and the map image of this place. The map image is
// not one of the page images; it belongs to the place (`place:<id>`).
import { useState } from "react";
import type { ReactNode, SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { contentResponseSchema, placeRequestSchema } from "@zappaloo/shared";
import type { ContentPlace, PlaceRequest } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { useSession } from "../app/session.ts";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";
import { CONTENT_LIST, CONTENT_PATH, IMAGES_PATH, PLACES_PATH, placeItem } from "./contentApi.ts";

/** The map image of a place: upload, replace and remove (CNT-07). */
function MapImageCard({ place, onChanged }: { place: ContentPlace; onChanged: () => void }) {
  const { t } = useTranslation();
  const { csrfToken } = useSession();
  const call = useAdminCall();
  const errorText = useErrorText();
  const [error, setError] = useState<string>();

  /** Stores `file` as the map image of this place; the old one is removed after the change. */
  async function setMap(file: File | undefined) {
    if (!file) return;
    const uploaded = await apiRequest("POST", `${IMAGES_PATH}?item=${placeItem(place.id)}`, {
      csrfToken,
      raw: file,
    });
    if (!uploaded.ok) {
      setError(errorText(uploaded.errorCode));
      return;
    }
    const answer = uploaded.body as { image?: { id: number } };
    const newId = answer.image?.id ?? null;
    const linked = await call("PUT", `${PLACES_PATH}/${String(place.id)}`, {
      name: place.name,
      address: place.address,
      mapsUrl: place.mapsUrl,
      mapImageId: newId,
    });
    if (!linked.ok) {
      setError(errorText(linked.errorCode));
    } else {
      setError(undefined);
      if (place.mapImageId !== null && place.mapImageId !== newId) {
        await call("DELETE", `${IMAGES_PATH}/${String(place.mapImageId)}`);
      }
    }
    onChanged();
  }

  async function removeMap() {
    if (place.mapImageId === null) return;
    const result = await call("DELETE", `${IMAGES_PATH}/${String(place.mapImageId)}`);
    setError(result.ok ? undefined : errorText(result.errorCode));
    onChanged();
  }

  const fileInput = (label: string) => (
    <label className="btn soft sm">
      {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          void setMap(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </label>
  );

  return (
    <div className="card">
      <span className="eyebrow">{t("admin.content.placeMapTitle")}</span>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {place.mapImageId === null ? (
        <>
          {fileInput(t("admin.content.uploadMap"))}
          <span className="hint">{t("admin.content.mapImageHint")}</span>
        </>
      ) : (
        <>
          <img
            className="map-preview"
            src={`${IMAGES_PATH}/${String(place.mapImageId)}`}
            alt={place.name}
          />
          <div className="row">
            {fileInput(t("admin.content.replaceMap"))}
            <button type="button" className="btn ghost sm" onClick={() => void removeMap()}>
              {t("admin.content.removeMap")}
            </button>
          </div>
          <span className="hint">{t("admin.content.mapImageHint")}</span>
        </>
      )}
    </div>
  );
}

/** The fields and the actions of one place; `place` undefined is a new place. */
function PlaceForm({
  place,
  onSaved,
  onDeleted,
  mapCard,
}: {
  place?: ContentPlace;
  /** Saved: a new place returns to the list. */
  onSaved: () => void;
  onDeleted: () => void;
  mapCard: ReactNode;
}) {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const [name, setName] = useState(place?.name ?? "");
  const [address, setAddress] = useState(place?.address ?? "");
  const [mapsUrl, setMapsUrl] = useState(place?.mapsUrl ?? "");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: PlaceRequest = {
      name: name.trim(),
      address: address.trim() === "" ? null : address.trim(),
      mapsUrl: mapsUrl.trim() === "" ? null : mapsUrl.trim(),
      mapImageId: place?.mapImageId ?? null,
    };
    const parsed = placeRequestSchema.safeParse(body);
    if (!parsed.success) {
      setError(t("admin.content.placeInvalid"));
      setSaved(false);
      return;
    }
    if (place) {
      const result = await call("PUT", `${PLACES_PATH}/${String(place.id)}`, parsed.data);
      setError(result.ok ? undefined : errorText(result.errorCode));
      setSaved(result.ok);
      if (result.ok) onSaved();
      return;
    }
    const result = await call("POST", PLACES_PATH, parsed.data);
    if (!result.ok) {
      setError(errorText(result.errorCode));
      return;
    }
    onSaved();
  }

  async function remove() {
    if (!place) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const result = await call("DELETE", `${PLACES_PATH}/${String(place.id)}`);
    if (result.ok) onDeleted();
    else setError(errorText(result.errorCode));
  }

  return (
    <form className="stack" onSubmit={(event) => void save(event)}>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="card">
        <div className="grid-2">
          <label className="field">
            <span>{t("admin.content.placeName")}</span>
            <input
              className="input"
              value={name}
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
            />
          </label>
          <label className="field">
            <span>{t("admin.content.placeAddress")}</span>
            <input
              className="input"
              value={address}
              maxLength={200}
              onChange={(event) => {
                setAddress(event.target.value);
                setSaved(false);
              }}
            />
          </label>
        </div>
        <label className="field">
          <span>{t("admin.content.placeLink")}</span>
          <input
            className="input"
            type="url"
            value={mapsUrl}
            maxLength={500}
            onChange={(event) => {
              setMapsUrl(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <small className="hint">{t("admin.content.placeLinkHint")}</small>
      </div>
      {mapCard}
      <div className="row">
        <button type="submit" className="btn sm">
          {t("admin.content.placeSave")}
        </button>
        {saved && (
          <span role="status" className="hint">
            {t("admin.content.saved")}
          </span>
        )}
        <span className="grow" />
        {place && (
          <button type="button" className="btn ghost sm" onClick={() => void remove()}>
            {confirming ? t("admin.content.deleteConfirm") : t("admin.content.placeDelete")}
          </button>
        )}
      </div>
      <span className="hint">{t("admin.content.placeInUse")}</span>
    </form>
  );
}

/** The place editor screen: `/admin/content/places/:id` or `…/new`. */
export default function ContentPlaceEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { data, reload } = useAdminData(CONTENT_PATH, contentResponseSchema);
  if (!data) return null;

  const isNew = id === "new";
  const place = isNew ? undefined : data.places.find((p) => String(p.id) === id);
  if (!isNew && !place) {
    return (
      <>
        <Link className="sm" to="/admin/content">
          ‹ {t("admin.content.title")}
        </Link>
        <p className="hint">{t("admin.content.choose")}</p>
      </>
    );
  }

  return (
    <>
      <Link className="sm" to="/admin/content">
        ‹ {t("admin.content.title")}
      </Link>
      <h1 className="h1">{place ? place.name : t("admin.content.newPlaceTitle")}</h1>
      <PlaceForm
        key={id}
        place={place}
        mapCard={
          place ? (
            <MapImageCard place={place} onChanged={reload} />
          ) : (
            <span className="hint">{t("admin.content.placeImagesAfterSave")}</span>
          )
        }
        onSaved={() => {
          if (place) reload();
          else void navigate(CONTENT_LIST, { replace: true });
        }}
        onDeleted={() => {
          void navigate(CONTENT_LIST);
        }}
      />
    </>
  );
}
