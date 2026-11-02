"use client";

import { useCallback, useRef, useState } from "react";

interface Item {
  barcode: string;
  description: string;
  colour: string;
  price: number;
  selected: boolean;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runScan = useCallback(async (f: File) => {
    setParsing(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");
      const parsed: Item[] = (data.items || []).map((it: Item) => ({
        ...it,
        selected: true,
      }));
      setItems(parsed);
      setStatus({
        ok: true,
        msg: parsed.length
          ? `Found ${parsed.length} item(s). Review below, then write to the sheet.`
          : "No items detected in this PDF.",
      });
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : "Parse failed" });
    } finally {
      setParsing(false);
    }
  }, []);

  const onFiles = useCallback(
    (files: FileList | null) => {
      if (files && files[0]) {
        setFile(files[0]);
        setItems([]);
        runScan(files[0]);
      }
    },
    [runScan]
  );

  const scan = useCallback(() => {
    if (!file) {
      inputRef.current?.click();
      return;
    }
    runScan(file);
  }, [file, runScan]);

  const write = useCallback(async () => {
    const selected = items.filter((it) => it.selected);
    if (!selected.length) {
      setStatus({ ok: false, msg: "Select at least one item to write." });
      return;
    }
    setWriting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Write failed");
      setStatus({
        ok: true,
        msg: `Done: ${data.added} added, ${data.skipped} skipped (already exist) in "${data.sheetTitle}".`,
      });
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : "Write failed" });
    } finally {
      setWriting(false);
    }
  }, [items]);

  const update = (idx: number, key: keyof Item, value: string | number | boolean) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
  };

  return (
    <div className="container">
      <h1>Barcode Recap</h1>
      <p className="subtitle">
        Upload a purchase-order PDF to extract barcode, description, colour and price into the Google Sheet.
      </p>

      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          {file ? file.name : "Drop PDF here or click to choose"}
        </div>
        <div className="hint">Text-based purchase orders (e.g. &quot;5614 JIMMY G AUS 001.PDF&quot;)</div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(e) => onFiles(e.target.files)}
      />

      <div className="row">
        <button onClick={scan} disabled={parsing}>
          {parsing ? "Scanning…" : "Scan PDF"}
        </button>
        {items.length > 0 && (
          <>
            <button onClick={write} disabled={writing || !items.some((it) => it.selected)}>
              {writing ? "Writing…" : "Write to Google Sheet"}
            </button>
            <button
              className="ghost"
              onClick={() => {
                setItems([]);
                setFile(null);
                setStatus(null);
              }}
            >
              Clear
            </button>
          </>
        )}
      </div>

      {status && (
        <div className={`status ${status.ok ? "ok" : "error"}`}>{status.msg}</div>
      )}

      {items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>✓</th>
              <th>STYLE NUMBER (barcode)</th>
              <th>STYLE # (description)</th>
              <th>COLOUR</th>
              <th style={{ width: 120 }}>UNIT PRICE (USD)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    type="checkbox"
                    checked={it.selected}
                    onChange={(e) => update(idx, "selected", e.target.checked)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={it.barcode}
                    onChange={(e) => update(idx, "barcode", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={it.description}
                    onChange={(e) => update(idx, "description", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={it.colour}
                    onChange={(e) => update(idx, "colour", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={it.price}
                    onChange={(e) => update(idx, "price", parseFloat(e.target.value) || 0)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
