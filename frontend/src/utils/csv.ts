/**
 * Generic client-side CSV export — builds a CSV from whatever a panel
 * already has loaded from its queries and triggers a browser download. No
 * backend endpoint needed.
 *
 * Analytics panels show several distinct tables/charts at once (e.g.
 * FinancialPanel: Payment Status Summary + Collections by Method +
 * Outstanding Dues + Tax Summary). `downloadCsvSections` writes ALL of them
 * into one CSV, each under its own titled section, so "Export" always
 * produces the complete picture the panel is showing — not just whichever
 * single table happened to be picked. `downloadCsv` is a thin single-section
 * wrapper for the few places that only ever have one table.
 */

export interface CsvSection {
  title: string;
  rows: Record<string, unknown>[];
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sectionToLines(section: CsvSection): string[] {
  const lines: string[] = [`# ${section.title}`];
  if (section.rows.length === 0) {
    lines.push('No data for this period');
    return lines;
  }
  const headers = Object.keys(section.rows[0]);
  lines.push(headers.join(','));
  for (const row of section.rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(','));
  }
  return lines;
}

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Export several titled tables into one CSV file, one after another. */
export function downloadCsvSections(filename: string, sections: CsvSection[]): void {
  const content = sections.map(sectionToLines).map((lines) => lines.join('\n')).join('\n\n');
  triggerDownload(filename, content);
}

/** Export a single flat table — a thin wrapper around downloadCsvSections. */
export function downloadCsv<T extends object>(filename: string, rows: T[], title = 'Data'): void {
  downloadCsvSections(filename, [{ title, rows: rows as unknown as Record<string, unknown>[] }]);
}
