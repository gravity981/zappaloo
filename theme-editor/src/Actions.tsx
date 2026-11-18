import { useState } from "react";
import { exportPackage, openPackage } from "./api.ts";
import { draftToPackageData, packageDataToDraft } from "./packageData.ts";
import type { ThemeDraft, Update } from "./model.ts";
import { findingCard } from "./transfer.ts";
import type { PackageFinding } from "./transfer.ts";

/** What the last export or open did, shown under the buttons. */
export type Report =
  | { kind: "exported"; fileName: string }
  | { kind: "opened"; fileName: string }
  | {
      kind: "refused";
      action: "export" | "open";
      subject: string;
      findings: PackageFinding[];
      message: string;
    };

export type SaveState = "loading" | "saving" | "saved" | "failed";

const SAVE_TEXT: Record<SaveState, string> = {
  loading: "Loading the draft …",
  saving: "Saving the draft …",
  saved: "Draft saved in this browser",
  failed: "The draft could not be saved in this browser",
};

/** Hands the archive to the browser as a download. */
function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** «Open package…», «New theme» (second click) and «Export» with the draft's save state (THM-12 – THM-14). */
export function Actions(props: {
  draft: ThemeDraft;
  onChange: Update;
  onNew: () => void;
  saveState: SaveState;
  report: Report | null;
  setReport: (report: Report | null) => void;
}) {
  const { draft, onChange, onNew, saveState, report, setReport } = props;
  const [busy, setBusy] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  async function doExport() {
    setBusy(true);
    setReport(null);
    try {
      const result = await exportPackage(draftToPackageData(draft));
      if (result.ok) {
        download(result.blob, result.fileName);
        setReport({ kind: "exported", fileName: result.fileName });
      } else {
        setReport({
          kind: "refused",
          action: "export",
          subject: draft.name.trim() === "" ? "The theme" : draft.name.trim(),
          findings: result.findings,
          message: result.message,
        });
      }
    } catch {
      setReport({
        kind: "refused",
        action: "export",
        subject: "The theme",
        findings: [],
        message: "The development server did not answer",
      });
    } finally {
      setBusy(false);
    }
  }

  async function doOpen(file: File) {
    setBusy(true);
    setReport(null);
    try {
      const result = await openPackage(file);
      if (result.ok) {
        onChange(packageDataToDraft(result.data));
        setReport({ kind: "opened", fileName: file.name });
      } else {
        setReport({
          kind: "refused",
          action: "open",
          subject: file.name,
          findings: result.findings,
          message: result.message,
        });
      }
    } catch {
      setReport({
        kind: "refused",
        action: "open",
        subject: file.name,
        findings: [],
        message: "The development server did not answer",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="editor-actions">
        <label className={`btn soft sm${busy ? " disabled" : ""}`}>
          Open package…
          <input
            className="visually-hidden"
            type="file"
            aria-label="Open package"
            accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) void doOpen(file);
            }}
          />
        </label>
        {confirmNew ? (
          <>
            <button
              type="button"
              className="btn danger sm"
              onClick={() => {
                setConfirmNew(false);
                setReport(null);
                onNew();
              }}
            >
              Yes, discard and start a new theme
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setConfirmNew(false);
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setConfirmNew(true);
            }}
          >
            New theme
          </button>
        )}
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={() => {
            void doExport();
          }}
        >
          Export
        </button>
        <span className="hint grow" role="status" aria-label="Draft state">
          {SAVE_TEXT[saveState]}
        </span>
      </div>
      <ReportPanel report={report} />
    </>
  );
}

function ReportPanel(props: { report: Report | null }) {
  const { report } = props;
  if (report === null) return null;
  if (report.kind === "exported") {
    return (
      <div className="editor-report" role="status">
        <span className="tag ok">Exported</span> {report.fileName} was checked by the platform's
        validator and downloaded.
      </div>
    );
  }
  if (report.kind === "opened") {
    return (
      <div className="editor-report" role="status">
        <span className="tag ok">Opened</span> {report.fileName} was checked and filled in.
      </div>
    );
  }
  const verb = report.action === "export" ? "was not exported" : "was not opened";
  return (
    <div className="editor-report card flat" role="alert">
      <b className="sm">
        {report.subject} {verb}
      </b>
      <span className="hint">
        {report.findings.length > 0
          ? "The validator refuses the package. Every finding, with the card it belongs to:"
          : report.message}
      </span>
      {report.findings.length > 0 ? (
        <ul className="list sm">
          {report.findings.map((finding, index) => (
            <li key={`${finding.file}-${String(index)}`}>
              <b>{findingCard(finding)}</b> · {finding.file}: {finding.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
