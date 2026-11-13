// Inhalte (sw-architecture.md 6.2, CNT-05; UX mock `admin-content`): the start page text and the
// website pages, in the order of "Mehr", with Markdown and a live preview. Changes are live at
// once; there are no drafts. Admins and staff with `editWebsiteContent` get in (ROLE-06, ROLE-07).
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  CONTENT_MAX_LENGTH,
  contentResponseSchema,
  pageRequestSchema,
  startRequestSchema,
} from "@zappaloo/shared";
import type { ContentPage, PageRequest } from "@zappaloo/shared";
import Markdown from "../app/Markdown.tsx";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";
import { Switch } from "./ui.tsx";

const CONTENT_PATH = "/api/content";
const PAGES_PATH = "/api/content/pages";
const ORDER_PATH = "/api/content/order";
const START_PATH = "/api/content/start";

/** What the editor shows: the start page text, one page, or a new page. */
type Selection = { kind: "start" } | { kind: "page"; id: number } | { kind: "new" };

const selectionKey = (selection: Selection) =>
  selection.kind === "page" ? `page-${String(selection.id)}` : selection.kind;

/** A slug from a title: "Anreise & Parkieren" → "anreise-parkieren". */
function slugFrom(title: string): string {
  return title
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** The Markdown field with its preview, shared by the start page and the pages. */
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

interface EditorProps {
  /** The page being edited; undefined for a new page. */
  page?: ContentPage;
  /** Saves the page and returns an error text, or undefined. */
  onSave: (input: PageRequest) => Promise<string | undefined>;
  onDelete?: () => Promise<void>;
}

/** Title, address, text, visibility and publish of one page. */
function PageEditor({ page, onSave, onDelete }: EditorProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(page?.title ?? "");
  const [slug, setSlug] = useState(page?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(page !== undefined);
  const [markdown, setMarkdown] = useState(page?.markdown ?? "");
  const [inMore, setInMore] = useState(page?.inMore ?? true);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { title: title.trim(), slug: slug.trim(), markdown, inMore };
    const parsed = pageRequestSchema.safeParse(input);
    if (!parsed.success) {
      setError(t("admin.content.invalid"));
      setSaved(false);
      return;
    }
    const failed = await onSave(parsed.data);
    setError(failed);
    setSaved(failed === undefined);
  }

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
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
      <TextField
        label={t("admin.content.text")}
        value={markdown}
        onChange={(value) => {
          setMarkdown(value);
          setSaved(false);
        }}
      />
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
        {onDelete && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              if (confirming) void onDelete();
              else setConfirming(true);
            }}
          >
            {confirming ? t("admin.content.deleteConfirm") : t("admin.content.delete")}
          </button>
        )}
      </div>
    </form>
  );
}

/** The start page text; it is saved on its own (`PUT /api/content/start`). */
function StartEditor({
  markdown,
  onSave,
}: {
  markdown: string;
  onSave: (markdown: string) => Promise<string | undefined>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(markdown);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = startRequestSchema.safeParse({ markdown: text });
        if (!parsed.success) return;
        void onSave(text).then((failed) => {
          setError(failed);
          setSaved(failed === undefined);
        });
      }}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <TextField
        label={t("admin.content.startText")}
        value={text}
        onChange={(value) => {
          setText(value);
          setSaved(false);
        }}
      />
      <div className="row">
        <button type="submit" className="btn sm">
          {t("admin.content.publish")}
        </button>
        {saved && (
          <span role="status" className="hint">
            {t("admin.content.saved")}
          </span>
        )}
      </div>
    </form>
  );
}

export default function AdminContentPage() {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const { data, reload } = useAdminData(CONTENT_PATH, contentResponseSchema);
  const [selection, setSelection] = useState<Selection>({ kind: "start" });
  const [error, setError] = useState<string>();
  if (!data) return null;
  const pages = data.pages;

  const selected =
    selection.kind === "page" ? data.pages.find((p) => p.id === selection.id) : undefined;

  /** Saves a page; a new page is selected by its address once it exists. */
  async function savePage(id: number | undefined, input: PageRequest) {
    const result =
      id === undefined
        ? await call("POST", PAGES_PATH, input)
        : await call("PUT", `/api/content/pages/${String(id)}`, input);
    if (!result.ok) return errorText(result.errorCode);
    const parsed = contentResponseSchema.safeParse(result.body);
    if (parsed.success) {
      const created = parsed.data.pages.find((p) => p.slug === input.slug);
      if (id === undefined && created) setSelection({ kind: "page", id: created.id });
    }
    reload();
    return undefined;
  }

  async function deletePage(id: number) {
    const result = await call("DELETE", `/api/content/pages/${String(id)}`);
    if (!result.ok) {
      setError(errorText(result.errorCode));
      return;
    }
    setError(undefined);
    setSelection({ kind: "start" });
    reload();
  }

  /** Swaps the page at `index` with its neighbour; the server takes the whole new order. */
  async function move(index: number, direction: -1 | 1) {
    const ids = pages.map((p) => p.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] ?? 0, ids[index] ?? 0];
    const result = await call("PUT", ORDER_PATH, { ids });
    if (!result.ok) setError(errorText(result.errorCode));
    else setError(undefined);
    reload();
  }

  return (
    <>
      <div className="row">
        <h1 className="h1 grow">{t("admin.content.title")}</h1>
        <button
          type="button"
          className="btn soft sm"
          onClick={() => {
            setSelection({ kind: "new" });
          }}
        >
          + {t("admin.content.newPage")}
        </button>
      </div>
      <span className="hint">{t("admin.content.languageHint")}</span>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="grid-2">
        <section className="card" aria-label={t("admin.content.pages")}>
          <ul className="list">
            <li className="li">
              <button
                type="button"
                className="link grow"
                aria-pressed={selection.kind === "start"}
                onClick={() => {
                  setSelection({ kind: "start" });
                }}
              >
                <b>{t("admin.content.start")}</b>
              </button>
              <span className="hint">{t("admin.content.startHint")}</span>
            </li>
          </ul>
          <span className="eyebrow">{t("admin.content.pages")}</span>
          {data.pages.length === 0 && <span className="hint">{t("admin.content.pagesNone")}</span>}
          <ul className="list">
            {data.pages.map((page, index) => (
              <li key={page.id} className="li">
                <button
                  type="button"
                  className="link grow"
                  aria-pressed={selection.kind === "page" && selection.id === page.id}
                  onClick={() => {
                    setSelection({ kind: "page", id: page.id });
                  }}
                >
                  <b>{page.title}</b>
                </button>
                <span className="hint">
                  {t("admin.content.listed", {
                    slug: page.slug,
                    state: page.inMore ? t("admin.content.inMore") : t("admin.content.notInMore"),
                  })}
                </span>
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
                  disabled={index === data.pages.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  ↓
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="stack">
          {selection.kind === "start" && (
            <StartEditor
              key="start"
              markdown={data.startMarkdown}
              onSave={async (markdown) => {
                const result = await call("PUT", START_PATH, { markdown });
                if (result.ok) reload();
                return result.ok ? undefined : errorText(result.errorCode);
              }}
            />
          )}
          {selection.kind === "new" && (
            <PageEditor key="new" onSave={(input) => savePage(undefined, input)} />
          )}
          {selected && (
            <PageEditor
              key={selectionKey(selection)}
              page={selected}
              onSave={(input) => savePage(selected.id, input)}
              onDelete={() => deletePage(selected.id)}
            />
          )}
          {selection.kind === "page" && !selected && (
            <p className="hint">{t("admin.content.choose")}</p>
          )}
        </section>
      </div>
    </>
  );
}
