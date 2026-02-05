import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Contact } from '@/types/solarzap';
import solarzapLogo from '@/assets/solarzap-logo.png';

interface ProposalPDFData {
  contact: Contact;
  consumoMensal: number;
  potenciaSistema: number;
  quantidadePaineis: number;
  valorTotal: number;
  economiaAnual: number;
  paybackMeses: number;
  garantiaAnos: number;
  observacoes?: string;
}

export function generateProposalPDF(data: ProposalPDFData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = 20;

  // Helper functions
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-BR').format(value);
  };

  const drawLine = (y: number, color = '#22c55e') => {
    doc.setDrawColor(color);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
  };

  // ===== HEADER WITH LOGO =====
  // Green header background
  doc.setFillColor(34, 197, 94); // Green-500
  doc.rect(0, 0, pageWidth, 55, 'F');

  // Add logo image
  try {
    doc.addImage(solarzapLogo, 'PNG', margin, 8, 40, 40);
  } catch (e) {
    // Fallback to text if image fails
    console.log('Logo not loaded, using text fallback');
  }

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('SolarZap', margin + 48, 28);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Energia Solar | Proposta Comercial', margin + 48, 40);

  // Proposal number and date
  doc.setFontSize(10);
  const proposalNumber = `PROP-${Date.now().toString().slice(-8)}`;
  const today = new Date().toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });
  doc.text(`Proposta: ${proposalNumber}`, pageWidth - margin - 60, 25);
  doc.text(today, pageWidth - margin - 60, 35);

  yPos = 70;

  // ===== CLIENT INFO =====
  doc.setTextColor(34, 197, 94);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO CLIENTE', margin, yPos);
  yPos += 8;
  drawLine(yPos);
  yPos += 10;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  const clientInfo = [
    ['Nome:', data.contact.name],
    ['Empresa:', data.contact.company || '-'],
    ['Telefone:', data.contact.phone],
    ['E-mail:', data.contact.email || '-'],
    ['Endereço:', data.contact.address || '-'],
    ['Cidade:', data.contact.city || '-'],
  ];

  clientInfo.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), margin + 35, yPos);
    yPos += 7;
  });

  yPos += 10;

  // ===== SYSTEM DETAILS =====
  doc.setTextColor(34, 197, 94);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('DIMENSIONAMENTO DO SISTEMA', margin, yPos);
  yPos += 8;
  drawLine(yPos);
  yPos += 5;

  // System specs table
  autoTable(doc, {
    startY: yPos,
    head: [['Especificação', 'Valor']],
    body: [
      ['Consumo Médio Mensal', `${formatNumber(data.consumoMensal)} kWh/mês`],
      ['Potência do Sistema', `${data.potenciaSistema.toFixed(2)} kWp`],
      ['Quantidade de Painéis', `${data.quantidadePaineis} unidades`],
      ['Tipo de Painel', 'Monocristalino 550W'],
      ['Inversor', 'On-Grid de alta eficiência'],
      ['Garantia', `${data.garantiaAnos} anos`],
    ],
    theme: 'striped',
    headStyles: {
      fillColor: [34, 197, 94],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [240, 253, 244],
    },
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 10,
      cellPadding: 5,
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // ===== FINANCIAL ANALYSIS =====
  doc.setTextColor(34, 197, 94);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('ANÁLISE FINANCEIRA', margin, yPos);
  yPos += 8;
  drawLine(yPos);
  yPos += 5;

  // Financial table
  autoTable(doc, {
    startY: yPos,
    head: [['Descrição', 'Valor']],
    body: [
      ['Investimento Total', formatCurrency(data.valorTotal)],
      ['Economia Anual Estimada', formatCurrency(data.economiaAnual)],
      ['Economia Mensal Estimada', formatCurrency(data.economiaAnual / 12)],
      ['Tempo de Retorno (Payback)', `${data.paybackMeses} meses`],
      ['Economia em 25 anos', formatCurrency(data.economiaAnual * 25)],
    ],
    theme: 'striped',
    headStyles: {
      fillColor: [34, 197, 94],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [240, 253, 244],
    },
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 10,
      cellPadding: 5,
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // ===== HIGHLIGHTS BOX =====
  // Green highlight box for total value
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(34, 197, 94);
  doc.setLineWidth(1);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 35, 3, 3, 'FD');

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('INVESTIMENTO TOTAL', margin + 10, yPos + 15);

  doc.setTextColor(34, 197, 94);
  doc.setFontSize(24);
  doc.text(formatCurrency(data.valorTotal), margin + 10, yPos + 28);

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Retorno em ${data.paybackMeses} meses`, pageWidth - margin - 50, yPos + 22);

  yPos += 45;

  // ===== OBSERVATIONS =====
  if (data.observacoes) {
    doc.setTextColor(34, 197, 94);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVAÇÕES', margin, yPos);
    yPos += 8;
    drawLine(yPos);
    yPos += 8;

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const splitObs = doc.splitTextToSize(data.observacoes, pageWidth - 2 * margin);
    doc.text(splitObs, margin, yPos);
    yPos += splitObs.length * 5 + 10;
  }

  // ===== BENEFITS =====
  if (yPos < 220) {
    doc.setTextColor(34, 197, 94);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('BENEFÍCIOS DA ENERGIA SOLAR', margin, yPos);
    yPos += 8;
    drawLine(yPos);
    yPos += 10;

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const benefits = [
      '✓ Economia de até 95% na conta de luz',
      '✓ Valorização do imóvel em até 8%',
      '✓ Energia limpa e sustentável',
      '✓ Proteção contra aumentos na tarifa',
      '✓ Garantia de 25 anos nos painéis',
      '✓ Retorno do investimento garantido',
    ];

    benefits.forEach((benefit) => {
      doc.text(benefit, margin, yPos);
      yPos += 6;
    });
  }

  // ===== FOOTER =====
  const footerY = doc.internal.pageSize.getHeight() - 25;
  
  doc.setFillColor(245, 245, 245);
  doc.rect(0, footerY - 5, pageWidth, 30, 'F');

  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Proposta válida por 15 dias | Sujeita à análise técnica', pageWidth / 2, footerY + 5, { align: 'center' });
  doc.text('SolarZap - Transformando luz em economia', pageWidth / 2, footerY + 12, { align: 'center' });

  // ===== SAVE PDF =====
  const fileName = `Proposta_Solar_${data.contact.name.replace(/\s+/g, '_')}_${proposalNumber}.pdf`;
  doc.save(fileName);
}