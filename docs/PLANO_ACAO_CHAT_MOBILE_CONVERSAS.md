# Plano de Acao: Chat Mobile na Aba de Conversas

Data: 2026-03-16
Ultima revisao: 2026-03-17
Status: validado em navegador e pronto para implementacao
Escopo: experiencia mobile do chat em Conversas, com foco em iPhone Safari e Android Chrome

## 1. Objetivo

Levar o chat mobile da aba de Conversas a um comportamento proximo do WhatsApp Business em tres frentes:

1. envio de fotos, videos e arquivos com seletor nativo e previsivel no mobile;
2. digitacao sem zoom involuntario, sem salto de layout e sem reposicionamento estranho ao abrir teclado;
3. gravacao de audio no modelo segurar para gravar, soltar para enviar e arrastar para cancelar, sem modal de selecao de dispositivos no mobile.

## 2. Base da Analise

### 2.1. Codigo inspecionado

- `src/components/solarzap/ChatArea.tsx`
- `src/hooks/domain/useChat.ts`
- `src/components/solarzap/SolarZapLayout.tsx`
- `src/components/solarzap/AudioDeviceModal.tsx`
- `src/components/ui/textarea.tsx`
- `src/hooks/useMobileViewport.ts`
- `src/index.css`
- `index.html`

### 2.2. Verificacao em navegador (validacao completa)

Sessao autenticada realizada com sucesso em `http://127.0.0.1:8081/` com viewport mobile emulado (matchMedia forçado para max-width: 1023px).

Login com a conta `rodrigosenafernandes@gmail.com` aprovado. Acesso completo ao produto liberado (billing bypass ativo). Navegacao pela aba Conversas e pelo chat com a conversa "Isabeli Soares" validados end-to-end.

#### Achados visuais confirmados

**1. Layout mobile da lista de conversas**
- Layout renderiza corretamente em modo mobile.
- Bottom tab bar presente com: Conversas, Pipelines, Calendario, Mais.
- Lista de conversas exibe preview de mensagem, timestamp, badge de contagem, tags de etapa e follow-up.
- Botao flutuante (+) visivel no canto inferior direito.

**2. Layout mobile do chat ativo**
- Ao selecionar uma conversa, a lista desaparece e o chat ocupa a tela inteira (comportamento correto mobile-first).
- Header exibe: botao voltar, avatar, nome do contato, indicador online, botao ligar, botao "Mais acoes".
- Bottom tab bar corretamente oculta quando o chat esta ativo.
- Composer renderiza na parte inferior: emoji, clip (anexo), textarea, microfone.
- Padding inferior com `pb-[max(0.75rem,env(safe-area-inset-bottom))]` esta aplicado.

**3. Textarea e zoom (CONFIRMADO)**
- Computed `font-size: 14px` (via classe `text-sm`).
- Em iPhone Safari, qualquer `<input>` ou `<textarea>` com font-size < 16px dispara zoom automatico ao focar.
- Classes do textarea: `text-sm leading-relaxed`, `min-h-[40px] max-h-32 resize-none`.
- Bug confirmado: zoom involuntario sera disparado em qualquer iPhone real.

**4. Viewport meta**
- `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`.
- Falta `maximum-scale=1` para prevencao complementar de zoom.

**5. Drawer de anexos (CONFIRMADO)**
- Clicar no clip abre drawer (vaul) com 3 opcoes: Documento, Foto, Video.
- O drawer abre com animacao suave de baixo para cima.
- Nao existe opcao "Tirar foto" separada de "Escolher foto".
- Nao existe opcao "Gravar video" separada de "Escolher video".
- Nenhum input usa atributo `capture` para acesso direto a camera.

**6. AudioDeviceModal (BUG CONFIRMADO)**
- Ao clicar no microfone, abre o modal "Configurar Audio" imediatamente.
- O modal exibe: "Selecione os dispositivos de audio que deseja usar para gravacao e reproducao."
- Mensagem de erro: "Nao foi possivel acessar os dispositivos de audio. Verifique as permissoes do navegador."
- Botoes "Cancelar" e "Confirmar e Gravar".
- Este modal e totalmente inadequado para mobile - celulares tem um unico microfone.
- O modal bloqueia o fluxo: o usuario nao consegue gravar sem interagir com ele primeiro.

**7. Emoji picker**
- Abre como popover posicionado absolutamente, nao como drawer.
- Em mobile, ocupa parcialmente a tela mas nao usa full-width.
- Categoria visivel na validacao: "Pessoas".
- Funcional mas nao otimizado para toque em tela pequena.

**8. Menu "Mais acoes"**
- Abre como drawer (vaul) com opcoes: IA da Instancia Pausada (toggle), Instancia WhatsApp (seletor), Ligar, Chamada de video, Pesquisar mensagens, Selecionar mensagens.
- UX adequada para mobile.

**9. Audio playback (BUG ENCONTRADO)**
- 6 mensagens de audio na conversa exibem fallback "Audio - Clique para abrir" com link externo.
- 0 players de audio inline renderizados.
- 0 waveforms renderizados.
- Console exibe multiplos erros: "Audio load error for URL: ...ogg".
- Os arquivos .ogg no bucket `chat-delivery` nao estao sendo carregados.
- A reproducao de audio recebido esta completamente quebrada nesta conversa.

**10. Mensagens de resposta e reacao**
- Cada mensagem exibe botoes "Responder" e "Reagir" ao hover/foco.
- Reacoes com emoji (ex: 😂) aparecem corretamente abaixo da mensagem.
- Imagens inline carregam e exibem corretamente.

#### Resumo da validacao

| Item                         | Status     | Gravidade |
|------------------------------|------------|-----------|
| Layout mobile geral          | OK         | —         |
| Lista de conversas           | OK         | —         |
| Transicao lista → chat       | OK         | —         |
| Bottom bar oculta no chat    | OK         | —         |
| Header do chat               | OK         | —         |
| Composer (layout)            | OK         | —         |
| Textarea font-size < 16px    | BUG        | Alta      |
| Viewport meta sem max-scale  | BUG        | Media     |
| Drawer de anexos             | Funcional  | Media     |
| Falta opcao camera nativa    | UX GAP     | Media     |
| AudioDeviceModal no mobile   | BUG        | Critica   |
| Audio playback inline        | BUG        | Alta      |
| Emoji picker mobile          | Funcional  | Baixa     |
| Menu acoes mobile            | OK         | —         |
| Safe-area-inset              | OK         | —         |

## 3. Diagnostico Atual

### 3.1. Upload de foto, video e arquivo no mobile

Implementacao atual em `ChatArea.tsx`:

- existe um unico `input type="file"` oculto e reutilizado para todos os tipos de anexo;
- o tipo e trocado dinamicamente por `accept` imediatamente antes do `click()`;
- no mobile, o usuario abre um `Drawer` e dali dispara o mesmo input oculto;
- o `handleFileChange` consome apenas `e.target.files?.[0]`;
- nao ha inputs separados para camera, galeria, video e documento;
- nao ha uso de `capture` para fluxos nativos de camera;
- nao ha estrategia especifica para Safari iOS.

Consequencias provaveis:

- seletor inconsistente no iPhone, especialmente quando um drawer fecha e um input oculto e clicado no mesmo gesto;
- experiencia pouco nativa;
- risco de o Safari abrir um fluxo de selecao pouco previsivel;
- impossibilidade de evoluir para multi-selecao ou fluxos distintos de camera versus galeria sem reescrever a base.

### 3.2. Zoom e salto de tela ao digitar

Implementacao atual:

- o `Textarea` base usa `text-sm`;
- o composer do chat tambem usa `text-sm`;
- em iPhone Safari, campos com fonte menor que `16px` costumam disparar zoom automatico ao focar;
- o layout mobile depende de `h-dvh`, `safe-area-inset-bottom` e flex layout, mas nao existe uma camada especifica para lidar com `visualViewport` e teclado virtual;
- nao existe sincronizacao explicita entre abertura do teclado e reposicionamento do composer.

Consequencias provaveis:

- zoom involuntario ao focar o campo de mensagem;
- oscilacao de altura do viewport quando o teclado abre;
- scroll inesperado, sensacao de tela aproximando e voltando sozinha;
- degradação maior no iPhone do que no desktop ou Android.

### 3.3. Gravacao de audio no mobile

Implementacao atual:

- o fluxo de audio passa por `AudioDeviceModal` na primeira utilizacao;
- o modal lista entrada e saida de audio;
- no mobile isso nao faz sentido como UX primaria;
- o botao usa `onPointerDown` para iniciar e `onPointerUp` ou `onPointerLeave` para parar;
- `onstop` do `MediaRecorder` envia o audio automaticamente se houver chunks;
- nao existe estado explicito de cancelamento por gesto horizontal;
- nao existe distincao entre desktop e mobile para politica de dispositivos;
- nao existe maquina de estados para segurar, cancelar, enviar e falhar com seguranca.

Consequencias provaveis:

- o primeiro toque abre configuracao de dispositivos em vez de gravar;
- o gravador pode parar de forma confusa ou tardia;
- o comportamento de `pointerleave` no mobile pode encerrar a gravacao em momentos errados;
- nao ha gesto equivalente ao WhatsApp de arrastar para cancelar;
- o ciclo de vida do recorder fica dificil de prever e depurar.

### 3.4. Reproducao de audio recebido

Na validacao no navegador, nenhuma das 6 mensagens de audio na conversa renderizou player inline. Todas caem em fallback de link externo ("Audio - Clique para abrir").

O console mostra multiplos erros de carregamento para URLs `.ogg` no bucket `chat-delivery`.

Possiveis causas:

- bucket `chat-delivery` com politica de CORS ou content-type que impede carregamento via `<audio>`;
- arquivos `.ogg` podem nao estar com MIME type correto no storage;
- o componente de player pode depender de signed URLs que expiraram;
- Safari iOS nao suporta nativamente `audio/ogg`, exigindo fallback para `audio/mp4` ou `audio/webm`.

Impacto: alta prioridade. Se o usuario nao consegue ouvir audios recebidos, a funcionalidade de conversa por audio fica inutilizavel.

### 3.5. Limitacao estrutural do detector mobile

`useMobileViewport.ts` hoje responde apenas a `matchMedia('(max-width: 1023px)')`.

Isso e util para layout, mas insuficiente para tratar:

- teclado virtual;
- area util quando o teclado esta aberto;
- comportamento do Safari com `visualViewport`;
- diferenca entre mobile touch real e viewport reduzido em desktop.

## 4. Objetivo de UX

O comportamento alvo deve ser:

### 4.1. Anexos

- tocar no clip abre acoes claras e nativas;
- no mobile, haver opcoes separadas para Camera, Fotos, Videos e Arquivos;
- o seletor exibido precisa ser o mais proximo possivel do nativo do sistema;
- o fluxo nao deve depender de um unico input mutavel;
- ao voltar do seletor, o chat nao deve perder contexto, pular ou fechar;
- quando aplicavel, a selecao deve ser preparada para multiplos arquivos no futuro sem reescrever a base.

### 4.2. Composer e teclado

- focar o campo nao pode gerar zoom no iPhone;
- o composer deve permanecer ancorado acima do teclado;
- a lista de mensagens deve preservar contexto e nao saltar sem motivo;
- o usuario deve conseguir digitar, apagar, trocar conversa e anexar sem flicker.

### 4.3. Audio

- pressionar e segurar para gravar;
- arrastar para a lateral de cancelamento enquanto segura;
- soltar em estado normal envia;
- soltar em estado de cancelamento descarta;
- em mobile nao deve existir modal de microfone/saida de audio no fluxo primario;
- o microfone deve ser liberado sempre ao terminar, cancelar, trocar de conversa ou desmontar componente.

## 5. Plano de Implementacao

## Fase 0. Blindagem antes da mudanca

Objetivo: evitar regressao enquanto o fluxo e refeito.

Acoes:

1. Criar testes direcionados para os estados do composer mobile.
2. Isolar comportamento mobile em hooks e componentes pequenos, em vez de continuar expandindo `ChatArea.tsx`.
3. Definir flags internas de comportamento, se necessario, para liberar por etapas.

Entregaveis:

- testes unitarios para regras de estado de gravacao;
- testes de render para composer mobile;
- checklist manual de iPhone Safari e Android Chrome.

## Fase 1. Refatorar anexos para fluxo nativo mobile

Objetivo: eliminar o input unico e os acoplamentos que hoje quebram a experiencia no iPhone.

Acoes em `ChatArea.tsx`:

1. Substituir o input unico por entradas dedicadas:
   - `cameraImageInputRef`
   - `galleryImageInputRef`
   - `videoInputRef`
   - `documentInputRef`
2. Cada input deve ter `accept` fixo, sem mutacao dinamica antes do clique.
3. Adotar fluxo mobile com opcoes explicitas:
   - Tirar foto: `accept="image/*" capture="environment"`
   - Escolher foto: `accept="image/*"`
   - Gravar video ou escolher video: `accept="video/*"` com estrategia definida por plataforma
   - Escolher arquivo: extensoes de documento
4. Fechar o drawer apenas depois do disparo do seletor ou depois do retorno do seletor, conforme o comportamento mais estavel no Safari.
5. Limpar `input.value` sempre apos uso ou cancelamento para permitir nova selecao do mesmo arquivo.
6. Trocar `handleFileChange` para receber o tipo de origem explicitamente, sem depender de `attachmentType` global mutavel.
7. Preparar a assinatura interna para futuramente aceitar multiplos arquivos, mesmo que o envio inicial continue unitario.

Melhoria opcional recomendada:

8. Se a API de envio aceitar bem uploads sequenciais, suportar `multiple` para fotos e videos do rolo da camera, com envio em fila e um caption aplicado ao primeiro item ou a todos, conforme decisao de produto.

Resultados esperados:

- fim do seletor bugado causado por input mutavel + drawer;
- comportamento mais previsivel no iPhone;
- base pronta para camera nativa e galeria separadas.

## Fase 2. Corrigir teclado, zoom e estabilidade visual no iPhone

Objetivo: fazer o composer se comportar como app de mensagem, sem zoom e sem saltos de viewport.

Acoes:

1. No composer do chat, forcar `font-size: 16px` no textarea em mobile iOS.
2. Revisar `Textarea` base para nao impor `text-sm` em cenarios de entrada mobile critica.
3. Criar um hook novo, sugerido como `useMobileKeyboardInsets` ou `useVisualViewport`, para:
   - observar `window.visualViewport` quando disponivel;
   - calcular altura util real do viewport com teclado aberto;
   - expor `keyboardOffset`, `viewportHeight` e `isKeyboardOpen`.
4. Aplicar esse hook ao container do chat e ao composer, via CSS variables ou inline style controlado.
5. Garantir que a area de mensagens compense a abertura do teclado sem recalcular de forma agressiva o scroll.
6. Usar `overscroll-behavior: contain` na area de mensagens e, se necessario, no shell do chat mobile.
7. Revisar pontos que usam `h-dvh` para assegurar que o container ativo do chat nao entre em disputa com o teclado do Safari.
8. Tratar foco do textarea com logica mais defensiva, evitando `scrollIntoView` implícito quando nao necessario.

Resultados esperados:

- o iPhone nao deve dar zoom ao focar o campo;
- o composer deve se manter visualmente estavel acima do teclado;
- a lista nao deve perder a posicao ao iniciar digitacao.

## Fase 3. Redesenhar gravacao de audio no padrao WhatsApp

Objetivo: substituir o fluxo tecnico atual por um fluxo conversacional e nativo no mobile.

Acoes:

1. Criar uma maquina de estados de gravacao, separada do JSX principal:
   - `idle`
   - `pressing`
   - `recording`
   - `canceling`
   - `stopping`
   - `sending`
2. Criar um hook dedicado, sugerido como `useHoldToRecord`, responsavel por:
   - iniciar permissao e stream;
   - iniciar `MediaRecorder`;
   - acumular chunks;
   - calcular duracao;
   - detectar gesto horizontal de cancelamento;
   - parar com seguranca;
   - cancelar sem envio;
   - liberar tracks sempre.
3. No mobile, remover `AudioDeviceModal` do fluxo primario.
4. No mobile, usar sempre microfone padrao do sistema:
   - `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`
5. Manter configuracao de dispositivos apenas para desktop, em area secundaria de configuracoes, nunca no primeiro gesto de gravacao mobile.
6. Implementar UI de gesto:
   - segurou o botao: inicia contagem apos pequeno limiar anti-toque acidental;
   - arrastou em direcao ao cancelamento: UI entra em estado de cancelar;
   - soltou fora da zona de cancelamento: envia;
   - soltou em cancelamento: descarta;
   - feedback visual claro durante todo o gesto.
7. Bloquear duplo stop e duplo envio com guardas explicitas.
8. Ao trocar conversa, perder foco, desmontar componente ou negar permissao, encerrar stream e limpar estado.

Resultados esperados:

- a experiencia fica equivalente ao segurar-para-falar do WhatsApp;
- nenhuma selecao de dispositivo aparece no mobile;
- o gravador sempre termina de forma previsivel.

## Fase 4. Separar desktop e mobile de forma explicita

Objetivo: parar de tratar mobile apenas como viewport estreito.

Acoes:

1. Criar uma camada de capacidade, por exemplo:
   - `isTouchDevice`
   - `isIOSWebKit`
   - `isMobileChatExperience`
2. Usar essa camada para decidir:
   - fluxo de anexo;
   - fluxo de audio;
   - tamanho minimo de fonte do composer;
   - comportamento de foco e teclado.
3. Manter o fluxo atual de dispositivos de audio apenas no desktop, possivelmente atras de acao explicita de configuracao.

Resultados esperados:

- mobile deixa de ser um subcaso do desktop;
- regras ficam mais previsiveis e testaveis.

## Fase 5. Revisar resiliencia do envio e corrigir playback de audio

Objetivo: garantir que a UX mobile tambem seja robusta ao falhar e que audios recebidos toquem inline.

Acoes em `useChat.ts` e integrações do composer:

1. Garantir que cancelamento de audio nao dispare envio nem toast de erro.
2. Garantir que falha de upload mostre mensagem clara e mantenha composer consistente.
3. Se houver suporte a multiplos arquivos, implementar fila sequencial com feedback por item.
4. Padronizar limpeza de estado apos sucesso, falha e cancelamento.
5. Revisar MIME e extensoes de audio para iPhone e Android, incluindo fallback quando `ogg` nao estiver disponivel.

Acoes para playback de audio recebido:

6. Investigar por que URLs do bucket `chat-delivery` com extensao `.ogg` nao carregam (CORS, content-type, permissao, signed URL expirada).
7. Garantir que o componente de player de audio tente fallback de formato (ogg → webm → mp4) caso o navegador nao suporte o formato original.
8. No Safari iOS, que nao suporta `audio/ogg` nativamente, aplicar transcoding ou URL alternativa com formato compativel.
9. Garantir que o player degrade graciosamente para link de download quando todos os formatos falharem, em vez de exibir area vazia.

## Fase 6. QA mobile real e criterios de aceite

Objetivo: nao considerar o trabalho concluido sem validar os bugs originais em dispositivo real.

### Matriz minima de validacao

1. iPhone Safari
2. iPhone Chrome
3. Android Chrome
4. Desktop Chrome

### Casos obrigatorios

1. Abrir conversa e focar o campo de mensagem sem zoom involuntario.
2. Digitar varias linhas e verificar que o composer cresce sem quebrar o layout.
3. Fechar e reabrir teclado sem salto de scroll.
4. Abrir anexos e escolher foto da galeria.
5. Abrir anexos e tirar foto com camera.
6. Escolher video.
7. Escolher documento.
8. Repetir selecao do mesmo arquivo apos cancelar.
9. Segurar para gravar audio e soltar para enviar.
10. Segurar, arrastar para cancelar e soltar sem enviar.
11. Negar permissao de microfone e validar mensagem adequada.
12. Trocar de conversa durante gravacao e confirmar limpeza correta.
13. Receber erro de upload e validar que o composer nao entra em estado preso.

### Criterios de aceite

1. Nenhum zoom involuntario no iPhone ao focar o campo de mensagem.
2. Nenhum modal de selecao de input/output de audio no fluxo primario mobile.
3. Gravacao mobile deve obedecer ao padrao segurar, arrastar para cancelar, soltar para enviar.
4. Acoes de foto, video e arquivo devem abrir seletores nativos previsiveis.
5. Nenhum estado preso de gravacao apos envio, cancelamento, erro ou troca de conversa.
6. Nenhum salto de layout perceptivel ao abrir teclado no mobile.
7. Audios recebidos devem tocar inline com player de waveform, sem cair em fallback de link externo.

## 6. Arquivos Provavelmente Envolvidos na Implementacao

Arquivos principais:

- `src/components/solarzap/ChatArea.tsx`
- `src/hooks/domain/useChat.ts`
- `src/components/solarzap/AudioDeviceModal.tsx`
- `src/components/ui/textarea.tsx`
- `src/hooks/useMobileViewport.ts`
- `src/index.css`

Arquivos novos recomendados:

- `src/hooks/useMobileKeyboardInsets.ts`
- `src/hooks/useHoldToRecord.ts`
- `src/components/solarzap/MobileAttachmentSheet.tsx`
- `src/components/solarzap/MobileRecordingOverlay.tsx`

## 7. Ordem Recomendada de Execucao

1. Corrigir zoom e estabilidade do teclado.
2. Refatorar anexos para inputs dedicados e fluxo mobile nativo.
3. Reescrever gravacao de audio com maquina de estados.
4. Separar politicas desktop versus mobile.
5. Executar QA em dispositivo real.

Motivo da ordem:

- teclado e zoom afetam toda a digitacao e precisam estabilizar a base;
- anexo e audio mexem no mesmo composer e devem entrar com a estrutura certa;
- a validacao final fica muito mais objetiva depois que o composer base estiver estavel.

## 8. Riscos e Cuidados

1. Safari iOS reage mal a `click()` em input oculto quando o gesto original passa por drawers e animacoes; por isso a abertura do seletor precisa ser simplificada.
2. `pointerleave` nao e base confiavel para encerrar audio no mobile.
3. `MediaRecorder` e codecs variam entre navegadores; o hook de gravacao deve centralizar fallback.
4. `dvh` sozinho nao resolve teclado virtual em todos os cenarios de iOS.
5. Se houver suporte a multi-upload, o backend precisa ser validado para nao gerar duplicidade, timeout ou UX truncada.

## 9. Definicao de Pronto

O item so deve ser considerado pronto quando:

1. o chat mobile conseguir anexar foto, video, documento e audio sem comportamento estranho em iPhone;
2. a digitacao nao gerar zoom ou reposicionamento inesperado;
3. a gravacao de audio funcionar no modelo WhatsApp;
4. audios recebidos tocarem inline com player funcional em todos os navegadores alvo;
5. desktop continuar funcional;
6. a validacao final for feita em pelo menos um iPhone real e um Android real, alem do navegador local.

## 10. Recomendacao Final

Nao tratar esta demanda como ajuste pontual. O problema atual nao esta em um unico bug; ele vem de uma arquitetura de composer que ainda esta desktop-first.

O caminho correto e transformar o composer do chat em uma experiencia mobile-first, com:

- entradas de anexo dedicadas;
- gestao de teclado baseada em `visualViewport`;
- gravacao de audio por maquina de estados;
- separacao explicita entre politicas mobile e desktop.

Isso resolve a reclamacao atual na raiz e reduz retrabalho nas proximas iteracoes.