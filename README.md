# Duplicate — experiment doc header filler

Upload your experiment docs (`.docx`), keep a roster of people (Name / Class /
Roll No), and generate one personalized copy of every doc for every person —
zipped up and ready to download.

## How it works

1. **Roster** — add each person's Name, Class, and Roll No. This is saved in
   the browser with `localStorage` and persists between visits on that device.
2. **Upload** — drop in one or more `.docx` experiment files. Each one is
   scanned for its header and you'll see a live preview of what was detected:
   - **Name found** — header already has values; they'll be overwritten per person.
   - **Blank header** — header has the `Name:` / `Class:` / `Roll No:` labels
     but no values; they'll be filled in per person.
   - **No header** — doc has no header at all; one will be created.
3. **Generate** — pick which people to generate for, hit Generate, and
   download a `.zip` containing `originalname_PersonName.docx` for every
   doc × person combination.
4. **Print PDF** — use **Generate combined print PDF** to convert the same
   personalized docs to one duplex-safe PDF. A blank page is inserted after
   any odd-page document before the next document, so each one starts on the
   front side of a sheet.
5. **Uploaded-doc PDF** — use **Combine uploaded docs as PDF** when you want
   the uploaded files merged as-is without personalizing headers first.

The header logic only edits the `Name:` / `Class:` / `Roll No:` fields — the
rest of each document (body content, formatting, images, etc.) is left
completely untouched.

## Local setup

```bash
npm install
cp .env.example .env.local   # then edit APP_PASSWORD and BLOB_READ_WRITE_TOKEN below
npm run dev
```

Open http://localhost:3000 and log in with the password you set.

### Environment variables

| Variable | Description |
|----------|-------------|
| `APP_PASSWORD` | The password required to log into the app. |
| `GOTENBERG_URL` | Gotenberg service URL for combined print PDFs. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for uploaded docs and generated outputs. |

## Deploying to Vercel

The people roster is browser-local and does not use Vercel server storage.
Each browser/device gets its own saved roster.

Uploaded `.docx` files and generated downloads are stored in private
[Vercel Blob](https://vercel.com/docs/storage/vercel-blob) objects. Browser
uploads go directly to Blob so large documents do not hit Vercel Function body
limits.

1. Create or connect a Vercel Blob store for the project.
2. Set `APP_PASSWORD`, `BLOB_READ_WRITE_TOKEN`, and `GOTENBERG_URL` in Vercel
   Project Settings -> Environment Variables.
3. Push to a Git repo and import it in Vercel, or run `vercel deploy` from
   this directory.

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

## Combined print PDF

The print flow uses Gotenberg to convert each generated `.docx` into a PDF,
then merges those PDFs locally. If a document has an odd page count and
another document follows it, the app inserts a blank page before merging the
next document. That keeps duplex printing from putting the next person's
experiment on the back of the previous person's final sheet.

The uploaded-doc PDF flow uses the same conversion and duplex-safe merge, but
it converts the uploaded documents as-is instead of generating personalized
copies.

Set `GOTENBERG_URL` to your Gotenberg service, for example a Render-hosted
URL such as `https://gotenberg-8-libreoffice-xowd.onrender.com`.

## Project structure

```
src/
  app/
    api/
      auth/login, auth/logout   — password gate
      blob-upload               — issues constrained Vercel Blob upload tokens
      upload                    — reads uploaded Blobs, returns header previews
      generate                  — batch-generates N docs × M people, zips them
      generate-print            — creates one duplex-safe combined PDF
      combine-uploaded-print    — combines uploaded docs as-is into one PDF
      download                  — serves the generated zip
      download-print            — serves the generated combined PDF
      download-uploaded-print   — serves the uploaded-doc combined PDF
    page.tsx                    — login gate / dashboard switch
  components/
    LoginForm.tsx
    Dashboard.tsx                — roster + upload + generate UI
  lib/
    docxHeader.ts                — core header detection & replacement engine
    browserPeopleStore.ts         — browser-local roster persistence
    fileStore.ts                   — private Vercel Blob persistence
    auth.ts                        — password gate / session cookie
```
