# Plano Final Corretivo - Planilha de Acoes (2026-03-27)

## Objetivo
Entregar a versao final da visao de Acoes em Conversas com:
- alinhamento consistente entre cabecalho e linhas da planilha;
- nenhum botao/campo escapando da celula;
- seletor de vendedor funcionando no modo Acoes;
- filtros visiveis ao lado direito de "Proxima acao";
- validacao por iteracao em navegador antes do deploy final.

## Escopo Desta Rodada
1. Alinhamento do cabecalho da planilha com o grid de linhas.
2. Contencao de overflow horizontal em campos/botoes.
3. Reativacao do seletor de vendedor (lead scope) no modo Acoes.
4. Inclusao de botoes de filtro na barra de "Proxima acao" (lado direito) com popover de etapa/origem.
5. Validacao funcional via navegador:
- abrir modo Acoes;
- confirmar filtros visiveis;
- confirmar troca de vendedor;
- confirmar integridade visual de colunas.

## Criterios de Aceite
- Cabecalho e linhas da planilha alinhados no desktop (1366px e acima).
- Botao "Salvar" e demais controles sem corte visual.
- Seletor de vendedor com opcoes e aplicacao de escopo no modo Acoes.
- Botao "Filtros" visivel ao lado direito da barra de "Proxima acao".
- Popover de filtros abrindo com selecao de etapa e origem.
- Build e typecheck sem erro.

## Estrategia de Validacao
- Rodar `npm run typecheck`.
- Rodar `npm run build`.
- Validar em navegador com script Playwright local na build de preview.
- So depois publicar para VPS.

## Evidencias Locais
- `_deploy_tmp/local_final_iteration_actions.png`
- `_deploy_tmp/local_final_iteration_filters_open.png`
- `_deploy_tmp/local_final_iteration_scope_filters_interaction.png`

