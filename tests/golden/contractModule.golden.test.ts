// @vitest-environment jsdom
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSolarPrimeMockContract } from '@/modules/contracts/lib/mock';
import { renderContractDocument } from '@/modules/contracts/lib/templateEngine';
import { generateContractPdfArrayBuffer } from '@/modules/contracts/lib/pdf';

describe('contract module golden artifact', () => {
  it('generates the Solar Prime contract artifacts', () => {
    const values = createSolarPrimeMockContract();
    const renderResult = renderContractDocument(values);
    const pdfBuffer = generateContractPdfArrayBuffer(renderResult, {
      contractNumber: values.internalMetadata.contractNumber,
      companyName: values.legalData.contratante.nomeFantasia,
    });

    const artifactDir = join(process.cwd(), 'artifacts', 'contracts');
    const pdfDir = join(process.cwd(), 'output', 'pdf');
    mkdirSync(artifactDir, { recursive: true });
    mkdirSync(pdfDir, { recursive: true });

    const standaloneHtml = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Solar Prime - Contrato de Teste</title>
    <style>
      body { margin: 0; background: #f8fafc; color: #0f172a; font-family: "Segoe UI", Arial, sans-serif; }
      article { max-width: 880px; margin: 40px auto; padding: 48px; border: 1px solid #e2e8f0; border-radius: 28px; background: #ffffff; box-shadow: 0 30px 80px -50px rgba(15, 23, 42, 0.35); }
      h1, h2, h3 { color: #0f172a; }
      h1 { font-size: 28px; margin: 32px 0 16px; }
      h2 { font-size: 22px; margin: 28px 0 12px; }
      h3 { font-size: 16px; margin: 24px 0 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #334155; }
      p, li, blockquote { font-size: 15px; line-height: 1.75; color: #334155; }
      code { background: #f1f5f9; padding: 2px 6px; border-radius: 6px; }
      blockquote { border: 1px solid #fde68a; background: #fffbeb; padding: 12px 16px; border-radius: 16px; }
      hr { border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0; }
    </style>
  </head>
  <body>${renderResult.html}</body>
</html>`;

    writeFileSync(
      join(artifactDir, 'solar-prime-contract-render.html'),
      standaloneHtml,
      'utf8',
    );
    writeFileSync(
      join(artifactDir, 'solar-prime-contract-render.md'),
      renderResult.markdown,
      'utf8',
    );
    writeFileSync(
      join(artifactDir, 'solar-prime-contract-draft.json'),
      JSON.stringify(
        {
          legalData: values.legalData,
          internalMetadata: values.internalMetadata,
          commercialSummary: renderResult.commercialSummary,
          includedAnnexes: renderResult.includedAnnexes,
          placeholders: renderResult.placeholders,
        },
        null,
        2,
      ),
      'utf8',
    );
    writeFileSync(
      join(pdfDir, 'solar-prime-contrato-teste.pdf'),
      Buffer.from(pdfBuffer),
    );

    expect(renderResult.html).toContain('Solar Prime Energia Ltda');
    expect(renderResult.markdown).toContain('reuniao extra de coleta completa');
    expect(pdfBuffer.byteLength).toBeGreaterThan(2000);
  });
});
