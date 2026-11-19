// Game world › Objekte & Portale › the card "NPCs" of a map (MAP-21, GAME-37; UX mock `admin-world`, variant
// "objects"): one block per NPC of the map with its name, its short dialog (what its speech bubble says), the
// action a tap on it runs, and a button for the two texts. The action is live at once, like an object's; the texts
// are saved with "Speichern".
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { WORLD_LIMITS } from "@zappaloo/shared";
import type { WorldNpc, WorldObjectAction, WorldObjects } from "@zappaloo/shared";
import ActionSelect from "./ActionSelect.tsx";

interface Props {
  npcs: WorldNpc[];
  targets: WorldObjects;
  actionName: (action: WorldObjectAction | undefined) => string;
  /** The NPC whose action or texts are being saved: its controls wait. */
  busy: string | undefined;
  onAction: (npc: WorldNpc, value: string) => void;
  /** Saves the two texts; true when they were saved. */
  onTexts: (npc: WorldNpc, title: string, dialog: string) => Promise<boolean>;
}

export default function AdminWorldNpcs({
  npcs,
  targets,
  actionName,
  busy,
  onAction,
  onTexts,
}: Props) {
  const { t } = useTranslation();
  return (
    <section className="card" aria-labelledby="npcs-title">
      <div className="row">
        <b id="npcs-title" className="grow">
          {t("admin.world.npcs.title", { count: npcs.length })}
        </b>
      </div>
      <span className="hint">{t("admin.world.npcs.info")}</span>
      <div className="stack npc-list">
        {npcs.map((npc) => (
          <NpcBlock
            key={npc.name}
            npc={npc}
            targets={targets}
            actionName={actionName}
            busy={busy === npc.name}
            onAction={(value) => {
              onAction(npc, value);
            }}
            onTexts={onTexts}
          />
        ))}
      </div>
    </section>
  );
}

function NpcBlock({
  npc,
  targets,
  actionName,
  busy,
  onAction,
  onTexts,
}: {
  npc: WorldNpc;
  targets: WorldObjects;
  actionName: Props["actionName"];
  busy: boolean;
  onAction: (value: string) => void;
  onTexts: Props["onTexts"];
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(npc.title ?? "");
  const [dialog, setDialog] = useState(npc.dialog ?? "");
  const [saved, setSaved] = useState(false);
  const shown = npc.title ?? npc.label ?? npc.name;
  const changed = title.trim() !== (npc.title ?? "") || dialog.trim() !== (npc.dialog ?? "");

  return (
    <div className="npc-block stack" data-testid={`npc-${npc.name}`}>
      <div>
        <b>{shown}</b>
        <br />
        <span className="hint">{npc.name}</span>
      </div>
      <div className="grid-2">
        <label className="field">
          <span>{t("admin.world.npcs.name")}</span>
          <input
            className="input"
            value={title}
            maxLength={WORLD_LIMITS.nameLength}
            placeholder={npc.label ?? npc.name}
            onChange={(event) => {
              setTitle(event.target.value);
              setSaved(false);
            }}
          />
          <small className="hint">{t("admin.world.npcs.nameHint")}</small>
        </label>
        <label className="field">
          <span>{t("admin.world.npcs.action")}</span>
          <ActionSelect
            ariaLabel={t("admin.world.npcs.actionOf", { name: shown })}
            preset={npc.preset}
            effective={npc.override ?? npc.preset}
            targets={targets}
            actionName={actionName}
            busy={busy}
            onChange={onAction}
          />
          <small className="hint">
            {npc.preset === undefined
              ? t("admin.world.npcs.noPreset")
              : t("admin.world.npcs.preset", { action: actionName(npc.preset) })}
            {npc.missing && (
              <>
                {" "}
                <span className="tag warn">{t("admin.world.objects.missing")}</span>
              </>
            )}
          </small>
        </label>
      </div>
      <label className="field">
        <span>{t("admin.world.npcs.dialog")}</span>
        <input
          className="input"
          value={dialog}
          maxLength={WORLD_LIMITS.npcDialogLength}
          onChange={(event) => {
            setDialog(event.target.value);
            setSaved(false);
          }}
        />
        <small className="hint">
          {t("admin.world.npcs.dialogHint")} ·{" "}
          {t("admin.world.npcs.counter", {
            count: Array.from(dialog).length,
            max: WORLD_LIMITS.npcDialogLength,
          })}
        </small>
      </label>
      <div className="row">
        <button
          type="button"
          className="btn soft sm"
          disabled={busy || !changed}
          onClick={() => {
            void onTexts(npc, title.trim(), dialog.trim()).then((ok) => {
              setSaved(ok);
            });
          }}
        >
          {t("admin.world.npcs.save", { name: shown })}
        </button>
        {saved && (
          <span role="status" className="hint">
            {t("admin.world.npcs.saved")}
          </span>
        )}
      </div>
    </div>
  );
}
