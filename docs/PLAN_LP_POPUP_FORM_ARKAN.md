# Plano de Acao - Formulario Popup Etapa por Etapa da LP Aceleracao -> CRM Interno SolarZap

## Objetivo

Implementar na landing page https://lp.aceleracao.solarzap.com.br um formulario popup, etapa por etapa, aberto a partir dos botoes da LP, com salvamento progressivo no CRM interno do SolarZap e com integracao nativa com pipeline, agenda, automacoes de WhatsApp e tracking de anuncios.

O fluxo precisa:

1. Abrir em popup sobre a tela atual.
2. Aplicar blur no fundo enquanto o popup estiver aberto.
3. Fechar ao clicar fora do popup e restaurar a tela normal.
4. Coletar, em etapas, nome completo, telefone, empresa e email.
5. Mostrar um modal de agenda para selecao de data e hora vinculado ao calendario do CRM administrativo.
6. Exibir tela final de agradecimento com CTA direto para WhatsApp no numero 14991402780.
7. Salvar progresso a partir do telefone, mesmo que o lead abandone antes do agendamento.
8. Disparar mensagem automatica convidando o lead a retomar o agendamento se ele parar depois do telefone.
9. Coletar UTMs, click IDs e contexto de anuncio para alimentar tracking e futuras conversoes Meta e Google a partir do pipeline do CRM.

## Restricao Arquitetural Critica

Nao usar o internal-crm-api diretamente na landing page publica.

Motivo:

- O internal-crm-api atual eh protegido por role CRM e MFA.
- A chamada real de producao respondeu mfa_required quando testada com usuario comum.
- A LP eh publica e nao pode depender de autenticacao administrativa.

Conclusao:

- O repositiorio da LP deve consumir uma funcao publica e dedicada, criada no repositorio do CRM, com CORS allowlist para a LP, rate limit, validacao de payload e uso de service role apenas no backend.

## O Que Ja Existe no CRM Interno

O plano do popup deve reaproveitar o que ja foi implementado neste repositorio:

- Action intake_landing_lead no backend do CRM interno.
- Pipeline ARKAN com etapas novo_lead, respondeu, chamada_agendada, chamada_realizada, nao_compareceu, negociacao, fechou, nao_fechou.
- Automacoes seeded para lp_form_submitted, appointment_scheduled, appointment_no_show e eventos de oferta.
- Persistencia de contexto comercial em internal_crm.deals.commercial_context.
- Agenda interna em internal_crm.appointments.
- Logica existente de geracao de slots em supabase/functions/ai-pipeline-agent/index.ts.
- Tracking V3 ja existente no projeto, com lead_attribution, conversion_events e conversion_deliveries, hoje orientado ao schema publico.

## Resultado Esperado de UX

### Comportamento visual

- O clique em qualquer botao configurado da LP abre um popup centralizado.
- O fundo recebe overlay semitransparente com backdrop blur.
- O body fica com scroll travado enquanto o popup estiver aberto.
- Clicar fora do card fecha o popup.
- Apertar ESC fecha o popup.
- Ao fechar, o blur some e a tela volta ao estado normal.
- No mobile, o popup continua sendo modal, com largura responsiva e altura adaptada, sem quebrar a leitura.

### Fluxo de etapas

Etapa 1:

- Nome completo.

Etapa 2:

- Telefone no formato brasileiro com DDD.
- A partir daqui o lead ja precisa ser persistido no CRM, mesmo sem concluir as proximas etapas.

Etapa 3:

- Empresa.

Etapa 4:

- Email.

Etapa 5:

- Modal interno de agenda com selecao de data e hora.
- Os horarios devem vir do calendario administrativo do CRM.
- Ao confirmar, o compromisso eh criado no CRM e a etapa vai para chamada_agendada.

Etapa 6:

- Tela de agradecimento.
- Exibir horario escolhido.
- Exibir CTA para WhatsApp com link direto para 5514991402780.

## Regra Principal de Persistencia

Antes do telefone:

- Nenhum registro obrigatorio no CRM.

Ao concluir telefone:

- Criar ou atualizar contato no CRM interno.
- Criar ou atualizar deal aberto em novo_lead.
- Marcar origem como landing_page.
- Salvar progresso parcial da sessao.
- Salvar tracking e UTMs capturados ate aquele momento.

Se o lead fechar o popup depois do telefone e antes do agendamento:

- O contato permanece criado.
- O deal permanece criado.
- O progresso parcial permanece salvo.
- A automacao de retomada deve ser disparada usando o evento lp_form_submitted com has_scheduled_call=false.

Ao preencher empresa e email:

- Atualizar o mesmo registro ja criado pelo telefone.
- Nunca criar duplicado se o telefone for o mesmo.

Ao concluir agendamento:

- Criar appointment no CRM.
- Atualizar o deal para chamada_agendada.
- Persistir meeting_link, scheduling_link e appointment_start_at.
- Disparar automacoes de confirmacao e lembretes.

## Estrategia de Dedupe

Chave principal de dedupe:

- Telefone normalizado em E.164.

Regras:

- Mesmo telefone na mesma LP deve atualizar o mesmo client/deal aberto.
- O formulario nunca deve criar varios contatos para o mesmo telefone por causa de reopen, refresh ou abandono.
- O frontend deve guardar um form_session_id em sessionStorage.
- O backend deve aceitar form_session_id, mas o dedupe de negocio deve ser feito pelo telefone.

## Adaptacao Correta ao CRM Interno

### Mapeamento de dados

Nome completo:

- internal_crm.clients.primary_contact_name

Telefone:

- internal_crm.clients.primary_phone
- internal_crm.client_contacts.phone

Empresa:

- internal_crm.clients.company_name

Email:

- internal_crm.clients.primary_email

Origem:

- source_channel = landing_page

Titulo do deal:

- Oportunidade ARKAN - <empresa ou nome>

Etapa apos telefone:

- novo_lead

Etapa apos agendamento:

- chamada_agendada

Oferta principal inicial:

- landing_page

Contexto tecnico e comercial:

- internal_crm.deals.commercial_context

## Integracao Recomendada entre a LP e o CRM

### Nao fazer

- Nao chamar internal-crm-api diretamente da LP publica.
- Nao expor service role no frontend.
- Nao gravar tracking direto do browser nas tabelas protegidas.

### Fazer

Criar no repositorio do CRM uma funcao publica dedicada, por exemplo:

- supabase/functions/lp-popup-intake/index.ts

Essa funcao publica deve suportar tres actions:

- save_step
- list_slots
- book_slot

Ela deve:

- aceitar chamadas publicas apenas do dominio da LP;
- aplicar rate limit por IP e por telefone;
- normalizar telefone;
- gravar sessao parcial;
- chamar a logica interna do CRM com service role;
- acoplar tracking e attribution;
- nunca expor detalhes administrativos para o browser.

## Contrato Recomendado da Funcao Publica

### 1. save_step

Uso:

- salvar progresso a partir do telefone;
- atualizar nome, empresa e email;
- marcar abandono quando o modal for fechado depois do telefone.

Payload sugerido:

```json
{
  "action": "save_step",
  "form_session_id": "uuid-gerado-no-browser",
  "funnel_slug": "lp_aceleracao_solarzap",
  "button_context": {
    "button_id": "hero-primary-cta",
    "button_label": "Quero acelerar",
    "section_id": "hero"
  },
  "lead": {
    "full_name": "Nome Sobrenome",
    "phone": "14999999999",
    "company": "Empresa Exemplo",
    "email": "lead@empresa.com"
  },
  "progress": {
    "current_step": "phone",
    "last_completed_step": "phone",
    "is_abandoned": false
  },
  "tracking": {
    "utm_source": "meta",
    "utm_medium": "paid_social",
    "utm_campaign": "campanha_x",
    "utm_content": "criativo_y",
    "utm_term": "termo_z",
    "gclid": null,
    "gbraid": null,
    "wbraid": null,
    "fbclid": "...",
    "fbc": "...",
    "fbp": "...",
    "ttclid": null,
    "msclkid": null,
    "landing_page_url": "https://lp.aceleracao.solarzap.com.br/?utm_source=meta",
    "referrer_url": "https://l.facebook.com/...",
    "raw_querystring": "utm_source=meta&utm_medium=paid_social",
    "session_id": "browser-session-id"
  }
}
```

Resposta sugerida:

```json
{
  "ok": true,
  "form_session_id": "uuid",
  "internal_client_id": "uuid",
  "internal_deal_id": "uuid",
  "stage_code": "novo_lead",
  "resume_message_queued": false,
  "next_step": "company"
}
```

### 2. list_slots

Uso:

- abrir a grade de horarios livres do calendario administrativo.

Payload sugerido:

```json
{
  "action": "list_slots",
  "form_session_id": "uuid",
  "appointment_type": "call",
  "timezone": "America/Sao_Paulo",
  "duration_minutes": 30
}
```

Resposta sugerida:

```json
{
  "ok": true,
  "timezone": "America/Sao_Paulo",
  "slots": [
    "2026-03-31T13:00:00.000Z",
    "2026-03-31T13:30:00.000Z"
  ]
}
```

Implementacao recomendada no CRM:

- reutilizar a logica de generateAvailableSlotsForType existente no ai-pipeline-agent;
- consultar busy ranges do calendario administrativo;
- respeitar timezone e janela comercial.

### 3. book_slot

Uso:

- confirmar horario e criar appointment.

Payload sugerido:

```json
{
  "action": "book_slot",
  "form_session_id": "uuid",
  "appointment_type": "call",
  "appointment_start_at": "2026-03-31T13:00:00.000Z",
  "timezone": "America/Sao_Paulo"
}
```

Resposta sugerida:

```json
{
  "ok": true,
  "internal_client_id": "uuid",
  "internal_deal_id": "uuid",
  "appointment_id": "uuid",
  "stage_code": "chamada_agendada",
  "meeting_link": "https://meet.google.com/...",
  "scheduled_at": "2026-03-31T13:00:00.000Z",
  "whatsapp_url": "https://wa.me/5514991402780?text=..."
}
```

## Como Reaproveitar o Backend Ja Existente

### Reuso do intake_landing_lead

O backend atual ja possui a action intake_landing_lead, que:

- cria ou atualiza client;
- cria ou atualiza deal;
- opcionalmente cria appointment;
- persiste source = landing_page;
- salva scheduling_link e meeting_link em commercial_context;
- dispara lp_form_submitted;
- dispara appointment_scheduled quando houver agendamento.

Portanto, o plano recomendado eh:

- a funcao publica save_step reaproveita a mesma logica do intake_landing_lead para as etapas apos telefone;
- a funcao publica book_slot reaproveita a mesma logica de intake final ou de upsert_appointment.

### Ponto que ainda precisa ser adicionado no CRM

Como a LP eh publica, a funcao publica precisa encapsular a logica administrativa.

Tambem sera necessario criar uma camada publica de disponibilidade de agenda, pois hoje a geracao de slots esta embutida na experiencia do agente e nao como endpoint publico consumivel pela landing page.

## Tabela Tecnica Recomendada para Sessao do Formulario

Criar no CRM uma tabela dedicada, por exemplo:

- internal_crm.landing_form_sessions

Campos recomendados:

- id
- form_session_id
- funnel_slug
- button_context jsonb
- phone_normalized
- full_name
- company_name
- email
- last_completed_step
- status
- is_abandoned
- abandoned_at
- internal_client_id
- internal_deal_id
- internal_appointment_id
- tracking_payload jsonb
- landing_page_url
- referrer_url
- raw_querystring
- created_at
- updated_at

Motivo:

- separar estado tecnico de formulario do deal comercial;
- facilitar retomar formulario;
- evitar sobrecarga de dados efemeros no deal;
- manter trilha clara para auditoria e troubleshooting.

## Tracking e Atribuicao de Anuncios

### Campos obrigatorios a coletar no browser

- utm_source
- utm_medium
- utm_campaign
- utm_content
- utm_term
- gclid
- gbraid
- wbraid
- fbclid
- fbc
- fbp
- ttclid
- msclkid
- landing_page_url
- referrer_url
- raw_querystring
- session_id
- pageview_id, se existir
- user_agent
- timezone
- locale
- button_id
- button_label
- section_id

### Como capturar

- Ler query params no primeiro page load.
- Persistir em sessionStorage.
- Reidratar ao abrir o popup.
- Preservar cookies _fbp e _fbc se ja existirem.
- Se _fbc nao existir e houver fbclid, derivar _fbc no padrao Facebook.

### Onde salvar no CRM

No minimo em dois lugares:

- internal_crm.landing_form_sessions.tracking_payload
- internal_crm.deals.commercial_context.attribution

### Como conectar isso ao tracking atual do projeto

O projeto ja possui Tracking V3 em schema publico com:

- lead_attribution
- attribution_touchpoints
- conversion_events
- conversion_deliveries

Como o CRM interno eh isolado do runtime publico, o fluxo correto eh:

1. A funcao publica da LP grava a atribuicao capturada numa estrutura canonica.
2. Essa mesma funcao cria ou atualiza um vinculo tecnico entre lead da LP e entidade do CRM interno.
3. Quando o pipeline interno mudar de etapa, um bridge backend cria eventos de conversao no Tracking V3.

### Bridge recomendado para Meta e Google

Criar no CRM uma ponte explicita, por exemplo:

- internal_crm.tracking_bridge

Campos sugeridos:

- internal_client_id
- internal_deal_id
- org_id
- public_lead_id
- attribution_snapshot jsonb
- created_at
- updated_at

Comportamento:

- na captura do telefone, criar ou atualizar o bridge;
- ao mover o deal nas etapas relevantes, disparar conversao para Tracking V3;
- o dispatcher existente segue entregando Meta CAPI, Google Ads e GA4.

## Mapeamento de Etapas do Pipeline para Eventos de Tracking

Telefone capturado:

- etapa interna: novo_lead
- tracking sugerido: Meta Lead, GA4 generate_lead

Agendamento concluido:

- etapa interna: chamada_agendada
- tracking sugerido: Meta Schedule, Google schedule, GA4 schedule_appointment

Chamada realizada:

- etapa interna: chamada_realizada
- tracking sugerido: evento qualificado conforme stage_event_map da org

Fechou:

- etapa interna: fechou
- tracking sugerido: conversao final conforme stage_event_map da org

Nao fechou:

- etapa interna: nao_fechou
- normalmente nao gera conversao externa, apenas analytics internos

## Regra de WhatsApp da Tela Final

Numero:

- 14991402780

Link final recomendado:

- https://wa.me/5514991402780?text=Oi,%20acabei%20de%20preencher%20o%20formulario%20da%20LP%20da%20Aceleracao%20SolarZap.

Na tela final:

- manter o CTA principal para WhatsApp;
- exibir resumo do agendamento;
- exibir mensagem curta de confirmacao.

## Comportamento do Frontend da LP

### Estrutura do popup

- componente raiz em portal;
- overlay fixed inset-0 com fundo escurecido e backdrop-blur;
- card central com progress bar;
- transicao suave entre etapas;
- validacao inline por etapa;
- focus trap;
- scroll lock no body.

### Fechamento por clique fora

Se ainda nao houve telefone valido:

- fechar sem persistencia.

Se ja houve telefone valido:

- chamar save_step com is_abandoned=true e current_step correspondente;
- manter form_session_id em sessionStorage para retomada futura;
- disparar automacao de retomada.

### Retomada

- ao reabrir na mesma sessao do browser, retomar da ultima etapa salva;
- se o lead clicar de novo vindo de mensagem de WhatsApp, retomar pelo mesmo telefone sempre que possivel.

## Sequencia Recomendada de Implementacao

### Bloco A - CRM repo

1. Criar funcao publica lp-popup-intake com actions save_step, list_slots e book_slot.
2. Criar tabela internal_crm.landing_form_sessions.
3. Encapsular reuso da logica de intake_landing_lead.
4. Expor disponibilidade de slots baseada na agenda administrativa.
5. Garantir CORS allowlist para lp.aceleracao.solarzap.com.br.
6. Aplicar rate limit e anti-spam.
7. Persistir tracking_payload e bridge tecnico para Tracking V3.
8. Criar bridge de conversao do pipeline interno para conversion_events/conversion_deliveries.

### Bloco B - LP repo

1. Criar PopupMultiStepLeadForm.
2. Criar hook useLeadPopupFormState.
3. Criar adapter de API para a funcao publica do CRM.
4. Capturar UTMs e click IDs na abertura da pagina.
5. Fazer autosave a partir do telefone.
6. Implementar grade de slots com carregamento remoto.
7. Implementar tela final com CTA de WhatsApp.
8. Conectar os botoes da LP para abrir o popup com button_context.

### Bloco C - Validacao integrada

1. Lead fecha na etapa telefone e contato eh criado.
2. WhatsApp de retomada eh enviado.
3. Lead volta, conclui empresa e email, sem duplicar client/deal.
4. Lead agenda horario e appointment aparece no calendario interno.
5. Deal muda para chamada_agendada.
6. Tracking fica salvo no CRM.
7. Ao mover pipeline, conversao vai para Meta e Google pelo dispatcher atual.

## Cenarios de Teste Obrigatorios

Caso 1:

- lead abriu popup;
- preencheu nome e telefone;
- clicou fora;
- resultado esperado: client/deal criados, etapa novo_lead, retomada automatica habilitada.

Caso 2:

- lead preencheu tudo e agendou;
- resultado esperado: appointment criado, etapa chamada_agendada, confirmacao de WhatsApp pronta.

Caso 3:

- lead reabre popup com mesmo telefone;
- resultado esperado: atualiza registro existente e nao duplica contato.

Caso 4:

- lead chega com utm_source, utm_campaign, fbclid e gclid;
- resultado esperado: tracking_payload armazenado corretamente e bridge preparado para conversao futura.

Caso 5:

- usuario clica fora antes do telefone;
- resultado esperado: fecha sem criar lead.

Caso 6:

- no-show posterior no CRM;
- resultado esperado: automacoes seeded de no-show continuam funcionando com link_agendamento.

## Criterios de Aceite

- Popup abre sobre a LP sem redirecionar de pagina.
- Fundo desfoca e volta ao normal ao fechar.
- Salvamento progressivo comeca no telefone.
- Abandono apos telefone dispara retomada.
- Agenda usa disponibilidade do CRM administrativo.
- Appointment cai no calendario interno.
- Deal entra em pipeline correto.
- UTMs e click IDs ficam persistidos.
- Arquitetura respeita a separacao entre LP publica e backend administrativo.
- Tracking de Meta e Google passa a nascer dos movimentos do pipeline interno, e nao de gambiarras no frontend.

## Instrucoes Diretas para o Agente do Outro Repositorio

Voce vai implementar apenas a parte da landing page, mas deve deixar o codigo pronto para consumir uma API publica do CRM. Nao chame internal-crm-api direto. Estruture o formulario popup em etapas, com overlay blur, salvamento progressivo a partir do telefone, retomada por form_session_id e integracao com endpoints publicos save_step, list_slots e book_slot. Capture UTMs, click IDs e contexto do botao, persista tudo desde o telefone e mostre a tela final com CTA para WhatsApp em 14991402780. O frontend deve ser desacoplado do backend administrativo e trabalhar com um adapter de API para a futura funcao publica do CRM.
