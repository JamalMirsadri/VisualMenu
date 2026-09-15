import ExcelJS from 'exceljs';

export type ExportPeriod = 'day' | 'month' | 'year';
export type ExportFormat = 'csv' | 'xlsx';

export interface PeriodBounds {
  start: Date;
  end: Date;
  filenameDate: string;
}

export interface ExportRow {
  [key: string]: string | number | null | undefined;
}

function zonedParts(date: Date, timeZone: string): Record<string, number> {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  return map;
}

/**
 * Converts a wall-clock time (in the given timezone) into an absolute UTC Date.
 * `month1` is 1-based; `day` may overflow (e.g. 32) and is normalized by Date.UTC.
 */
function zonedToUtc(year: number, month1: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month1 - 1, day, 0, 0, 0));
  const parts = zonedParts(guess, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMs = asUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

/**
 * Resolves the [start, end) boundary (inclusive start, exclusive end) for a
 * Day / Month / Year export period using the restaurant's timezone.
 */
export function resolvePeriodBounds(
  period: ExportPeriod,
  dateValue: string | undefined,
  timeZone = 'UTC'
): PeriodBounds {
  const tz = timeZone || 'UTC';
  const value = (dateValue || '').trim();

  if (period === 'day') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) {
      const err: any = new Error("Day export requires a date in YYYY-MM-DD format.");
      err.statusCode = 400;
      err.errorCode = 'INVALID_EXPORT_DATE';
      throw err;
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return {
      start: zonedToUtc(y, mo, d, tz),
      end: zonedToUtc(y, mo, d + 1, tz),
      filenameDate: `${m[1]}-${m[2]}-${m[3]}`,
    };
  }

  if (period === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(value);
    if (!m) {
      const err: any = new Error("Month export requires a value in YYYY-MM format.");
      err.statusCode = 400;
      err.errorCode = 'INVALID_EXPORT_DATE';
      throw err;
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    return {
      start: zonedToUtc(y, mo, 1, tz),
      end: zonedToUtc(y, mo + 1, 1, tz),
      filenameDate: `${m[1]}-${m[2]}`,
    };
  }

  if (period === 'year') {
    const m = /^(\d{4})$/.exec(value);
    if (!m) {
      const err: any = new Error("Year export requires a value in YYYY format.");
      err.statusCode = 400;
      err.errorCode = 'INVALID_EXPORT_DATE';
      throw err;
    }
    const y = Number(m[1]);
    return {
      start: zonedToUtc(y, 1, 1, tz),
      end: zonedToUtc(y + 1, 1, 1, tz),
      filenameDate: `${m[1]}`,
    };
  }

  const err: any = new Error("Period must be one of: day, month, year.");
  err.statusCode = 400;
  err.errorCode = 'INVALID_EXPORT_PERIOD';
  throw err;
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Builds a UTF-8 CSV string (with BOM) from headers and rows. */
export function buildCsv(headers: string[], rows: ExportRow[]): string {
  const lines: string[] = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

/** Builds a real .xlsx workbook buffer with styled headers. */
export async function buildXlsx(
  headers: string[],
  rows: ExportRow[],
  sheetName = 'Export'
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = headers.map((h) => ({
    header: h,
    key: h,
    width: Math.max(h.length + 4, 16),
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
  headerRow.alignment = { vertical: 'middle' };

  for (const row of rows) {
    sheet.addRow(headers.map((h) => (row[h] === null || row[h] === undefined ? '' : row[h])));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
