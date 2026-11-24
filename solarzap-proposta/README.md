# SolarZap — Proposta comercial interativa

Redesign em HTML, CSS e JavaScript nativos da proposta PROP-FE9AE459. Abra `index.html` em um navegador moderno; não há dependências, instalação ou servidor obrigatório. Para desenvolvimento, opcionalmente rode `python -m http.server 8000` nesta pasta.

## Estrutura
- `index.html`: conteúdo e gráficos, organizados na sequência da proposta.
- `style.css`: identidade visual, layout responsivo, animações e estilos de impressão.
- `app.js`: animação de indicadores, barra de progresso, exploração do gráfico anual, seleção de pagamento, aceite via WhatsApp e impressão A4.
- `assets/`: logotipo e fotografias extraídos do PDF original. Os desenhos de equipamento são ilustrações SVG, não imagens oficiais.
- `build.py`: gera uma versão autônoma, com CSS, JS e imagens incorporados. Execute `python build.py` (ou informe o caminho de saída).

## Dados e integração
Este é um front-end demonstrativo, com os dados da proposta original já preenchidos. Não faz cálculos de dimensionamento, não se comunica com o backend do SolarZap nem coleta assinatura. O cliente escolhe a forma de pagamento e abre o WhatsApp com uma mensagem de aceite comercial gerada automaticamente, sem edição dentro da proposta. Configure `commercialWhatsApp` no `app.js` com o número da empresa (DDI + DDD + número, apenas dígitos). Sem esse número, abre o seletor de destinatário do WhatsApp. O envio final é confirmado pelo cliente no WhatsApp; o site não registra o aceite. Não use o telefone do cliente como destino. Para integrar ao gerador, substitua os dados da marca, cliente, tabelas, valores dos gráficos e mensagem pelos dados do sistema. O CSS de impressão A4 organiza a proposta em oito páginas (a última seção ocupa duas páginas impressas), com gráficos, condições, escolha de pagamento impressa e assinaturas. Use o botão Imprimir e, se necessário, habilite gráficos de fundo no diálogo do navegador.

Foram preservados os números do PDF: economia mensal comparativa de R$ 466,23 versus R$ 457,89 na análise financeira; projeção acumulada gráfica de R$ 137 mil versus R$ 124.728,71 na tabela financeira. A curva anual interativa é uma interpolação ilustrativa da linha original, não um novo cálculo financeiro. Confira os números e garantias na origem antes de usar comercialmente. O documento mantém as condições legais e comerciais da proposta de exemplo, sem verificação externa.

## V3
A análise financeira e as condições de pagamento foram reunidas na seção final. ROI e payback também foram deslocados para essa seção, evitando antecipar o investimento. As comparações das parcelas somam a conta residual estimada à parcela indicada no PDF.
