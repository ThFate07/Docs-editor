"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  addBrowserPerson,
  deleteBrowserPerson,
  emptyBrowserPeopleSnapshot,
  listBrowserPeople,
  saveBrowserPeople,
  subscribeToBrowserPeople,
  updateBrowserPerson,
} from "@/lib/browserPeopleStore";

type Person = { id: string; name: string; className: string; rollNo: string };

type UploadResult = {
  originalName: string;
  docId?: string;
  state?: "filled" | "placeholder" | "missing" | "ambiguous";
  rawText?: string;
  detected?: { name: string | null; className: string | null; rollNo: string | null };
  error?: string;
};

type GenerationSelection = { docId: string; personId: string };

const STATE_LABEL: Record<string, { label: string; color: string }> = {
  filled: { label: "Name found", color: "text-stamp-green" },
  placeholder: { label: "Blank header", color: "text-ink-muted" },
  missing: { label: "No header", color: "text-stamp-red" },
  ambiguous: { label: "Check this one", color: "text-stamp-red" },
};

function pairKey(docId: string, personId: string): string {
  return `${docId}:${personId}`;
}

export default function Dashboard() {
  const people = useSyncExternalStore(
    subscribeToBrowserPeople,
    listBrowserPeople,
    emptyBrowserPeopleSnapshot
  );
  const [form, setForm] = useState({ name: "", className: "", rollNo: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{
    generatedCount: number;
    errors: { file: string; person: string; message: string }[];
    downloadUrl: string;
  } | null>(null);
  const [printGenerating, setPrintGenerating] = useState(false);
  const [printResult, setPrintResult] = useState<{
    generatedCount: number;
    pageCount: number;
    blankPagesAdded: number;
    errors: { file: string; person: string; message: string }[];
    downloadUrl: string;
  } | null>(null);
  const [uploadedPdfGenerating, setUploadedPdfGenerating] = useState(false);
  const [uploadedPdfResult, setUploadedPdfResult] = useState<{
    generatedCount: number;
    pageCount: number;
    blankPagesAdded: number;
    errors: { file: string; message: string }[];
    downloadUrl: string;
  } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [excludedPairs, setExcludedPairs] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validFiles = useMemo(
    () => files.filter((f): f is UploadResult & { docId: string } => Boolean(f.docId && !f.error)),
    [files]
  );
  const selectedPeople = useMemo(
    () => people.filter((p) => !deselectedIds.has(p.id)),
    [people, deselectedIds]
  );
  const selectedIds = useMemo(
    () => new Set<string>(selectedPeople.map((person) => person.id)),
    [selectedPeople]
  );
  const selectedCombinations = useMemo<GenerationSelection[]>(() => {
    const selections: GenerationSelection[] = [];
    for (const file of validFiles) {
      for (const person of selectedPeople) {
        if (!excludedPairs.has(pairKey(file.docId, person.id))) {
          selections.push({ docId: file.docId, personId: person.id });
        }
      }
    }
    return selections;
  }, [validFiles, selectedPeople, excludedPairs]);

  function syncPeople(nextPeople: Person[]) {
    const loadedIds = new Set<string>(nextPeople.map((p) => p.id));
    saveBrowserPeople(nextPeople);
    setDeselectedIds((prev) => new Set([...prev].filter((id) => loadedIds.has(id))));
    setExcludedPairs((prev) => new Set([...prev].filter((key) => loadedIds.has(key.split(":")[1]))));
  }

  function handleAddOrUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const nextPeople = editingId
      ? updateBrowserPerson(people, editingId, form)
      : addBrowserPerson(people, form);
    syncPeople(nextPeople);
    setForm({ name: "", className: "", rollNo: "" });
    setEditingId(null);
  }

  function startEdit(p: Person) {
    setEditingId(p.id);
    setForm({ name: p.name, className: p.className, rollNo: p.rollNo });
  }

  function handleDelete(id: string) {
    syncPeople(deleteBrowserPerson(people, id));
    if (editingId === id) {
      setEditingId(null);
      setForm({ name: "", className: "", rollNo: "" });
    }
  }

  function toggleSelected(id: string) {
    const isSelected = selectedIds.has(id);
    setDeselectedIds((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
    if (isSelected) {
      setExcludedPairs((pairs) => new Set([...pairs].filter((key) => key.split(":")[1] !== id)));
    }
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    setUploading(true);
    setGenerateResult(null);
    setPrintResult(null);
    setUploadedPdfResult(null);
    setGenerateError(null);
    const formData = new FormData();
    Array.from(fileList).forEach((f) => formData.append("files", f));
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setGenerateError(data.error ?? "Upload failed");
      return;
    }
    setSessionId(data.sessionId);
    setFiles((prev) => [...prev, ...data.files]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(docId: string | undefined) {
    setFiles((prev) => prev.filter((f) => f.docId !== docId));
    if (docId) {
      setExcludedPairs((prev) => new Set([...prev].filter((key) => !key.startsWith(`${docId}:`))));
    }
  }

  function togglePair(docId: string, personId: string) {
    const key = pairKey(docId, personId);
    setExcludedPairs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setGenerateResult(null);
    setPrintResult(null);
    setGenerateError(null);
  }

  async function handleGenerate() {
    if (!sessionId) return;
    if (!validFiles.length) {
      setGenerateError("Upload at least one valid .docx first.");
      return;
    }
    if (!selectedIds.size) {
      setGenerateError("Select at least one person to generate for.");
      return;
    }
    if (!selectedCombinations.length) {
      setGenerateError("Select at least one doc/person pair to generate.");
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);
    setPrintResult(null);
    setUploadedPdfResult(null);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        files: validFiles.map((f) => ({ docId: f.docId, originalName: f.originalName })),
        people: selectedPeople,
        selections: selectedCombinations,
      }),
    });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setGenerateError(data.error ?? "Generation failed");
      return;
    }
    setGenerateResult(data);
  }

  async function handleGeneratePrintPdf() {
    if (!sessionId) return;
    if (!validFiles.length) {
      setGenerateError("Upload at least one valid .docx first.");
      return;
    }
    if (!selectedIds.size) {
      setGenerateError("Select at least one person to generate for.");
      return;
    }
    if (!selectedCombinations.length) {
      setGenerateError("Select at least one doc/person pair to generate.");
      return;
    }
    setPrintGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);
    setPrintResult(null);
    setUploadedPdfResult(null);
    const res = await fetch("/api/generate-print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        files: validFiles.map((f) => ({ docId: f.docId, originalName: f.originalName })),
        people: selectedPeople,
        selections: selectedCombinations,
      }),
    });
    const data = await res.json();
    setPrintGenerating(false);
    if (!res.ok) {
      const detail = data.errors?.length ? ` ${data.errors[0].message}` : "";
      setGenerateError(`${data.error ?? "Print PDF generation failed"}.${detail}`);
      return;
    }
    setPrintResult(data);
  }

  async function handleCombineUploadedPdf() {
    if (!sessionId) return;
    if (!validFiles.length) {
      setGenerateError("Upload at least one valid .docx first.");
      return;
    }
    setUploadedPdfGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);
    setPrintResult(null);
    setUploadedPdfResult(null);
    const res = await fetch("/api/combine-uploaded-print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        files: validFiles.map((f) => ({ docId: f.docId, originalName: f.originalName })),
      }),
    });
    const data = await res.json();
    setUploadedPdfGenerating(false);
    if (!res.ok) {
      const detail = data.errors?.length ? ` ${data.errors[0].message}` : "";
      setGenerateError(`${data.error ?? "Uploaded PDF combine failed"}.${detail}`);
      return;
    }
    setUploadedPdfResult(data);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  const outputCount = selectedCombinations.length;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between mb-8 max-w-6xl mx-auto">
        <div>
          <h1 className="font-mono text-2xl font-semibold">Duplicate</h1>
          <p className="text-sm text-ink-muted">
            Upload experiment docs. Get back one personalized copy per person on your roster.
          </p>
        </div>
        <button onClick={handleLogout} className="text-xs text-ink-muted underline hover:text-ink">
          Log out
        </button>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* People roster */}
        <section className="card rounded-sm p-5 h-fit">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-wide">Roster</h2>
            <span className="text-xs text-ink-muted">{people.length} people</span>
          </div>

          <form onSubmit={handleAddOrUpdate} className="mb-5 space-y-2">
            <input
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-line bg-paper-card px-2.5 py-1.5 text-sm rounded-sm outline-none focus:ring-2 focus:ring-ink/20"
            />
            <div className="flex gap-2">
              <input
                placeholder="Class"
                value={form.className}
                onChange={(e) => setForm({ ...form, className: e.target.value })}
                className="w-1/2 border border-line bg-paper-card px-2.5 py-1.5 text-sm rounded-sm outline-none focus:ring-2 focus:ring-ink/20"
              />
              <input
                placeholder="Roll No"
                value={form.rollNo}
                onChange={(e) => setForm({ ...form, rollNo: e.target.value })}
                className="w-1/2 border border-line bg-paper-card px-2.5 py-1.5 text-sm rounded-sm outline-none focus:ring-2 focus:ring-ink/20"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!form.name.trim()}
                className="flex-1 bg-ink text-paper-card py-1.5 text-sm rounded-sm disabled:opacity-40 hover:opacity-90 transition"
              >
                {editingId ? "Save changes" : "Add person"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm({ name: "", className: "", rollNo: "" });
                  }}
                  className="px-3 py-1.5 text-sm border border-line rounded-sm hover:bg-paper"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {people.length === 0 ? (
            <p className="text-sm text-ink-muted">No one on the roster yet. Add someone above.</p>
          ) : (
            <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {people.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-2 border border-line rounded-sm px-2.5 py-2 bg-paper-card"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleSelected(p.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-ink-muted font-mono truncate">
                      {p.className || "—"} {p.rollNo && `· Roll ${p.rollNo}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => startEdit(p)} className="text-xs text-ink-muted hover:text-ink underline">
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-xs text-stamp-red hover:opacity-70 underline"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Upload + generate */}
        <section className="space-y-6">
          <div className="card rounded-sm p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-wide">Experiment docs</h2>
              <span className="text-xs text-ink-muted">.docx only</span>
            </div>

            <label className="block border-2 border-dashed border-line rounded-sm p-6 text-center cursor-pointer hover:border-ink/40 transition mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx"
                multiple
                onChange={(e) => handleUpload(e.target.files)}
                className="hidden"
              />
              <p className="text-sm">
                {uploading ? "Uploading…" : "Click to choose files, or drop them here"}
              </p>
              <p className="text-xs text-ink-muted mt-1">You can add more later — they stack up below.</p>
            </label>

            {files.length > 0 && (
              <ul className="space-y-2">
                {files.map((f, i) => {
                  const badge = f.error
                    ? { label: "Could not read file", color: "text-stamp-red" }
                    : STATE_LABEL[f.state ?? "missing"];
                  return (
                    <li key={f.docId ?? i} className="stub rounded-sm p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{f.originalName}</p>
                          {f.error ? (
                            <p className="text-xs text-stamp-red mt-0.5">{f.error}</p>
                          ) : (
                            <p className="text-xs font-mono text-ink-muted mt-0.5 whitespace-pre-wrap break-words">
                              {f.rawText?.trim() ? f.rawText.replace(/\t/g, "    ") : "(empty header)"}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-xs font-mono ${badge.color}`}>{badge.label}</span>
                          <button
                            onClick={() => removeFile(f.docId)}
                            className="text-xs text-ink-muted hover:text-stamp-red underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card rounded-sm p-5">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-wide mb-3">Generate</h2>
            <p className="text-sm text-ink-muted mb-4">
              {validFiles.length} doc(s) × {selectedPeople.length} selected people ={" "}
              <span className="font-mono text-ink">{outputCount || 0} selected output(s)</span>.
            </p>

            {validFiles.length > 0 && selectedPeople.length > 0 && (
              <div className="stub rounded-sm p-3 mb-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm border-collapse">
                  <thead>
                    <tr className="text-xs text-ink-muted">
                      <th className="text-left font-mono font-semibold uppercase py-1.5 pr-3">Doc</th>
                      {selectedPeople.map((person) => (
                        <th key={person.id} className="font-mono font-semibold uppercase py-1.5 px-2 text-center">
                          <span className="block max-w-24 truncate">{person.name}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validFiles.map((file) => (
                      <tr key={file.docId} className="border-t border-line">
                        <td className="py-2 pr-3">
                          <span className="block max-w-56 truncate font-medium">{file.originalName}</span>
                        </td>
                        {selectedPeople.map((person) => {
                          const checked = !excludedPairs.has(pairKey(file.docId, person.id));
                          return (
                            <td key={person.id} className="py-2 px-2 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePair(file.docId, person.id)}
                                aria-label={`${file.originalName} for ${person.name}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              <button
                onClick={handleGenerate}
                disabled={generating || printGenerating || uploadedPdfGenerating || !sessionId}
                className="bg-carbon-yellow text-ink font-medium px-5 py-2 rounded-sm disabled:opacity-40 hover:opacity-90 transition"
              >
                {generating ? "Generating…" : "Generate copies"}
              </button>
              <button
                onClick={handleGeneratePrintPdf}
                disabled={generating || printGenerating || uploadedPdfGenerating || !sessionId}
                className="bg-ink text-paper-card font-medium px-5 py-2 rounded-sm disabled:opacity-40 hover:opacity-90 transition"
              >
                {printGenerating ? "Preparing PDF…" : "Generate combined print PDF"}
              </button>
              <button
                onClick={handleCombineUploadedPdf}
                disabled={generating || printGenerating || uploadedPdfGenerating || !sessionId}
                className="border border-ink text-ink font-medium px-5 py-2 rounded-sm disabled:opacity-40 hover:bg-paper transition"
              >
                {uploadedPdfGenerating ? "Combining PDF…" : "Combine uploaded docs as PDF"}
              </button>
            </div>

            {(printGenerating || uploadedPdfGenerating) && (
              <p className="text-sm text-ink-muted mt-3">
                Starting the PDF converter can take about a minute if the Render service is waking up.
              </p>
            )}

            {generateError && <p className="text-sm text-stamp-red mt-3">{generateError}</p>}

            {generateResult && (
              <div className="mt-4 stub rounded-sm p-4">
                <span className="stamp text-stamp-green text-xs mb-2">Done</span>
                <p className="text-sm mt-2">
                  Generated <strong>{generateResult.generatedCount}</strong> file(s).
                </p>
                {generateResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-stamp-red font-medium">
                      {generateResult.errors.length} could not be generated:
                    </p>
                    <ul className="text-xs text-stamp-red list-disc list-inside">
                      {generateResult.errors.map((e, i) => (
                        <li key={i}>
                          {e.file} → {e.person}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <a
                  href={generateResult.downloadUrl}
                  className="inline-block mt-3 bg-ink text-paper-card px-4 py-2 text-sm rounded-sm hover:opacity-90 transition"
                >
                  Download .zip
                </a>
              </div>
            )}

            {printResult && (
              <div className="mt-4 stub rounded-sm p-4">
                <span className="stamp text-stamp-green text-xs mb-2">Print PDF ready</span>
                <p className="text-sm mt-2">
                  Combined <strong>{printResult.generatedCount}</strong> document(s) into{" "}
                  <strong>{printResult.pageCount}</strong> PDF page(s).
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  Added {printResult.blankPagesAdded} blank duplex page(s) so each document starts on a fresh sheet.
                </p>
                <a
                  href={printResult.downloadUrl}
                  className="inline-block mt-3 bg-ink text-paper-card px-4 py-2 text-sm rounded-sm hover:opacity-90 transition"
                >
                  Download print PDF
                </a>
              </div>
            )}

            {uploadedPdfResult && (
              <div className="mt-4 stub rounded-sm p-4">
                <span className="stamp text-stamp-green text-xs mb-2">Uploaded PDF ready</span>
                <p className="text-sm mt-2">
                  Combined <strong>{uploadedPdfResult.generatedCount}</strong> uploaded document(s) into{" "}
                  <strong>{uploadedPdfResult.pageCount}</strong> PDF page(s).
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  Added {uploadedPdfResult.blankPagesAdded} blank duplex page(s) so each document starts on a fresh sheet.
                </p>
                <a
                  href={uploadedPdfResult.downloadUrl}
                  className="inline-block mt-3 bg-ink text-paper-card px-4 py-2 text-sm rounded-sm hover:opacity-90 transition"
                >
                  Download uploaded docs PDF
                </a>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
