# Duplicate — experiment doc header filler

Upload your experiment docs (`.docx`), keep a roster of people (Name / Class /
Roll No), and generate one personalized copy of every doc for every person —
zipped up and ready to download.

## How it works

1. **Roster** — add each person's Name, Class, and Roll No. This is saved and
   persists between visits.
2. **Upload** — drop in one or more `.docx` experiment files. Each one is
   scanned for its header and you'll see a live preview of what was detected:
   - **Name found** — header already has values; they'll be overwritten per person.
   - **Blank header** — header has the `Name:` / `Class:` / `Roll No:` labels
     but no values; they'll be filled in per person.
   - **No header** — doc has no header at all; one will be created.
3. **Generate** — pick which people to generate for, hit Generate, and
   download a `.zip` containing `originalname_PersonName.docx` for every
   doc × person combination.

The header logic only edits the `Name:` / `Class:` / `Roll No:` fields — the
rest of each document (body content, formatting, images, etc.) is left
completely untouched.

## Local setup

```bash
npm install
cp .env.example .env.local   # then edit APP_PASSWORD below
npm run dev
```

Open http://localhost:3000 and log in with the password you set.

### Environment variables

| Variable       | Description                                      |
|----------------|---------------------------------------------------|
| `APP_PASSWORD` | The password required to log into the app.        |

## Deploying to Vercel

This app currently stores data on the local filesystem (`/data`), which works
fine for local use but **will not persist** on Vercel — serverless functions
get a fresh, ephemeral filesystem on every invocation. Before deploying for
real (public, always-available) use, swap the storage layer:

1. **People list** → replace `src/lib/peopleStore.ts` with a version backed
   by [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) or
   [Vercel KV](https://vercel.com/docs/storage/vercel-kv). The function
   signatures (`listPeople`, `addPerson`, `updatePerson`, `deletePerson`)
   are the only thing calling code depends on — keep those the same and
   nothing else in the app needs to change.
2. **Uploaded / generated files** → replace `src/lib/fileStore.ts` with a
   version backed by [Vercel Blob](https://vercel.com/docs/storage/vercel-blob).
   Same idea: keep the exported function signatures the same.
3. Set `APP_PASSWORD` as an environment variable in the Vercel dashboard
   (Project Settings → Environment Variables).
4. Push to a Git repo and import it in Vercel, or run `vercel deploy` from
   this directory.

Until you do that swap, you can still deploy as-is for quick testing — it'll
work within a single request/response cycle, but the roster and any
in-progress uploads won't reliably survive between serverless invocations.
For a **single always-on server** (e.g. a small VPS, Railway, Render, or
your own machine) instead of Vercel, the local filesystem storage as
shipped works fine permanently — just run `npm run build && npm run start`.

## Known limitations (by design, for this v1)

- Only `.docx` is supported (not `.doc` or `.pdf`).
- Header detection looks for the labels `Name:`, `Class:`, `Roll No:`
  (case-insensitive, tolerant of missing colons/spacing) in the document's
  **default** header. If your docs use different labels or the header is
  structured very differently, detection may come back "No header" even
  though something is there — in that case nothing gets overwritten
  incorrectly, but nothing gets filled in either. Let the header preview
  screen be your check before generating.
- The replacement logic tries to keep new values within the same text run as
  the original label so formatting (bold, font, etc.) is preserved. For docs
  with unusual/split runs this may occasionally miss the original visual
  styling of the value — but it will never corrupt the file.

## Planned: Merge & Print (not built yet)

A future "merge all generated docs into one file for printing" feature is
planned, with **duplex (double-sided) printing** in mind: each person's
doc needs to start on the front of a new physical sheet, so nobody's
experiment prints on the back of someone else's. This will require:

- Converting each generated `.docx` to PDF to get an accurate page count
  (Word page counts aren't knowable without actually rendering the
  document — the `docx` library used here can't tell you this).
- Appending a blank page after any doc with an odd page count, so the next
  doc always starts on a fresh sheet under duplex printing.
- Since Vercel serverless functions can't run LibreOffice directly, this
  will need an external conversion service (e.g. Gotenberg, CloudConvert)
  or a small separate microservice hosted somewhere that allows it
  (Railway/Render/Fly.io).

The current generation code keeps each person's document as a self-contained
buffer, so wiring this up later should be additive rather than a rewrite.

## Project structure

```
src/
  app/
    api/
      auth/login, auth/logout   — password gate
      people, people/[id]       — roster CRUD
      upload                    — accepts .docx files, returns header previews
      generate                  — batch-generates N docs × M people, zips them
      download                  — serves the generated zip
    page.tsx                    — login gate / dashboard switch
  components/
    LoginForm.tsx
    Dashboard.tsx                — roster + upload + generate UI
  lib/
    docxHeader.ts                — core header detection & replacement engine
    peopleStore.ts                — roster persistence (swap for Postgres/KV on Vercel)
    fileStore.ts                   — file persistence (swap for Blob on Vercel)
    auth.ts                        — password gate / session cookie
```
