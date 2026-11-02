export interface ParsedItem {
  barcode: string;
  description: string;
  colour: string;
  price: number;
  total: number;
  sizes: Record<string, number>;
}

interface Word {
  str: string;
  x: number;
  y: number;
}

interface Line {
  y: number;
  words: Word[];
  text: string;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

function isNumeric(s: string): boolean {
  return NUMERIC.test(s.trim());
}

function groupLines(words: Word[]): Line[] {
  const lines: Line[] = [];
  for (const w of words) {
    const y = Math.round(w.y * 10) / 10;
    let ln = lines.find((l) => Math.abs(l.y - y) <= 3);
    if (!ln) {
      ln = { y, words: [], text: "" };
      lines.push(ln);
    }
    ln.words.push(w);
  }
  lines.sort((a, b) => b.y - a.y);
  for (const ln of lines) {
    ln.words.sort((a, b) => a.x - b.x);
    ln.text = ln.words.map((w) => w.str).join(" ").trim();
  }
  return lines;
}

function parseSizes(
  headerLine: Line,
  colourLine: Line
): { total: number; sizes: Record<string, number> } {
  const sizes: Record<string, number> = {};
  const sizeLabels: { label: string; x: number }[] = [];

  for (const w of headerLine.words) {
    const t = w.str.trim();
    if (t === "Colour/Size" || t === "Total") continue;
    sizeLabels.push({ label: t, x: w.x });
    sizes[t] = 0;
  }

  const numericWords = colourLine.words.filter((w) => isNumeric(w.str.trim()));
  let total = 0;
  if (numericWords.length) {
    total = parseInt(numericWords[0].str.trim(), 10) || 0;
  }

  for (const cw of numericWords.slice(1)) {
    let bestLabel = "";
    let bestDist = Infinity;
    for (const sl of sizeLabels) {
      const d = Math.abs(cw.x - sl.x);
      if (d < bestDist) {
        bestDist = d;
        bestLabel = sl.label;
      }
    }
    if (bestLabel && bestDist <= 20) {
      sizes[bestLabel] = parseInt(cw.str.trim(), 10) || 0;
    }
  }

  return { total, sizes };
}

function parseItems(lines: Line[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const words = lines[i].words;
    if (words.length !== 4) continue;

    const code = words[0].str.trim();
    const qty = words[1].str.trim();
    const price = words[2].str.trim();
    const value = words[3].str.trim();

    if (!/^[A-Z0-9]+$/.test(code)) continue;
    if (!isNumeric(qty) || !isNumeric(price) || !isNumeric(value)) continue;

    const description = i + 1 < lines.length ? lines[i + 1].text : "";

    let colour = "";
    let total = parseInt(qty, 10) || 0;
    let sizes: Record<string, number> = {};
    if (i + 3 < lines.length && lines[i + 2].text.includes("Colour/Size")) {
      const colourLine = lines[i + 3];
      const leading: string[] = [];
      for (const w of colourLine.words) {
        if (isNumeric(w.str.trim())) break;
        leading.push(w.str.trim());
      }
      colour = leading.join(" ").trim();
      const s = parseSizes(lines[i + 2], colourLine);
      total = s.total || total;
      sizes = s.sizes;
    }

    items.push({
      barcode: code,
      description,
      colour,
      price: parseFloat(price),
      total,
      sizes,
    });
  }
  return items;
}

export async function parsePdfBuffer(buffer: ArrayBuffer): Promise<ParsedItem[]> {
  const { getDocumentProxy } = await import("unpdf");
  const data = new Uint8Array(buffer);
  const doc = await getDocumentProxy(data);

  const words: Word[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    for (const item of tc.items as unknown as { str: string; transform: number[] }[]) {
      if (!item.str || !item.str.trim()) continue;
      words.push({ str: item.str, x: item.transform[4], y: item.transform[5] });
    }
  }

  const lines = groupLines(words);
  const items = parseItems(lines);

  const seen = new Set<string>();
  return items.filter((it) => {
    if (!it.barcode || seen.has(it.barcode)) return false;
    seen.add(it.barcode);
    return true;
  });
}
