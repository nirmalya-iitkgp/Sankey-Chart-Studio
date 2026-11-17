import React, { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { FileSpreadsheet, Upload, X, AlertCircle, Check } from 'lucide-react';
import { FlowRow } from '../types';

interface BulkPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyRows: (rows: Omit<FlowRow, 'id'>[], mode: 'replace' | 'append') => void;
}

interface ParseResult {
  validRows: Omit<FlowRow, 'id'>[];
  skippedLines: number;
  headerSkipped: boolean;
}

function parseRawText(rawText: string): ParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { validRows: [], skippedLines: 0, headerSkipped: false };
  }

  const parsed = Papa.parse<string[]>(trimmed, {
    skipEmptyLines: true,
    delimitersToGuess: ['\t', ',', ';', '|'],
  });

  const rows = parsed.data;
  if (!rows || rows.length === 0) {
    return { validRows: [], skippedLines: 0, headerSkipped: false };
  }

  let startIndex = 0;
  let headerSkipped = false;

  // Detect optional header row if 3rd column is non-numeric
  if (rows.length > 0 && rows[0].length >= 3) {
    const col3 = (rows[0][2] || '').replace(/[$,₹%\s,]/g, '');
    if (col3 === '' || Number.isNaN(Number(col3))) {
      startIndex = 1;
      headerSkipped = true;
    }
  }

  const validRows: Omit<FlowRow, 'id'>[] = [];
  let skippedLines = 0;

  for (let i = startIndex; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.length < 3) {
      skippedLines++;
      continue;
    }
    const source = (cols[0] || '').trim();
    const target = (cols[1] || '').trim();
    const rawNum = (cols[2] || '').replace(/[$,₹\s]/g, '').replace(/,/g, '');
    const value = Number(rawNum);

    if (!source || !target || !Number.isFinite(value) || value <= 0) {
      skippedLines++;
      continue;
    }

    validRows.push({ source, target, value });
  }

  return { validRows, skippedLines, headerSkipped };
}

export const BulkPasteModal: React.FC<BulkPasteModalProps> = ({
  isOpen,
  onClose,
  onApplyRows,
}) => {
  const [text, setText] = useState(
    'Revenue\tGross Profit\t85000\nRevenue\tCOGS\t25000\nGross Profit\tOperating Income\t31000\nGross Profit\tR&D\t28000\nGross Profit\tSales & Marketing\t26000'
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => parseRawText(text), [text]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = typeof ev.target?.result === 'string' ? ev.target.result : '';
      setText(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-paste-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-4 w-4 text-slate-700" />
            <h2 id="bulk-paste-title" className="font-display text-base font-semibold text-slate-900">
              Bulk Paste or Upload CSV / TSV
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-relaxed text-slate-600">
              Paste rows directly from Excel or Google Sheets (<span className="font-mono text-slate-800">Source &rarr; Target &rarr; Value</span>), or upload a <span className="font-mono text-slate-800">.csv</span> / <span className="font-mono text-slate-800">.tsv</span> file.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload File
            </button>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            spellCheck={false}
            placeholder={'Source\tTarget\tValue\nEnterprise\tTotal Revenue\t74000'}
            className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-3 font-mono text-xs leading-relaxed text-slate-800 outline-none transition-colors focus:border-slate-400 focus:bg-white"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex items-center gap-2 tabular-nums">
              {preview.validRows.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <Check className="h-3.5 w-3.5" />
                  {preview.validRows.length} valid flow{preview.validRows.length === 1 ? '' : 's'} detected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  No valid 3-column rows detected yet
                </span>
              )}
              {preview.headerSkipped && (
                <>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>Header row auto-skipped</span>
                </>
              )}
              {preview.skippedLines > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="text-amber-700">{preview.skippedLines} invalid line(s) ignored</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50/60 px-5 py-3.5 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900 whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={preview.validRows.length === 0}
            onClick={() => {
              onApplyRows(preview.validRows, 'append');
              onClose();
            }}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
          >
            Append Rows
          </button>
          <button
            type="button"
            disabled={preview.validRows.length === 0}
            onClick={() => {
              onApplyRows(preview.validRows, 'replace');
              onClose();
            }}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
          >
            Replace Table
          </button>
        </div>
      </div>
    </div>
  );
};
