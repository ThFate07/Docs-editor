"use client";

import { useEffect, useRef, useState } from "react";

type Person = { id: string; name: string; className: string; rollNo: string };

type UploadResult = {
  originalName: string;
  docId?: string;
  state?: "filled" | "placeholder" | "missing" | "ambiguous";
  rawText?: string;
  detected?: { name: string | null; className: string | null; rollNo: string | null };
  error?: string;
};

const STATE_LABEL: Record<string, { label: string; color: string }> = {
  filled: { label: "Name found", color: "text-stamp-green" },
  placeholder: { label: "Blank header", color: "text-ink-muted" },
  missing: { label: "No header", color: "text-stamp-red" },
  ambiguous: { label: "Check this one", color: "text-stamp-red" },
};

export default function Dashboard() {
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [form, setForm] = useState({ name: "", className: "", rollNo: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{
    generatedCount: number;
    errors: { file: string; person: string; message: string }[];
    downloadUrl: string;
  } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPeople();
  }, []);

  async function loadPeople() {
    setPeopleLoading(true);
    const res = await fetch("/api/people");
    const data = await res.json();
    setPeople(data.people ?? []);
    setSelectedIds(new Set((data.people ?? []).map((p: Person) => p.id)));
    setPeopleLoading(false);
  }

  async function handleAddOrUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId) {
      await fetch(`/api/people/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setForm({ name: "", className: "", rollNo: "" });
    setEditingId(null);
    loadPeople();
  }

  function startEdit(p: Person) {
    setEditingId(p.id);
    setForm({ name: p.name, className: p.className, rollNo: p.rollNo });
  }

  async function handleDelete(id: string) {
    await fetch(`/api/people/${id}`, { method: "DELETE" });
    if (editingId === id) {
      setEditingId(null);
      setForm({ name: "", className: "", rollNo: "" });
    }
    loadPeople();
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    setUploading(true);
    setGenerateResult(null);
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
  }

  async function handleGenerate() {
    if (!sessionId) return;
    const validFiles = files.filter((f) => f.docId && !f.error);
    if (!validFiles.length) {
      setGenerateError("Upload at least one valid .docx first.");
      return;
    }
    if (!selectedIds.size) {
      setGenerateError("Select at least one person to generate for.");
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        files: validFiles.map((f) => ({ docId: f.docId, originalName: f.originalName })),
        personIds: Array.from(selectedIds),
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  const outputCount = files.filter((f) => f.docId && !f.error).length * selectedIds.size;

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

          {peopleLoading ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : people.length === 0 ? (
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
                    ? { label: "Couldn't read file", color: "text-stamp-red" }
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
              {files.filter((f) => f.docId && !f.error).length} doc(s) × {selectedIds.size} selected people ={" "}
              <span className="font-mono text-ink">{outputCount || 0} files</span> in your download.
            </p>

            <button
              onClick={handleGenerate}
              disabled={generating || !sessionId}
              className="bg-carbon-yellow text-ink font-medium px-5 py-2 rounded-sm disabled:opacity-40 hover:opacity-90 transition"
            >
              {generating ? "Generating…" : "Generate copies"}
            </button>

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
                      {generateResult.errors.length} couldn't be generated:
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
          </div>
        </section>
      </div>
    </main>
  );
}
