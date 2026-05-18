"use client";
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-lg border border-slate-900 bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
    >
      Print / Save as PDF
    </button>
  );
}
