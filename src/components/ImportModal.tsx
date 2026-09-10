import { useState, type ChangeEvent } from "react";

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
}

interface ImportModalProps {
  title: string;
  fields: ImportField[];
  onImport: (rows: Record<string, string>[]) => Promise<{ success: number; skipped: number }>;
  onClose: () => void;
}

function guessColumn(header: string, field: ImportField): boolean {
  const h = header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const key = field.key.toLowerCase();
  const label = field.label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return h === key || h === label || h.includes(label) || label.includes(h);
}

export default function ImportModal({ title, fields, onImport, onClose }: ImportModalProps) {
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: number; skipped: number } | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
      if (data.length < 1) throw new Error("Fichier vide");

      const fileHeaders = (data[0] as string[]).map((h) => String(h ?? "").trim());
      const dataRows = (data.slice(1) as string[][]).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));

      const autoMapping: Record<string, string> = {};
      for (const field of fields) {
        const match = fileHeaders.find((h) => guessColumn(h, field));
        if (match) autoMapping[field.key] = match;
      }

      setHeaders(fileHeaders);
      setRows(dataRows);
      setMapping(autoMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de lire ce fichier");
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (!headers) return;
    const missingRequired = fields.filter((f) => f.required && !mapping[f.key]);
    if (missingRequired.length > 0) {
      setError(`Associe une colonne pour : ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }
    setError(null);
    setImporting(true);
    try {
      const mappedRows = rows.map((row) => {
        const record: Record<string, string> = {};
        for (const field of fields) {
          const col = mapping[field.key];
          const colIndex = col ? headers.indexOf(col) : -1;
          record[field.key] = colIndex >= 0 ? String(row[colIndex] ?? "").trim() : "";
        }
        return record;
      });
      const res = await onImport(mappedRows);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'import");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6">
        <h2 className="text-lg font-bold text-navy">{title}</h2>

        {!headers && (
          <>
            <p className="mt-1 text-sm text-gray">Fichier Excel (.xlsx) ou CSV.</p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={parsing}
              onChange={handleFile}
              className="mt-4 text-sm"
            />
            {parsing && <p className="mt-2 text-sm text-gray">Lecture du fichier…</p>}
          </>
        )}

        {headers && !result && (
          <>
            <p className="mt-1 text-sm text-gray">
              {rows.length} ligne(s) détectée(s). Associe chaque champ à la bonne colonne de ton fichier.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {fields.map((field) => (
                <div key={field.key} className="flex items-center gap-3">
                  <label className="w-40 shrink-0 text-sm text-navy">
                    {field.label}
                    {field.required && <span className="text-red-600"> *</span>}
                  </label>
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="flex-1 rounded-md border border-line px-2 py-1.5 text-sm"
                  >
                    <option value="">Ne pas importer</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
              >
                {importing ? "Import en cours…" : `Importer ${rows.length} ligne(s)`}
              </button>
              <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-gray">
                Annuler
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <p className="mt-4 text-sm text-navy">
              <span className="font-semibold text-emerald-600">{result.success} ligne(s) importée(s)</span>
              {result.skipped > 0 && <span className="text-gray"> — {result.skipped} ignorée(s) (champs requis manquants)</span>}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy"
            >
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
