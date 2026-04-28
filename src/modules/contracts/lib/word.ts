import type { ContractRenderBlock, ContractRenderResult } from './domain';

type ContractWordOptions = {
  contractNumber: string;
  companyName?: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderInlineMarkdown = (value: string) =>
  escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

const renderBlock = (block: ContractRenderBlock) => {
  switch (block.type) {
    case 'heading_1':
      return `<h1>${renderInlineMarkdown(block.content || '')}</h1>`;
    case 'heading_2':
      return `<h2>${renderInlineMarkdown(block.content || '')}</h2>`;
    case 'heading_3':
      return `<h3>${renderInlineMarkdown(block.content || '')}</h3>`;
    case 'blockquote':
      return `<blockquote>${renderInlineMarkdown(block.content || '')}</blockquote>`;
    case 'unordered_list':
      return `<ul>${(block.items || [])
        .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
        .join('')}</ul>`;
    case 'ordered_list':
      return `<ol>${(block.items || [])
        .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
        .join('')}</ol>`;
    case 'divider':
      return '<hr />';
    case 'paragraph':
    default:
      return `<p>${renderInlineMarkdown(block.content || '')}</p>`;
  }
};

export const generateContractWordBlob = (
  renderResult: ContractRenderResult,
  options: ContractWordOptions,
) => {
  const title = [
    'Contrato SolarZap',
    options.contractNumber,
    options.companyName || '',
  ]
    .filter(Boolean)
    .join(' - ');

  const html = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page Section1 { size: 595.3pt 841.9pt; margin: 56.7pt 56.7pt 56.7pt 56.7pt; }
    div.Section1 { page: Section1; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11pt; line-height: 1.5; }
    h1 { font-size: 18pt; margin: 22pt 0 10pt; color: #0f172a; }
    h2 { font-size: 15pt; margin: 18pt 0 8pt; color: #0f172a; }
    h3 { font-size: 11pt; margin: 14pt 0 6pt; color: #334155; text-transform: uppercase; }
    p { margin: 0 0 9pt; }
    ul, ol { margin: 0 0 10pt 20pt; padding: 0; }
    li { margin: 0 0 5pt; }
    blockquote { margin: 10pt 0; padding: 8pt 10pt; border-left: 4pt solid #f59e0b; background: #fff7ed; color: #78350f; }
    code { font-family: Consolas, monospace; background: #f1f5f9; }
    hr { border: 0; border-top: 1pt solid #cbd5e1; margin: 16pt 0; }
    .meta { color: #64748b; font-size: 9pt; margin-bottom: 18pt; }
  </style>
</head>
<body>
  <div class="Section1">
    <p class="meta">${escapeHtml(options.contractNumber)}${options.companyName ? ` - ${escapeHtml(options.companyName)}` : ''}</p>
    ${renderResult.blocks.map(renderBlock).join('\n')}
  </div>
</body>
</html>`;

  return new Blob(['\ufeff', html], {
    type: 'application/msword;charset=utf-8',
  });
};
