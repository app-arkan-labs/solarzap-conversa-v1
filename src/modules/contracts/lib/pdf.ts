import { jsPDF } from 'jspdf';
import type { ContractRenderBlock, ContractRenderResult } from './domain';

type CursorState = {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  cursorY: number;
};

const createPdfDocument = () => new jsPDF({ unit: 'pt', format: 'a4' });

const ensureSpace = (state: CursorState, height: number) => {
  if (state.cursorY + height <= state.pageHeight - state.marginBottom) return;
  state.doc.addPage();
  state.cursorY = state.marginTop;
};

const writeWrappedText = (
  state: CursorState,
  text: string,
  options: {
    fontSize: number;
    lineHeight: number;
    indent?: number;
    color?: string;
    fontStyle?: 'normal' | 'bold';
  },
) => {
  const contentWidth = state.pageWidth - state.marginX * 2 - (options.indent || 0);
  state.doc.setFont('helvetica', options.fontStyle || 'normal');
  state.doc.setFontSize(options.fontSize);
  state.doc.setTextColor(options.color || '#334155');
  const lines = state.doc.splitTextToSize(text, contentWidth);
  const totalHeight = lines.length * options.lineHeight;
  ensureSpace(state, totalHeight);
  state.doc.text(lines, state.marginX + (options.indent || 0), state.cursorY);
  state.cursorY += totalHeight;
};

const renderBlock = (state: CursorState, block: ContractRenderBlock) => {
  switch (block.type) {
    case 'heading_1':
      state.cursorY += 10;
      writeWrappedText(state, block.content || '', {
        fontSize: 16,
        lineHeight: 22,
        color: '#0f172a',
        fontStyle: 'bold',
      });
      state.cursorY += 8;
      return;
    case 'heading_2':
      state.cursorY += 6;
      writeWrappedText(state, block.content || '', {
        fontSize: 13,
        lineHeight: 18,
        color: '#0f172a',
        fontStyle: 'bold',
      });
      state.cursorY += 6;
      return;
    case 'heading_3':
      state.cursorY += 4;
      writeWrappedText(state, block.content || '', {
        fontSize: 11,
        lineHeight: 16,
        color: '#334155',
        fontStyle: 'bold',
      });
      state.cursorY += 4;
      return;
    case 'blockquote':
      ensureSpace(state, 44);
      state.doc.setDrawColor('#f59e0b');
      state.doc.setFillColor('#fff7ed');
      state.doc.roundedRect(
        state.marginX,
        state.cursorY - 12,
        state.pageWidth - state.marginX * 2,
        34,
        10,
        10,
        'FD',
      );
      state.cursorY += 2;
      writeWrappedText(state, block.content || '', {
        fontSize: 10.5,
        lineHeight: 15,
        color: '#9a3412',
        indent: 12,
      });
      state.cursorY += 12;
      return;
    case 'unordered_list':
      (block.items || []).forEach((item) => {
        writeWrappedText(state, `- ${item}`, {
          fontSize: 10.5,
          lineHeight: 15,
          color: '#334155',
          indent: 4,
        });
        state.cursorY += 2;
      });
      state.cursorY += 4;
      return;
    case 'ordered_list':
      (block.items || []).forEach((item, index) => {
        writeWrappedText(state, `${index + 1}. ${item}`, {
          fontSize: 10.5,
          lineHeight: 15,
          color: '#334155',
          indent: 4,
        });
        state.cursorY += 2;
      });
      state.cursorY += 4;
      return;
    case 'divider':
      ensureSpace(state, 16);
      state.doc.setDrawColor('#cbd5e1');
      state.doc.line(
        state.marginX,
        state.cursorY,
        state.pageWidth - state.marginX,
        state.cursorY,
      );
      state.cursorY += 16;
      return;
    case 'paragraph':
    default:
      writeWrappedText(state, block.content || '', {
        fontSize: 10.5,
        lineHeight: 15,
        color: '#334155',
      });
      state.cursorY += 8;
  }
};

const stampFooter = (doc: jsPDF, contractNumber: string) => {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#64748b');
    doc.text(
      `${contractNumber} | Pagina ${page} de ${pages}`,
      40,
      doc.internal.pageSize.getHeight() - 20,
    );
  }
};

export const generateContractPdfDocument = (
  renderResult: ContractRenderResult,
  options: { contractNumber: string; companyName: string },
) => {
  const doc = createPdfDocument();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const state: CursorState = {
    doc,
    pageWidth,
    pageHeight,
    marginX: 40,
    marginTop: 48,
    marginBottom: 40,
    cursorY: 48,
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor('#0f172a');
  doc.text('SolarZap - Contrato Comercial', state.marginX, state.cursorY);
  state.cursorY += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#475569');
  doc.text(
    `${options.companyName} | ${options.contractNumber}`,
    state.marginX,
    state.cursorY,
  );
  state.cursorY += 22;

  renderResult.blocks.forEach((block) => renderBlock(state, block));
  stampFooter(doc, options.contractNumber);

  return doc;
};

export const generateContractPdfArrayBuffer = (
  renderResult: ContractRenderResult,
  options: { contractNumber: string; companyName: string },
) =>
  generateContractPdfDocument(renderResult, options).output(
    'arraybuffer',
  ) as ArrayBuffer;

export const generateContractPdfBlob = (
  renderResult: ContractRenderResult,
  options: { contractNumber: string; companyName: string },
) =>
  new Blob([generateContractPdfArrayBuffer(renderResult, options)], {
    type: 'application/pdf',
  });
