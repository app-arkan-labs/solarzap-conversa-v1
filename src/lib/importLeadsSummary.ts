export type ImportLeadAction = 'inserted' | 'updated' | 'failed';

export interface ImportLeadRpcRow {
  row_index: number;
  action: ImportLeadAction | string;
  lead_id: number | null;
  error: string | null;
}

export interface ImportLeadFailure {
  row_index: number;
  message: string;
}

export interface ImportLeadsSummary {
  inserted_count: number;
  updated_count: number;
  failed_count: number;
  failures: ImportLeadFailure[];
}

export const buildImportLeadsSummary = (rows: ImportLeadRpcRow[] | null | undefined): ImportLeadsSummary => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const failures = safeRows
    .filter((row) => String(row?.action) === 'failed')
    .map((row) => ({
      row_index: Number(row.row_index || 0),
      message: String(row.error || 'Erro desconhecido'),
    }));

  return {
    inserted_count: safeRows.filter((row) => String(row?.action) === 'inserted').length,
    updated_count: safeRows.filter((row) => String(row?.action) === 'updated').length,
    failed_count: failures.length,
    failures,
  };
};

