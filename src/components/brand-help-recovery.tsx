"use client";

import { type ChangeEvent, type FormEvent, useId, useRef, useState } from "react";

import styles from "./brand-help-recovery.module.css";

export type BrandHelpFileKind = "logo" | "brand_guide" | "screenshot";

export type BrandHelpFileInput = {
  kind: BrandHelpFileKind;
  file: File;
};

export type BrandHelpRecoveryStatus = "waiting" | "submitting" | "resuming";

export type BrandHelpRecoveryProps = {
  availableKinds?: readonly BrandHelpSourceKind[];
  disabled?: boolean;
  status?: BrandHelpRecoveryStatus;
  onUrlSubmit: (url: string) => void;
  onFileSubmit?: (input: BrandHelpFileInput) => void;
};

export type BrandHelpSourceKind = "source_url" | BrandHelpFileKind;

const approvedPrompt =
  "We found the company, but we need a clearer brand source. Add a logo, brand guide, screenshot, or a more specific page URL, and we will continue from the research already completed.";

const urlOnlyPrompt =
  "We found the company, but we need a clearer brand source. Add a more specific official page URL, and we will continue from the research already completed.";

const sourceOptions: readonly { kind: BrandHelpSourceKind; label: string }[] = [
  { kind: "source_url", label: "Official page URL" },
  { kind: "logo", label: "Logo image" },
  { kind: "brand_guide", label: "Brand guide PDF" },
  { kind: "screenshot", label: "Homepage screenshot" }
];

const fileConfig: Record<
  BrandHelpFileKind,
  { accept: string; hint: string; label: string; extensions: readonly string[]; mimeTypes: readonly string[] }
> = {
  logo: {
    accept: ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml",
    hint: "PNG, JPG, WebP, or SVG",
    label: "Choose a logo image",
    extensions: [".png", ".jpg", ".jpeg", ".webp", ".svg"],
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
  },
  brand_guide: {
    accept: ".pdf,application/pdf",
    hint: "PDF",
    label: "Choose a brand guide PDF",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"]
  },
  screenshot: {
    accept: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp",
    hint: "PNG, JPG, or WebP",
    label: "Choose a homepage screenshot",
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    mimeTypes: ["image/png", "image/jpeg", "image/webp"]
  }
};

const statusCopy: Record<BrandHelpRecoveryStatus, string> = {
  waiting: "Your earlier research is preserved. Add one source to resume.",
  submitting: "Checking your brand source…",
  resuming: "Brand source received. Resuming from the research already completed."
};

function isValidOfficialUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:")
      && Boolean(url.hostname)
      && !url.username
      && !url.password
    );
  } catch {
    return false;
  }
}

function isAcceptedFile(file: File, kind: BrandHelpFileKind) {
  if (file.size === 0) return false;
  const config = fileConfig[kind];
  const lowerName = file.name.toLowerCase();
  if (file.type) return config.mimeTypes.includes(file.type);
  return config.extensions.some((extension) => lowerName.endsWith(extension));
}

export function BrandHelpRecovery({
  availableKinds,
  disabled = false,
  status,
  onUrlSubmit,
  onFileSubmit
}: BrandHelpRecoveryProps) {
  const [sourceKind, setSourceKind] = useState<BrandHelpSourceKind>("source_url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [localStatus, setLocalStatus] = useState<BrandHelpRecoveryStatus>("waiting");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const promptId = useId();
  const inputHintId = useId();
  const errorId = useId();
  const visibleStatus = status ?? localStatus;
  const requestedKinds = availableKinds?.length
    ? availableKinds
    : sourceOptions.map((option) => option.kind);
  const visibleSourceOptions = sourceOptions.filter((option) =>
    requestedKinds.includes(option.kind) && (option.kind === "source_url" || Boolean(onFileSubmit))
  );
  const activeSourceKind = visibleSourceOptions.some((option) => option.kind === sourceKind)
    ? sourceKind
    : visibleSourceOptions[0]?.kind ?? "source_url";
  const fileKind = activeSourceKind === "source_url" ? null : activeSourceKind;
  const selectedFileConfig = fileKind ? fileConfig[fileKind] : null;
  const urlOnly = visibleSourceOptions.length === 1 && visibleSourceOptions[0]?.kind === "source_url";

  const chooseSourceKind = (kind: BrandHelpSourceKind) => {
    setSourceKind(kind);
    setError("");
    setFile(null);
    setLocalStatus("waiting");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    if (!fileKind) return;
    const selectedFile = event.target.files?.[0] ?? null;
    if (selectedFile && !isAcceptedFile(selectedFile, fileKind)) {
      setFile(null);
      setError(`Choose a ${fileConfig[fileKind].hint} file.`);
      setLocalStatus("waiting");
      return;
    }
    setFile(selectedFile);
    setError("");
    setLocalStatus("waiting");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (activeSourceKind === "source_url") {
      const trimmedUrl = url.trim();
      if (!isValidOfficialUrl(trimmedUrl)) {
        setError("Enter a full official page URL beginning with http:// or https://.");
        setLocalStatus("waiting");
        return;
      }
      onUrlSubmit(trimmedUrl);
      setLocalStatus("resuming");
      return;
    }

    if (!file || !isAcceptedFile(file, activeSourceKind)) {
      setError(`Choose a ${fileConfig[activeSourceKind].hint} file.`);
      setLocalStatus("waiting");
      return;
    }

    onFileSubmit?.({ kind: activeSourceKind, file });
    setLocalStatus("resuming");
  };

  return (
    <section
      className={styles.recovery}
      aria-labelledby={titleId}
      aria-describedby={promptId}
      aria-busy={visibleStatus === "submitting"}
    >
      <header className={styles.header}>
        <span><i aria-hidden="true" />Brand source needed</span>
        <h2 id={titleId}>Add a clearer brand source.</h2>
        <p id={promptId}>{urlOnly ? urlOnlyPrompt : approvedPrompt}</p>
      </header>

      <form className={styles.request} onSubmit={submit} noValidate>
        <fieldset disabled={disabled || visibleStatus === "submitting"}>
          <legend>{urlOnly ? "Add a more specific official page URL" : "Choose one brand source"}</legend>
          {!urlOnly && (
            <div className={styles.sourceOptions}>
              {visibleSourceOptions.map((option) => (
                <label key={option.kind}>
                  <input
                    type="radio"
                    name="brand-help-source"
                    value={option.kind}
                    checked={activeSourceKind === option.kind}
                    onChange={() => chooseSourceKind(option.kind)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          )}

          <div className={styles.inputArea}>
            {activeSourceKind === "source_url" ? (
              <>
                <label htmlFor={`${titleId}-url`}>More specific official page URL</label>
                <input
                  id={`${titleId}-url`}
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setError("");
                    setLocalStatus("waiting");
                  }}
                  placeholder="https://company.com/product"
                  aria-describedby={`${inputHintId}${error ? ` ${errorId}` : ""}`}
                />
                <small id={inputHintId}>Use an official product, solution, event, or homepage URL.</small>
              </>
            ) : (
              <>
                <label htmlFor={`${titleId}-file`}>{selectedFileConfig?.label}</label>
                <input
                  key={activeSourceKind}
                  ref={fileInputRef}
                  id={`${titleId}-file`}
                  type="file"
                  accept={selectedFileConfig?.accept}
                  onChange={selectFile}
                  aria-describedby={`${inputHintId}${error ? ` ${errorId}` : ""}`}
                />
                <small id={inputHintId}>
                  {file ? `${file.name} selected` : `Accepted format: ${selectedFileConfig?.hint}`}
                </small>
              </>
            )}
          </div>

          {error && <p className={styles.error} id={errorId} role="alert">{error}</p>}

          <button
            className={styles.submit}
            type="submit"
            disabled={
              disabled
              || visibleStatus === "submitting"
              || (activeSourceKind === "source_url" ? !url.trim() : !file)
            }
          >
            Continue with this source <span aria-hidden="true">→</span>
          </button>
        </fieldset>
      </form>

      <p className={styles.status} role="status" aria-live="polite">
        <i aria-hidden="true" data-state={visibleStatus} />
        {statusCopy[visibleStatus]}
      </p>
    </section>
  );
}
