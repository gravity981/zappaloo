// Erlebniswelt › Dialoge (sw-architecture.md 6.2, 14.4; CNT-02, CNT-03, CNT-08, CNT-09; UX mock `admin-world`, variants
// "Dialoge" and "Dialog bearbeiten"): the dialogues of the game world, each with the figure's name, a greeting for the
// speech bubble, lines in Markdown, an optional portrait and the objects that show it. The id is made from the name
// when the dialogue is created and shown read-only; it never changes. Deleting needs a long press and is refused while
// an object shows the dialogue.
import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { DIALOGUE_LIMITS, dialogueDetailSchema, dialoguesResponseSchema } from "@zappaloo/shared";
import type { DialogueDetail, DialogueUse } from "@zappaloo/shared";
import Markdown from "../app/Markdown.tsx";
import { apiRequest } from "../app/api.ts";
import { useSession } from "../app/session.ts";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";
import { HoldButton } from "./ui.tsx";

const PATH = "/api/admin/dialogues";
const PORTRAIT_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** "Kirche › pastor": the object as the admin knows it. */
const useName = (): ((use: DialogueUse) => string) => (use) =>
  `${use.mapName ?? use.map} › ${use.object}`;

export default function AdminDialogues() {
  const { t } = useTranslation();
  const name = useName();
  const { data, reload } = useAdminData(PATH, dialoguesResponseSchema);
  /** The dialogue being edited: its id, `new` for a new one, or none for the list. */
  const [editing, setEditing] = useState<string>();
  /** Counts the dialogues opened from the list, so that a new id after saving does not start the editor over. */
  const [opened, setOpened] = useState(0);
  const open = (id: string) => {
    setOpened((count) => count + 1);
    setEditing(id);
  };
  if (!data) return null;
  if (editing !== undefined) {
    return (
      <DialogueEditor
        key={opened}
        id={editing === "new" ? undefined : editing}
        onSwitch={setEditing}
        onBack={() => {
          setEditing(undefined);
          reload();
        }}
      />
    );
  }
  return (
    <section className="card" aria-labelledby="dialogues-title">
      <div className="row">
        <b id="dialogues-title" className="grow">
          {t("admin.dialogues.title")}
        </b>
        <button
          type="button"
          className="btn soft sm"
          onClick={() => {
            open("new");
          }}
        >
          {t("admin.dialogues.add")}
        </button>
      </div>
      {data.dialogues.length === 0 ? (
        <p className="hint">{t("admin.dialogues.none")}</p>
      ) : (
        <ul className="list">
          {data.dialogues.map((dialogue) => (
            <li key={dialogue.id} className="li li-row">
              <button
                type="button"
                className="li-main"
                aria-label={t("admin.dialogues.edit", { name: dialogue.npcName })}
                onClick={() => {
                  open(dialogue.id);
                }}
              >
                <span className="grow">
                  <b>{dialogue.npcName}</b>
                  <span className="hint">
                    {dialogue.id} · {t("admin.dialogues.lines", { count: dialogue.lines })} ·{" "}
                    {dialogue.usedBy.length === 0
                      ? t("admin.dialogues.unused")
                      : dialogue.usedBy.map(name).join(", ")}
                  </span>
                </span>
              </button>
              <span className="chevron">›</span>
            </li>
          ))}
        </ul>
      )}
      <span className="hint">{t("admin.dialogues.hint")}</span>
    </section>
  );
}

function DialogueEditor({
  id,
  onSwitch,
  onBack,
}: {
  id: string | undefined;
  /** Goes to another dialogue after saving: a new one is edited under its id from then on. */
  onSwitch: (id: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const name = useName();
  const call = useAdminCall();
  const { csrfToken } = useSession();
  const errorText = useErrorText({
    portrait_too_large: t("admin.dialogues.portraitTooLarge"),
    portrait_type: t("admin.dialogues.portraitType"),
    portrait_invalid: t("admin.dialogues.portraitInvalid"),
  });
  const [detail, setDetail] = useState<DialogueDetail>();
  const [loaded, setLoaded] = useState(id === undefined);
  const [npcName, setNpcName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [lines, setLines] = useState<string[]>([""]);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  /** The id of the dialogue the editor already holds, so that saving under a new id does not load it again. */
  const known = useRef<string>(undefined);
  /** The latest error texts for the effect below, which must not run again when they are made again. */
  const errors = useRef(errorText);
  useEffect(() => {
    errors.current = errorText;
  });

  /** Takes a saved dialogue as it is now. */
  function take(next: DialogueDetail) {
    known.current = next.id;
    setDetail(next);
    setNpcName(next.npcName);
    setGreeting(next.greeting);
    setLines(next.lines);
  }

  useEffect(() => {
    if (id === undefined || known.current === id) return undefined;
    let cancelled = false;
    void apiRequest("GET", `${PATH}/${id}`).then((result) => {
      const parsed = dialogueDetailSchema.safeParse(result.body);
      if (cancelled) return;
      if (result.ok && parsed.success) {
        take(parsed.data);
        setLoaded(true);
      } else {
        setError(errors.current(result.errorCode));
      }
    });
    return () => {
      cancelled = true;
    };
    // It loads once per dialogue; saving under a new id does not load it again (`known`).
  }, [id]);

  async function save(form: SubmitEvent<HTMLFormElement>) {
    form.preventDefault();
    const body = {
      npcName: npcName.trim(),
      greeting: greeting.trim(),
      lines: lines.map((line) => line.trim()),
    };
    const result =
      id === undefined ? await call("POST", PATH, body) : await call("PUT", `${PATH}/${id}`, body);
    const parsed = dialogueDetailSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setError(undefined);
      setSaved(true);
      take(parsed.data);
      // A new dialogue is edited under its id from now on.
      if (parsed.data.id !== id) onSwitch(parsed.data.id);
    } else {
      setSaved(false);
      setError(errorText(result.errorCode));
    }
  }

  async function remove() {
    if (id === undefined) return;
    const result = await call("DELETE", `${PATH}/${id}`);
    if (result.ok) {
      onBack();
      return;
    }
    const used = (result.body as { used?: DialogueUse[] } | undefined)?.used;
    setError(
      result.errorCode === "dialogue_in_use" && used !== undefined
        ? t("admin.dialogues.inUse", { objects: used.map(name).join(", ") })
        : errorText(result.errorCode),
    );
  }

  async function upload(selected: File | undefined) {
    if (selected === undefined || id === undefined) return;
    if (!PORTRAIT_TYPES.includes(selected.type)) {
      setError(t("admin.dialogues.portraitType"));
      return;
    }
    const result = await apiRequest("PUT", `${PATH}/${id}/portrait`, { raw: selected, csrfToken });
    const parsed = dialogueDetailSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setError(undefined);
      setDetail(parsed.data);
    } else {
      setError(errorText(result.errorCode));
    }
    if (file.current) file.current.value = "";
  }

  async function removePortrait() {
    if (id === undefined) return;
    const result = await call("DELETE", `${PATH}/${id}/portrait`);
    const parsed = dialogueDetailSchema.safeParse(result.body);
    if (result.ok && parsed.success) setDetail(parsed.data);
  }

  function move(index: number, by: -1 | 1) {
    const next = [...lines];
    const [line] = next.splice(index, 1);
    if (line !== undefined) next.splice(index + by, 0, line);
    setLines(next);
    setSaved(false);
  }

  if (!loaded) {
    return error === undefined ? null : (
      <p role="alert" className="error">
        {error}
      </p>
    );
  }
  const filled = lines.some((line) => line.trim() !== "");
  return (
    <form className="stack" onSubmit={(form) => void save(form)}>
      <button type="button" className="btn ghost sm" onClick={onBack}>
        {t("admin.dialogues.back")}
      </button>
      <h2 className="h2">{npcName.trim() === "" ? t("admin.dialogues.newTitle") : npcName}</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="card grid-2">
        <label className="field">
          <span>{t("admin.dialogues.npcName")}</span>
          <input
            className="input"
            value={npcName}
            maxLength={DIALOGUE_LIMITS.npcName}
            required
            onChange={(event) => {
              setNpcName(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label className="field">
          <span>{t("admin.dialogues.id")}</span>
          {id === undefined ? (
            <small className="hint">{t("admin.dialogues.idNew")}</small>
          ) : (
            <>
              <input className="input" value={id} readOnly />
              <small className="hint">{t("admin.dialogues.idHint", { id })}</small>
            </>
          )}
        </label>
        <label className="field grid-span">
          <span>{t("admin.dialogues.greeting")}</span>
          <input
            className="input"
            value={greeting}
            maxLength={DIALOGUE_LIMITS.greeting}
            onChange={(event) => {
              setGreeting(event.target.value);
              setSaved(false);
            }}
          />
          <small className="hint">
            {t("admin.dialogues.greetingHint")} ·{" "}
            {t("admin.dialogues.counter", {
              count: Array.from(greeting).length,
              max: DIALOGUE_LIMITS.greeting,
            })}
          </small>
        </label>
      </div>
      <div className="stack">
        {lines.map((line, index) => (
          <div key={index} className="card flat">
            <div className="row">
              <span className="eyebrow grow">{t("admin.dialogues.line", { n: index + 1 })}</span>
              <button
                type="button"
                className="btn ghost sm"
                aria-label={t("admin.dialogues.up", { n: index + 1 })}
                disabled={index === 0}
                onClick={() => {
                  move(index, -1);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn ghost sm"
                aria-label={t("admin.dialogues.down", { n: index + 1 })}
                disabled={index === lines.length - 1}
                onClick={() => {
                  move(index, 1);
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn ghost sm"
                aria-label={t("admin.dialogues.removeLine", { n: index + 1 })}
                disabled={lines.length === 1}
                onClick={() => {
                  setLines(lines.filter((_, at) => at !== index));
                  setSaved(false);
                }}
              >
                {t("admin.dialogues.remove")}
              </button>
            </div>
            <textarea
              className="input"
              aria-label={t("admin.dialogues.line", { n: index + 1 })}
              rows={2}
              maxLength={DIALOGUE_LIMITS.line}
              value={line}
              onChange={(event) => {
                setLines(lines.map((item, at) => (at === index ? event.target.value : item)));
                setSaved(false);
              }}
            />
          </div>
        ))}
        <button
          type="button"
          className="btn soft sm"
          disabled={lines.length >= DIALOGUE_LIMITS.lines}
          onClick={() => {
            setLines([...lines, ""]);
          }}
        >
          {t("admin.dialogues.addLine")}
        </button>
      </div>
      <div className="card" data-testid="dialogue-preview">
        <span className="eyebrow">{t("admin.dialogues.preview")}</span>
        <div className="card flat">
          <b className="sm">{npcName.trim() === "" ? "…" : npcName}</b>
          <Markdown text={lines[0] ?? ""} />
          <span className="hint">
            {t("game.dialogue.step", { n: 1, count: lines.length })} · {t("game.dialogue.tapNext")}
          </span>
        </div>
      </div>
      <div className="card">
        <span className="eyebrow">{t("admin.dialogues.portrait")}</span>
        {id === undefined ? (
          <span className="hint">{t("admin.dialogues.portraitLater")}</span>
        ) : (
          <div className="row">
            {detail?.portrait != null && (
              <img
                className="dialogue-portrait"
                src={`/api/dialogues/${id}/portrait?v=${String(detail.portrait)}`}
                alt=""
              />
            )}
            <input
              ref={file}
              type="file"
              hidden
              aria-label={t("admin.dialogues.portraitInput")}
              accept={PORTRAIT_TYPES.join(",")}
              onChange={(event) => {
                void upload(event.currentTarget.files?.[0]);
              }}
            />
            <button
              type="button"
              className="btn soft sm"
              onClick={() => {
                file.current?.click();
              }}
            >
              {detail?.portrait == null
                ? t("admin.dialogues.portraitAdd")
                : t("admin.dialogues.portraitChange")}
            </button>
            {detail?.portrait != null && (
              <button type="button" className="btn ghost sm" onClick={() => void removePortrait()}>
                {t("admin.dialogues.portraitRemove")}
              </button>
            )}
          </div>
        )}
        <span className="hint">{t("admin.dialogues.portraitHint")}</span>
      </div>
      {id !== undefined && (
        <div className="card">
          <span className="eyebrow">{t("admin.dialogues.usedBy")}</span>
          {detail?.usedBy.length === 0 ? (
            <span className="hint">{t("admin.dialogues.unused")}</span>
          ) : (
            <ul className="list sm">
              {detail?.usedBy.map((use) => (
                <li key={`${use.map}/${use.object}`} className="li">
                  <span className="grow">
                    <b className="sm">{name(use)}</b>
                    {use.label !== null && <span className="hint">{use.label}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="row">
        <button type="submit" className="btn" disabled={!filled || npcName.trim() === ""}>
          {t("admin.dialogues.save")}
        </button>
        {saved && (
          <span role="status" className="hint">
            {t("admin.dialogues.saved")}
          </span>
        )}
        <span className="grow" />
        {id !== undefined && (
          <HoldButton className="btn ghost sm" onConfirm={() => void remove()}>
            {t("admin.dialogues.delete")}
          </HoldButton>
        )}
      </div>
      <span className="hint">{t("admin.dialogues.deleteHint")}</span>
    </form>
  );
}
