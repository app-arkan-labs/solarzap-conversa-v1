# Next Steps F2/F3

## F2 - Evolucao do modelo (sem implementar neste ciclo)

1. Ajustar `diasMes` para `30.4375` no dimensionamento e revisar impacto em potencia/valor.
2. Introduzir perfis sazonais por regiao/UF (substituir perfil unico nacional).
3. Incluir custo anual de O&M no fluxo de caixa e refletir no ROI/payback.
4. Aplicar degradacao de geracao para todos os cenarios que exibem serie de longo prazo.
5. Melhorar transparencia no PDF:
   - exibir premissas usadas (tarifa, degradacao, reajuste, horizonte, perfil sazonal)
   - exibir fonte da irradiancia/perfil e data da referencia

## F3 - Quebra do monolito de PDF

1. Extrair `generateProposalPDF.ts` em modulos por pagina/bloco:
   - `pdfPages/cover.ts`
   - `pdfPages/financialAnalysis.ts`
   - `pdfPages/technical.ts`
   - `pdfPages/financing.ts`
   - `pdfPages/closing.ts`
2. Extrair helpers compartilhados:
   - cabecalho/rodape
   - tipografia/cores
   - formatacao de moeda e numeros
3. Reduzir duplicacao entre proposta comercial e roteiro do vendedor com blocos reutilizaveis.
4. Manter testes golden por pagina e um golden end-to-end consolidado.
