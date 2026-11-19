import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  ExternalLink,
  FileText,
  Link2,
  RefreshCw,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import type { DenyReason, FlipbookSummary } from "@shared/api";
import { describeDays, describeHours, formatDate, formatDateTime } from "@shared/format";
import { UpsellDialog } from "../components/UpsellDialog";
import { Alert, Badge, Button, CopyButton, ProgressBar, Toggle, WhatsAppButton } from "../components/ui";
import { api, ApiError, downloadFile, errorMessage } from "../lib/api";
import { usePageMeta } from "../lib/meta";
import { hasCleanAccess, useSession } from "../lib/session";
import {
  convertPdfToImages,
  describePdfError,
  QUALITY_PRESETS,
  releasePages,
  type PageImage,
  type Quality,
} from "../maker/convertPdf";
import { buildPreviewUrl, formatBytes, titleFromFileName, uploadFlipbook } from "../maker/flipbook";

type Status = "idle" | "converting" | "ready" | "error";

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export default function CreatePage() {
  usePageMeta("Create a flipbook", "Upload a PDF and turn it into a page-turning flipbook. Free to try, no login needed.");
  const { config, me, refresh } = useSession();
  const clean = hasCleanAccess(me);
  const customer = me?.customer ?? null;
  const maxPages = config?.maxPages ?? 200;
  const maxPdfMb = config?.maxPdfMb ?? 50;

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>("standard");
  const [title, setTitle] = useState("");
  const [debouncedTitle, setDebouncedTitle] = useState("");
  const [showCover, setShowCover] = useState(true);
  const [pdfDownload, setPdfDownload] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [convertError, setConvertError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageImage[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [saved, setSaved] = useState<FlipbookSummary | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingChanges, setSavingChanges] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  const [upsell, setUpsell] = useState<{ reason: DenyReason | null } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pdfUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  function choose(next: File | undefined) {
    if (!next) return;
    if (!isPdf(next)) return setFileError(`"${next.name}" is not a PDF file.`);
    if (next.size > maxPdfMb * 1024 * 1024) {
      return setFileError(`This PDF is ${formatBytes(next.size)}. The limit is ${maxPdfMb} MB.`);
    }
    setFileError(null);
    setSaved(null);
    setSaveError(null);
    setDownloadNote(null);
    setFile(next);
    const t = titleFromFileName(next.name) || "Flipbook";
    setTitle(t);
    setDebouncedTitle(t);
  }

  // Convert the PDF to page images whenever the file or quality changes.
  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    let result: PageImage[] = [];
    setStatus("converting");
    setConvertError(null);
    setPages([]);
    setProgress({ done: 0, total: 0 });
    convertPdfToImages(file, {
      quality,
      maxPages,
      signal: controller.signal,
      onProgress: (done, total) => setProgress({ done, total }),
    })
      .then((converted) => {
        result = converted;
        if (controller.signal.aborted) return;
        if (converted.length === 0) throw new Error("the PDF has no pages");
        setPages(converted);
        setStatus("ready");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("PDF conversion failed:", err);
        setConvertError(describePdfError(err));
        setStatus("error");
      });
    return () => {
      controller.abort();
      releasePages(result);
    };
  }, [file, quality, maxPages]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTitle(title), 400);
    return () => clearTimeout(timer);
  }, [title]);

  // Local preview (until the flipbook is saved; then the real share link is shown).
  useEffect(() => {
    if (status !== "ready" || pages.length === 0 || saved) return;
    const url = buildPreviewUrl({
      title: debouncedTitle,
      pages,
      showCover,
      pdf: pdfDownload && file && pdfUrl ? { name: file.name, url: pdfUrl } : null,
      overlayText: clean ? null : config?.watermarkText ?? "amflipbook",
    });
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [status, pages, debouncedTitle, showCover, pdfDownload, file, pdfUrl, clean, config, saved]);

  const dirty =
    !!saved &&
    (saved.title !== title.trim() || saved.showCover !== showCover || saved.pdfDownload !== pdfDownload);

  async function save() {
    if (!file || pages.length === 0) return;
    setSaveError(null);
    setUploadProgress(0);
    try {
      const result = await uploadFlipbook(
        { title: title.trim() || "Flipbook", showCover, pdf: pdfDownload ? file : null, pages },
        setUploadProgress
      );
      setSaved(result);
      setTitle(result.title);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setUploadProgress(null);
    }
  }

  async function saveChanges() {
    if (!saved) return;
    setSavingChanges(true);
    setSaveError(null);
    try {
      const updated = await api<FlipbookSummary>(`/flipbooks/${saved.id}`, {
        method: "PATCH",
        body: { title: title.trim() || "Flipbook", showCover, pdfDownload },
      });
      setSaved(updated);
      setPreviewVersion((v) => v + 1);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSavingChanges(false);
    }
  }

  async function download() {
    if (!saved) return;
    setDownloading(true);
    setDownloadNote(null);
    setSaveError(null);
    try {
      const { fileName, headers } = await downloadFile(`/flipbooks/${saved.id}/download`);
      const left = headers.get("x-downloads-remaining");
      const marked = headers.get("x-watermarked") === "1";
      setDownloadNote(
        `${fileName} downloaded${marked ? " (with watermark)" : ""}.` +
          (left && left !== "unlimited" ? ` ${left} download${left === "1" ? "" : "s"} left.` : "")
      );
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.body.reason) setUpsell({ reason: err.body.reason });
      else setSaveError(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  }

  function startOver() {
    setFile(null);
    setSaved(null);
    setStatus("idle");
    setPreviewUrl(null);
    setDownloadNote(null);
    setSaveError(null);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    choose(e.dataTransfer.files?.[0]);
  }

  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const allowance = me?.download;

  // ---- Upload screen --------------------------------------------------------
  if (!file) {
    return (
      <div className="container-page max-w-3xl py-12 sm:py-16">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">Make a flipbook</h1>
        <p className="mt-2 text-lg text-ink-600">Upload a PDF. It's turned into pages right here in your browser.</p>
        <PlanBanner className="mt-6" onUpgrade={() => setUpsell({ reason: null })} />
        <div
          className={`mt-6 rounded-3xl border-2 border-dashed p-8 text-center transition sm:p-12 ${
            dragging ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-ink-50/60 hover:border-brand-300"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-card">
            <UploadCloud className="h-8 w-8" aria-hidden />
          </span>
          <p className="mt-5 text-lg font-semibold text-ink-900">Drop your PDF here</p>
          <p className="mt-1 text-sm text-ink-500">
            or choose a file · up to {maxPdfMb} MB and {maxPages} pages
          </p>
          <Button className="mt-6" size="lg" onClick={() => inputRef.current?.click()}>
            Choose a PDF
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {fileError && <Alert tone="error" className="mt-4">{fileError}</Alert>}
        <QualityPicker value={quality} onChange={setQuality} className="mt-6" />
        <UpsellDialog open={!!upsell} onClose={() => setUpsell(null)} reason={upsell?.reason ?? null} flipbookId={null} />
      </div>
    );
  }

  // ---- Editor ---------------------------------------------------------------
  return (
    <div className="container-page max-w-7xl py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
            {saved ? "Your flipbook is ready" : "Preview your flipbook"}
          </h1>
          <p className="mt-1 text-ink-600">
            {saved ? "Share the link or download the file." : "Adjust the settings, then create your share link."}
          </p>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={startOver}>
          Start over
        </Button>
      </div>
      <PlanBanner className="mt-5" onUpgrade={() => setUpsell({ reason: null })} />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          <section className="card p-5">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-6 w-6 shrink-0 text-danger-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-900" title={file.name}>
                  {file.name}
                </p>
                <p className="text-sm text-ink-500">
                  {formatBytes(file.size)}
                  {progress.total > 0 && ` · ${progress.total} pages`}
                </p>
              </div>
            </div>
          </section>

          <section className="card flex flex-col gap-5 p-5" aria-label="Settings">
            <div>
              <label htmlFor="fb-title" className="label">
                Title
              </label>
              <input
                id="fb-title"
                className="input"
                value={title}
                maxLength={120}
                placeholder="Flipbook"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <QualityPicker value={quality} onChange={setQuality} disabled={!!saved} />
            <Toggle checked={showCover} onChange={setShowCover} label="Show the first page as a cover" />
            <Toggle
              checked={pdfDownload}
              onChange={setPdfDownload}
              disabled={!!saved && !saved.hasPdf}
              label={<>Add a “Download PDF” button</>}
              hint={saved && !saved.hasPdf ? "Start over to add the PDF." : "Readers can download your original PDF."}
            />
            {dirty && (
              <Button onClick={saveChanges} loading={savingChanges} variant="secondary">
                Save changes
              </Button>
            )}
          </section>

          <section className="card p-5" aria-label="Share and download">
            {!saved ? (
              <>
                <Button
                  size="lg"
                  className="w-full"
                  icon={<Link2 className="h-5 w-5" />}
                  disabled={status !== "ready"}
                  loading={uploadProgress !== null}
                  onClick={save}
                >
                  {uploadProgress !== null ? `Uploading… ${Math.round(uploadProgress * 100)}%` : "Create share link"}
                </Button>
                {uploadProgress !== null && <ProgressBar value={uploadProgress * 100} label="Upload progress" />}
                <p className="mt-3 text-sm leading-relaxed text-ink-500">
                  {clean && customer
                    ? `No watermark. The link stays open for ${describeDays(customer.shareLinkDays)}.`
                    : `Free flipbooks have a watermark and the link stays open for ${describeHours(config?.freeLinkHours ?? 24)}.`}
                </p>
              </>
            ) : (
              <>
                <label htmlFor="share-url" className="label">
                  Share link
                </label>
                <div className="flex gap-2">
                  <input id="share-url" className="input min-w-0 flex-1 text-sm" readOnly value={saved.shareUrl} onFocus={(e) => e.target.select()} />
                  <CopyButton text={saved.shareUrl} size="md" />
                </div>
                <p className="mt-2 text-sm text-ink-500">
                  Open until {formatDateTime(saved.linkExpiresAt)}
                  {saved.watermarked ? " · with watermark" : " · no watermark"}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <WhatsAppButton
                    size="md"
                    href={`https://wa.me/?text=${encodeURIComponent(`${saved.title}\n${saved.shareUrl}`)}`}
                  >
                    Share
                  </WhatsAppButton>
                  <a href={saved.shareUrl} target="_blank" rel="noopener" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-4 text-[15px] font-semibold text-ink-800 shadow-sm hover:bg-ink-50">
                    <ExternalLink className="h-4 w-4" /> Open
                  </a>
                </div>

                <div className="mt-5 border-t border-ink-100 pt-5">
                  <Button
                    size="lg"
                    className="w-full"
                    variant="dark"
                    icon={<Download className="h-5 w-5" />}
                    loading={downloading}
                    disabled={dirty}
                    onClick={download}
                  >
                    Download flipbook (.html)
                  </Button>
                  <p className="mt-2 text-sm text-ink-500">
                    {dirty
                      ? "Save your changes first."
                      : allowance?.allowed
                        ? allowance.remaining === null
                          ? "Unlimited downloads on your plan."
                          : `${allowance.remaining} download${allowance.remaining === 1 ? "" : "s"} left${allowance.watermark ? " · with watermark" : ""}.`
                        : "One file that works offline and on any website."}
                  </p>
                  {downloadNote && <Alert tone="success" className="mt-3">{downloadNote}</Alert>}
                  {!clean && (
                    <button
                      type="button"
                      onClick={() => setUpsell({ reason: null })}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
                    >
                      <Sparkles className="h-4 w-4" /> Remove the watermark
                    </button>
                  )}
                </div>
              </>
            )}
            {saveError && <Alert tone="error" className="mt-3">{saveError}</Alert>}
          </section>
          {saved && customer && (
            <p className="text-center text-sm text-ink-500">
              Find it later in your <Link className="link" to="/dashboard">dashboard</Link>.
            </p>
          )}
        </aside>

        <section
          className="flex h-[72vh] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-ink-100 bg-ink-100 shadow-card lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]"
          aria-label="Preview"
        >
          {status === "converting" && (
            <div className="m-auto w-full max-w-sm px-6 text-center">
              <ProgressBar value={percent} label="Converting pages" />
              <p className="mt-3 text-sm text-ink-600">
                {progress.total > 0
                  ? `Converting page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
                  : "Reading the PDF…"}
              </p>
            </div>
          )}
          {status === "error" && convertError && (
            <div className="m-auto max-w-md px-6">
              <Alert tone="error">{convertError}</Alert>
            </div>
          )}
          {status === "ready" && saved && (
            <iframe
              key={`${saved.slug}-${previewVersion}`}
              src={`/v/${saved.slug}?preview=1&r=${previewVersion}`}
              title="Flipbook preview"
              allowFullScreen
              className="h-full w-full border-0"
            />
          )}
          {status === "ready" && !saved && previewUrl && (
            <iframe key={previewUrl} src={previewUrl} title="Flipbook preview" allowFullScreen className="h-full w-full border-0" />
          )}
        </section>
      </div>
      <UpsellDialog
        open={!!upsell}
        onClose={() => setUpsell(null)}
        reason={upsell?.reason ?? null}
        flipbookId={saved?.id ?? null}
      />
    </div>
  );
}

function QualityPicker({
  value,
  onChange,
  disabled,
  className = "",
}: {
  value: Quality;
  onChange: (q: Quality) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <fieldset className={className} disabled={disabled}>
      <legend className="label">Image quality</legend>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1">
        {(Object.keys(QUALITY_PRESETS) as Quality[]).map((q) => (
          <label
            key={q}
            className={`cursor-pointer rounded-lg px-3 py-2 text-center text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
              value === q ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="radio"
              name="quality"
              value={q}
              checked={value === q}
              onChange={() => onChange(q)}
              className="sr-only"
            />
            {QUALITY_PRESETS[q].label}
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-ink-500">High is sharper but the file is about twice as large.</p>
    </fieldset>
  );
}

function PlanBanner({ className = "", onUpgrade }: { className?: string; onUpgrade: () => void }) {
  const { me, config } = useSession();
  const c = me?.customer;
  if (c?.planStatus === "active") {
    return (
      <div className={`flex flex-wrap items-center gap-2 rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-700 ${className}`}>
        <Badge tone="success">{c.planName}</Badge>
        <span>
          No watermark ·{" "}
          {c.downloadsAllowed === null
            ? "unlimited downloads"
            : `${Math.max(0, c.downloadsAllowed - c.downloadsUsed)} of ${c.downloadsAllowed} downloads left`}{" "}
          · until {formatDate(c.planExpiresAt!)}
        </span>
      </div>
    );
  }
  if (c?.planStatus === "expired") {
    return (
      <Alert tone="warning" className={className} title="Your plan has expired">
        New flipbooks get a watermark and downloads are paused.{" "}
        <Link to="/pricing" className="font-semibold underline">
          Choose a new plan
        </Link>
      </Alert>
    );
  }
  const free = me?.free;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-700 ${className}`}>
      <span>
        <strong className="font-semibold text-ink-900">Free:</strong> {free?.remaining ?? config?.freeDownloadLimit ?? 5} of{" "}
        {free?.limit ?? 5} downloads left · watermark · link open {describeHours(config?.freeLinkHours ?? 24)}
      </span>
      <button type="button" onClick={onUpgrade} className="font-semibold text-brand-600 hover:text-brand-700">
        Remove watermark →
      </button>
    </div>
  );
}
