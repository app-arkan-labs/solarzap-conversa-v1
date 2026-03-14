import * as XLSX from 'xlsx';

export interface ImportedContactRow {
  name: string;
  phone: string;
  email?: string;
}

export interface ParsedContactsResult {
  fileName: string;
  contacts: ImportedContactRow[];
  totalRows: number;
  invalidRows: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

const normalizePhone = (value: unknown): string => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
};

const normalizeHeader = (value: unknown): string =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const findHeaderIndex = (headers: string[], candidates: string[]): number => {
  const normalizedCandidates = candidates.map((candidate) => normalizeHeader(candidate));
  return headers.findIndex((header) => {
    const normalizedHeader = normalizeHeader(header);
    return normalizedCandidates.some((candidate) =>
      normalizedHeader === candidate ||
      normalizedHeader.includes(candidate) ||
      candidate.includes(normalizedHeader),
    );
  });
};

const readWorkbookRows = (binaryData: string): string[][] => {
  const workbook = XLSX.read(binaryData, { type: 'binary' });
  const firstSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
};

const parseRows = (rows: string[][]): { contacts: ImportedContactRow[]; invalidRows: number } => {
  if (rows.length < 2) {
    throw new Error('O arquivo precisa ter cabeçalho e ao menos uma linha de dados');
  }

  const headers = rows[0].map((header) => String(header || '').trim());
  const dataRows = rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || '').trim().length > 0));

  if (dataRows.length > MAX_ROWS) {
    throw new Error(`O limite por arquivo é de ${MAX_ROWS} linhas`);
  }

  const nameIndex = findHeaderIndex(headers, ['nome', 'name', 'cliente', 'contato']);
  const phoneIndex = findHeaderIndex(headers, ['telefone', 'phone', 'celular', 'whatsapp', 'fone']);
  const emailIndex = findHeaderIndex(headers, ['email', 'e-mail', 'mail']);

  if (nameIndex < 0 || phoneIndex < 0) {
    throw new Error('Não foi possível detectar as colunas de nome e telefone');
  }

  const parsed = dataRows.map((row) => {
    const name = String(row[nameIndex] || '').trim();
    const phone = normalizePhone(row[phoneIndex]);
    const email = emailIndex >= 0 ? String(row[emailIndex] || '').trim() : '';
    return {
      name,
      phone,
      email: email || undefined,
    };
  });

  const valid = parsed.filter((row) => row.name.length > 0 && row.phone.length > 0);

  const dedupe = new Map<string, ImportedContactRow>();
  valid.forEach((row) => {
    dedupe.set(row.phone, row);
  });

  return {
    contacts: Array.from(dedupe.values()),
    invalidRows: dataRows.length - valid.length,
  };
};

const readAsBinaryString = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      resolve(String(event.target?.result || ''));
    };
    reader.onerror = () => {
      reject(new Error('Não foi possível ler o arquivo'));
    };
    reader.readAsBinaryString(file);
  });

export async function parseContactsFile(file: File): Promise<ParsedContactsResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Arquivo acima do limite de 5MB (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
  }

  const binaryData = await readAsBinaryString(file);
  const rows = readWorkbookRows(binaryData);
  const { contacts, invalidRows } = parseRows(rows);

  return {
    fileName: file.name,
    contacts,
    totalRows: rows.length - 1,
    invalidRows,
  };
}



