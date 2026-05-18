import clsx from "clsx";
import type { ReactNode } from "react";

export type RowTone = "default" | "warning" | "exceeded" | "success";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
};

const ROW_TONE: Record<RowTone, string> = {
  default: "",
  warning: "bg-status-warning/[0.04] hover:bg-status-warning/[0.08]",
  exceeded: "bg-status-exceeded/[0.05] hover:bg-status-exceeded/[0.10]",
  success: "bg-status-normal/[0.04] hover:bg-status-normal/[0.08]",
};

export function DataTable<T>({
  columns,
  rows,
  empty = "No records.",
  rowKey,
  rowTone,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: ReactNode;
  rowKey: (row: T, idx: number) => string;
  rowTone?: (row: T) => RowTone;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle/70 text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                className={clsx(
                  "px-3 py-2 font-mono text-caps text-text-muted",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                  c.className
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center font-sans text-body-md text-text-muted"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => {
              const tone = rowTone?.(row) ?? "default";
              return (
                <tr
                  key={rowKey(row, idx)}
                  className={clsx(
                    "border-b border-border-subtle/40 transition-colors last:border-b-0",
                    tone === "default" && "hover:bg-slate-900/40",
                    ROW_TONE[tone]
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={clsx(
                        "px-3 py-3 align-middle font-sans text-body-md text-on-surface",
                        c.align === "right" && "text-right tabular-nums font-mono text-data",
                        c.align === "center" && "text-center",
                        c.className
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
