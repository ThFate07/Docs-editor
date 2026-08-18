import JSZip from "jszip";

export type Person = {
  id: string;
  name: string;
  className: string;
  rollNo: string;
};

export type HeaderState = "filled" | "placeholder" | "missing" | "ambiguous";

export type HeaderDetection = {
  headerPath: string | null; // path inside zip, e.g. word/header1.xml
  state: HeaderState;
  rawText: string; // plain text concatenation of the header (tabs as \t, paragraphs as \n)
  detected: {
    name: string | null;
    className: string | null;
    rollNo: string | null;
  };
};

type TextSegment = {
  type: "text" | "tab" | "break";
  value: string; // for 'text' segments, the raw inner text (already XML-unescaped)
  matchStart: number; // index in raw XML string where this whole <w:t>...</w:t> (or self-closing tag) starts
  matchEnd: number; // index in raw XML string where it ends
  innerStart: number; // index where inner text starts (only for 'text')
  innerEnd: number; // index where inner text ends (only for 'text')
};

// Trailing whitespace after the label must only consume plain spaces —
// never \t or \n — otherwise it swallows the tab/newline that separates
// this field from the next one and shifts every offset that follows.
const LABEL_PATTERNS = {
  name: /name[ ]*:?[ ]*/i,
  className: /class[ ]*:?[ ]*/i,
  rollNo: /roll[ ]*no\.?[ ]*:?[ ]*/i,
};

const DEFAULT_RIGHT_TAB_POS = 9360; // Letter width minus default 1" left/right margins.

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlUnescape(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Tokenize a header/paragraph XML fragment into an ordered list of text runs,
 * tabs, and line breaks, tracking exact string offsets so we can surgically
 * replace text later without disturbing surrounding formatting/XML.
 */
function tokenize(xml: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Matches: <w:t ...>text</w:t>  OR  <w:t ...>text</w:t>  self variants, <w:tab/>, <w:br/>, </w:p> (paragraph end)
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const full = m[0];
    if (full.startsWith("<w:t ") || full.startsWith("<w:t>")) {
      const innerStart = m.index + full.indexOf(">") + 1;
      const innerEnd = m.index + full.length - "</w:t>".length;
      segments.push({
        type: "text",
        value: xmlUnescape(m[1]),
        matchStart: m.index,
        matchEnd: m.index + full.length,
        innerStart,
        innerEnd,
      });
    } else if (full.startsWith("<w:tab")) {
      segments.push({
        type: "tab",
        value: "\t",
        matchStart: m.index,
        matchEnd: m.index + full.length,
        innerStart: -1,
        innerEnd: -1,
      });
    } else if (full.startsWith("<w:br")) {
      segments.push({
        type: "break",
        value: "\n",
        matchStart: m.index,
        matchEnd: m.index + full.length,
        innerStart: -1,
        innerEnd: -1,
      });
    } else if (full === "</w:p>") {
      segments.push({
        type: "break",
        value: "\n",
        matchStart: m.index,
        matchEnd: m.index,
        innerStart: -1,
        innerEnd: -1,
      });
    }
  }
  return segments;
}

function buildPlainText(segments: TextSegment[]): { text: string; offsetToSegment: { segIdx: number; charOffsetInSeg: number }[] } {
  let text = "";
  const offsetToSegment: { segIdx: number; charOffsetInSeg: number }[] = [];
  segments.forEach((seg, idx) => {
    for (let i = 0; i < seg.value.length; i++) {
      offsetToSegment.push({ segIdx: idx, charOffsetInSeg: i });
    }
    text += seg.value;
  });
  return { text, offsetToSegment };
}

/**
 * Given the plain-text header and a label regex, find the value that follows
 * the label up until the next tab/newline/next-known-label.
 */
function extractField(
  text: string,
  labelRe: RegExp,
  otherLabelRes: RegExp[]
): { start: number; end: number; value: string } | null {
  const m = labelRe.exec(text);
  if (!m) return null;
  const valueStart = m.index + m[0].length;
  let valueEnd = text.length;
  const stops = [text.indexOf("\t", valueStart), text.indexOf("\n", valueStart)];
  for (const otherRe of otherLabelRes) {
    const om = new RegExp(otherRe.source, otherRe.flags).exec(text.slice(valueStart));
    if (om) stops.push(valueStart + om.index);
  }
  for (const s of stops) {
    if (s !== -1 && s < valueEnd) valueEnd = s;
  }
  const value = text.slice(valueStart, valueEnd).trim();
  return { start: valueStart, end: valueStart + (text.slice(valueStart, valueEnd).length), value };
}

function readNumericAttr(tag: string, attrName: string): number | null {
  const match = new RegExp(`\\b${attrName}="(\\d+)"`).exec(tag);
  return match ? Number(match[1]) : null;
}

function getRightTabPositionFromDocumentXml(documentXml: string): number {
  const sectPr = /<w:sectPr\b[\s\S]*?<\/w:sectPr>/.exec(documentXml)?.[0] ?? documentXml;
  const pgSzTag = /<w:pgSz\b[^>]*\/?>/.exec(sectPr)?.[0];
  const pgMarTag = /<w:pgMar\b[^>]*\/?>/.exec(sectPr)?.[0];

  if (!pgSzTag || !pgMarTag) return DEFAULT_RIGHT_TAB_POS;

  const pageWidth = readNumericAttr(pgSzTag, "w:w");
  const leftMargin = readNumericAttr(pgMarTag, "w:left");
  const rightMargin = readNumericAttr(pgMarTag, "w:right");

  if (!pageWidth || leftMargin === null || rightMargin === null) return DEFAULT_RIGHT_TAB_POS;

  const tabPosition = pageWidth - leftMargin - rightMargin;
  return tabPosition > 0 ? tabPosition : DEFAULT_RIGHT_TAB_POS;
}

async function getRightTabPosition(zip: JSZip): Promise<number> {
  const docFile = zip.file("word/document.xml");
  if (!docFile) return DEFAULT_RIGHT_TAB_POS;
  const documentXml = await docFile.async("string");
  return getRightTabPositionFromDocumentXml(documentXml);
}

function detectFromXml(xml: string): HeaderDetection {
  const segments = tokenize(xml);
  const { text } = buildPlainText(segments);

  const nameField = extractField(text, LABEL_PATTERNS.name, [LABEL_PATTERNS.className, LABEL_PATTERNS.rollNo]);
  const classField = extractField(text, LABEL_PATTERNS.className, [LABEL_PATTERNS.name, LABEL_PATTERNS.rollNo]);
  const rollField = extractField(text, LABEL_PATTERNS.rollNo, [LABEL_PATTERNS.name, LABEL_PATTERNS.className]);

  const foundAny = !!(nameField || classField || rollField);
  const allEmpty =
    (!nameField || nameField.value === "" || /^_+$/.test(nameField.value)) &&
    (!classField || classField.value === "" || /^_+$/.test(classField.value)) &&
    (!rollField || rollField.value === "" || /^_+$/.test(rollField.value));

  let state: HeaderState;
  if (!foundAny) state = "missing";
  else if (allEmpty) state = "placeholder";
  else if (nameField && classField && rollField) state = "filled";
  else state = "ambiguous";

  return {
    headerPath: null,
    state,
    rawText: text,
    detected: {
      name: nameField ? nameField.value || null : null,
      className: classField ? classField.value || null : null,
      rollNo: rollField ? rollField.value || null : null,
    },
  };
}

const DEFAULT_HEADER_XML = (person: Person, rightTabPosition: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${rightTabPosition}"/></w:tabs></w:pPr>
<w:r><w:t xml:space="preserve">Name: ${xmlEscape(person.name)}</w:t></w:r>
<w:r><w:tab/><w:t xml:space="preserve">Class: ${xmlEscape(person.className)}</w:t></w:r>
</w:p>
<w:p><w:r><w:t xml:space="preserve">Roll No: ${xmlEscape(person.rollNo)}</w:t></w:r></w:p>
</w:hdr>`;

/**
 * Load a .docx buffer, find its default header part (if any), and return
 * detection info describing what's currently in it.
 */
export async function detectHeader(buffer: Buffer): Promise<HeaderDetection> {
  const zip = await JSZip.loadAsync(buffer);
  const headerPath = await findDefaultHeaderPath(zip);
  if (!headerPath) {
    return { headerPath: null, state: "missing", rawText: "", detected: { name: null, className: null, rollNo: null } };
  }
  const xml = await zip.file(headerPath)!.async("string");
  const detection = detectFromXml(xml);
  detection.headerPath = headerPath;
  return detection;
}

async function findDefaultHeaderPath(zip: JSZip): Promise<string | null> {
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const docFile = zip.file("word/document.xml");
  if (!relsFile || !docFile) return null;
  const rels = await relsFile.async("string");
  const doc = await docFile.async("string");

  // Find a headerReference of type="default" in document.xml and grab its r:id
  const refMatch = /<w:headerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"/.exec(doc);
  let rId: string | null = refMatch ? refMatch[1] : null;

  if (!rId) {
    // fall back to any headerReference at all
    const anyRef = /<w:headerReference[^>]*r:id="([^"]+)"/.exec(doc);
    rId = anyRef ? anyRef[1] : null;
  }
  if (!rId) return null;

  const relRe = new RegExp(`<Relationship[^>]*Id="${rId}"[^>]*Target="([^"]+)"`);
  const relMatch = relRe.exec(rels);
  if (!relMatch) return null;
  let target = relMatch[1];
  if (!target.startsWith("word/")) target = "word/" + target.replace(/^\.?\//, "");
  return target;
}

/**
 * Generate a new .docx buffer for `person`: replaces the default header's
 * Name/Class/Roll No fields (or creates a header from scratch if none
 * exists), leaving the rest of the document untouched.
 */
export async function generateForPerson(buffer: Buffer, person: Person): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const headerPath = await findDefaultHeaderPath(zip);
  const rightTabPosition = await getRightTabPosition(zip);

  if (headerPath && zip.file(headerPath)) {
    zip.file(headerPath, DEFAULT_HEADER_XML(person, rightTabPosition));
  } else {
    await createDefaultHeader(zip, person, rightTabPosition);
  }

  const out = await zip.generateAsync({ type: "nodebuffer" });
  return out;
}

/**
 * Wire up a brand-new default header part: add header1.xml, register it in
 * [Content_Types].xml and word/_rels/document.xml.rels, and reference it
 * from the section properties in word/document.xml.
 */
async function createDefaultHeader(zip: JSZip, person: Person, rightTabPosition: number): Promise<void> {
  const HEADER_PATH = "word/header_generated.xml";
  zip.file(HEADER_PATH, DEFAULT_HEADER_XML(person, rightTabPosition));

  // 1. [Content_Types].xml
  const ctPath = "[Content_Types].xml";
  let ct = await zip.file(ctPath)!.async("string");
  if (!ct.includes("header_generated.xml")) {
    ct = ct.replace(
      "</Types>",
      `<Override PartName="/${HEADER_PATH}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`
    );
    zip.file(ctPath, ct);
  }

  // 2. word/_rels/document.xml.rels
  const relsPath = "word/_rels/document.xml.rels";
  let rels = await zip.file(relsPath)!.async("string");
  const newRid = `rIdHeaderGen1`;
  if (!rels.includes(newRid)) {
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="${newRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header_generated.xml"/></Relationships>`
    );
    zip.file(relsPath, rels);
  }

  // 3. word/document.xml — add <w:headerReference w:type="default" r:id="..."/> into the first sectPr
  const docPath = "word/document.xml";
  let doc = await zip.file(docPath)!.async("string");
  const headerRefTag = `<w:headerReference w:type="default" r:id="${newRid}"/>`;
  if (!doc.includes(headerRefTag)) {
    if (/<w:sectPr[^>]*>/.test(doc)) {
      doc = doc.replace(/(<w:sectPr[^>]*>)/, `$1${headerRefTag}`);
    } else {
      // no sectPr at all (unusual) — append a minimal one before </w:body>
      doc = doc.replace(
        "</w:body>",
        `<w:sectPr>${headerRefTag}</w:sectPr></w:body>`
      );
    }
    zip.file(docPath, doc);
  }
}
