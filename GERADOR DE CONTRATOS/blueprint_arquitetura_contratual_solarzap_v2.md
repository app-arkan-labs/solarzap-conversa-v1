# Blueprint Revisado de Arquitetura Contratual — Aceleração SolarZap

## Finalidade deste documento
Este documento define a arquitetura **contratual, operacional e sistêmica** do gerador de contratos do Aceleração SolarZap, considerando a seguinte decisão de arquitetura:

- o **gerador de contratos será construído dentro do projeto principal do SolarZap**;
- a **Landing Page / página de apresentação comercial será apenas uma camada de apresentação e gatilho de abertura**;
- o fluxo poderá ser usado tanto **internamente no SolarZap** quanto **embutido em interfaces externas do ecossistema**;
- o **SolarZap será a fonte de verdade** para contratos, dados comerciais, versões, PDFs e automações.

Este blueprint existe para garantir:

1. coerência entre oferta comercial e contrato;
2. geração automática consistente de contratos;
3. vínculo nativo do contrato com CRM, lead, vendedor, organização e automações internas;
4. separação correta entre campos jurídicos e metadados técnicos;
5. possibilidade de uso do gerador em contextos embutidos, sem contaminar a redação contratual com detalhes técnicos de interface.

---

## 1. Premissas estratégicas

### 1.1. Premissas comerciais
O modelo contratual a ser refletido é:

- **contrato único**;
- **vigência inicial mínima de 3 meses**;
- **mês 1 = implantação inicial**;
- **meses 2 e 3 = continuidade operacional recorrente**;
- **após o ciclo inicial, renovação automática mensal**, salvo cancelamento com aviso prévio;
- **plano contratado define nível de acompanhamento e escopo variável**;
- **condições especiais de fechamento podem ser registradas no mesmo contrato**.

### 1.2. Planos contemplados
O sistema deve contemplar, no mínimo:

- **Plano A — Essencial / Downsell** (uso opcional);
- **Plano B — Implantação Guiada**;
- **Plano C — Implementação Completa**.

### 1.3. Condições comerciais variáveis
O sistema deve suportar, de forma condicional:

- landing page incluída ou não;
- reunião extra de coleta incluída ou não;
- suporte via WhatsApp em nível variável por plano;
- quantidade variável de reuniões;
- recorrência mensal expressa dentro do contrato principal;
- observações comerciais adicionais;
- eventual alteração de forma de pagamento e vencimento.

---

## 2. Mudança de arquitetura adotada

### 2.1. Arquitetura antiga descartada
A arquitetura antiga tratava a página comercial como origem principal do gerador. Esse modelo deve ser abandonado.

### 2.2. Arquitetura nova adotada
A nova arquitetura passa a ser:

- **SolarZap principal** = fonte de verdade;
- **módulo contratual do SolarZap** = local real do gerador;
- **embed externo** = apenas interface de abertura/uso;
- **contrato, preview, PDF, logs, status e automações** = centralizados no SolarZap.

### 2.3. Consequência importante
O contrato não deve mencionar:

- iframe;
- embed;
- landing page como origem do fluxo;
- repositórios;
- arquitetura técnica;
- integração entre subdomínios;
- detalhes de mensageria entre frontends.

Esses elementos pertencem ao **sistema**, não ao **instrumento contratual**.

---

## 3. Fonte de verdade do sistema

O módulo contratual do SolarZap será responsável por:

1. receber os dados do fluxo de formalização;
2. armazenar rascunhos de contrato;
3. aplicar regras de plano e condição especial;
4. preencher o contrato-base;
5. injetar anexos corretos;
6. gerar preview;
7. gerar PDF;
8. persistir histórico e versões;
9. disparar automações internas;
10. integrar com assinatura eletrônica.

---

## 4. Estrutura macro do documento contratual

O contrato gerado deve seguir a seguinte arquitetura:

1. Qualificação das partes  
2. Definições  
3. Objeto  
4. Plano contratado e anexos integrantes  
5. Fase 1 — Implantação Inicial  
6. Fase 2 — Continuidade Operacional Recorrente  
7. Exclusões de escopo  
8. Obrigações da contratante  
9. Obrigações da contratada  
10. Prazo, vigência e renovação  
11. Remuneração, vencimento e inadimplência  
12. Rescisão e cancelamento  
13. Uso da plataforma, ativos e propriedade intelectual  
14. Proteção de dados e confidencialidade  
15. Limitação de responsabilidade e ausência de garantia de resultado  
16. Assinatura eletrônica  
17. Disposições gerais  
18. Foro  
19. Resumo Comercial Final  
20. Anexo do plano  
21. Anexo de condição especial, quando aplicável

---

## 5. Lógica contratual obrigatória

### 5.1. Contrato único com duas fases
O contrato deve conter duas fases dentro do mesmo instrumento:

#### Fase 1 — Implantação Inicial
Corresponde ao primeiro mês e cobre:
- coleta inicial;
- setup;
- ativação inicial;
- treinamento e reuniões do plano;
- implementação do escopo inicial;
- condição especial, se houver.

#### Fase 2 — Continuidade Operacional Recorrente
Corresponde aos meses subsequentes e cobre:
- manutenção do serviço recorrente previsto;
- manutenção do SolarZap, quando aplicável;
- gestão de tráfego recorrente, quando aplicável;
- suporte no nível do plano;
- continuidade operacional dentro dos limites contratuais.

### 5.2. Vigência recomendada
- prazo inicial mínimo de **3 meses**;
- renovação automática mensal após o ciclo inicial;
- cancelamento com aviso prévio antes do próximo vencimento.

### 5.3. Remuneração obrigatoriamente separada em dois blocos
- **valor da implantação inicial**;
- **valor da recorrência mensal**.

A verba de mídia deve constar como custo externo pago diretamente pela contratante, salvo exceção registrada no Resumo Comercial.

---

## 6. Separação entre dados jurídicos e dados técnicos

### 6.1. Dados jurídicos/comerciais
São os que aparecem no contrato, no preview e no PDF:

- contratante;
- responsável legal;
- plano;
- valores;
- vigência;
- vencimentos;
- condição especial;
- foro;
- plataforma de assinatura;
- resumo comercial;
- anexos.

### 6.2. Metadados internos do sistema
Não devem aparecer no contrato, mas devem existir no SolarZap:

- `contract_draft_id`
- `contract_number`
- `contract_version`
- `template_version`
- `lead_id`
- `opportunity_id`
- `organization_id`
- `seller_user_id`
- `sales_session_id`
- `generated_from`
- `embed_source`
- `embed_origin`
- `created_by_user_id`
- `last_updated_by_user_id`
- `signature_provider`
- `signature_envelope_id`
- `pdf_storage_path`
- `preview_storage_path`
- `contract_status`
- `signature_status`
- `automation_status`
- `sent_to_signature_at`
- `signed_at`
- `cancelled_at`

---

## 7. Estados do contrato

O sistema deve operar com estados explícitos.

### 7.1. Estados mínimos
- `draft`
- `review_ready`
- `preview_generated`
- `pdf_generated`
- `sent_for_signature`
- `signed`
- `cancelled`
- `expired`
- `failed`

### 7.2. Regras mínimas
- o contrato nasce como `draft`;
- após revisão final do wizard, vira `review_ready`;
- ao montar a versão visual, vira `preview_generated`;
- ao exportar PDF, vira `pdf_generated`;
- ao subir para assinatura, vira `sent_for_signature`;
- quando assinado, vira `signed`;
- se descartado ou invalidado, vira `cancelled` ou `expired`.

---

## 8. Eventos e automações internas

Como o gerador será centralizado no SolarZap, o blueprint deve prever eventos nativos.

### 8.1. Eventos mínimos
- contrato criado
- contrato draft salvo
- resumo comercial confirmado
- preview gerado
- PDF gerado
- contrato enviado para assinatura
- contrato assinado
- contrato cancelado
- contrato expirado
- condição especial aplicada
- onboarding disparado
- tarefa operacional criada
- lead movido de etapa

### 8.2. Automação futura desejável
Ao assinar o contrato, o sistema poderá:
- criar tarefa de onboarding;
- mover lead/opportunity de etapa;
- registrar evento no CRM;
- gerar checklist operacional;
- avisar equipe interna;
- preparar cobrança ou integração com assinatura.

---

## 9. Modelo de persistência

O sistema deve salvar, no mínimo:

- snapshot dos dados preenchidos no momento da geração;
- versão do template contratual usada;
- versão dos anexos usados;
- JSON final do resumo comercial;
- HTML final do preview;
- PDF final gerado;
- status do contrato;
- origem do fluxo;
- log de geração;
- log de alterações;
- identificação de quem gerou/alterou.

---

## 10. Arquitetura operacional do gerador

### 10.1. Local de implementação
O gerador deve ser um módulo do **SolarZap principal**.

### 10.2. Uso interno e externo
O mesmo módulo deve poder ser usado:
- internamente no app;
- em rota dedicada de embed;
- em modal/iframe dentro de outra interface do ecossistema.

### 10.3. Princípio operacional
A interface externa não é fonte de verdade. Ela apenas:
- abre o fluxo;
- envia contexto inicial;
- recebe status de conclusão.

### 10.4. O que deve ser desacoplado do contrato
Não incluir no documento final:
- nome do projeto externo;
- URL de origem;
- repositório;
- detalhes de embed;
- detalhes de comunicação entre frontends.

---

## 11. Contexto externo e prefill

O gerador deve aceitar dados pré-preenchidos vindos de contexto externo controlado.

### 11.1. Prefill permitido
- nome da empresa;
- nome do responsável;
- e-mail;
- telefone;
- plano sugerido;
- condição especial pré-marcada;
- vendedor associado;
- identificação da sessão comercial.

### 11.2. Regra
Campos externos podem ser:
- pré-preenchidos e editáveis; ou
- pré-preenchidos e travados,
conforme regra do fluxo.

---

## 12. Campos variáveis do gerador

### 12.1. Dados da contratante
- `{{contratante_razao_social}}`
- `{{contratante_nome_fantasia}}`
- `{{contratante_cnpj}}`
- `{{contratante_endereco_logradouro}}`
- `{{contratante_endereco_numero}}`
- `{{contratante_endereco_complemento}}`
- `{{contratante_bairro}}`
- `{{contratante_cidade}}`
- `{{contratante_estado}}`
- `{{contratante_cep}}`

### 12.2. Representante legal
- `{{responsavel_nome}}`
- `{{responsavel_nacionalidade}}`
- `{{responsavel_estado_civil}}`
- `{{responsavel_profissao}}`
- `{{responsavel_cpf}}`
- `{{responsavel_rg}}`
- `{{responsavel_cargo}}`
- `{{responsavel_email}}`
- `{{responsavel_telefone}}`

### 12.3. Dados fixos da contratada
- `{{contratada_razao_social}}`
- `{{contratada_nome_fantasia}}`
- `{{contratada_cnpj}}`
- `{{contratada_endereco}}`
- `{{contratada_representante_nome}}`
- `{{contratada_representante_cpf}}`

### 12.4. Dados comerciais
- `{{plano_codigo}}`
- `{{plano_nome}}`
- `{{plano_valor_implantacao}}`
- `{{plano_valor_recorrente}}`
- `{{plano_qtd_reunioes_implantacao}}`
- `{{plano_tem_suporte_whatsapp}}`
- `{{plano_tem_reuniao_extra}}`
- `{{plano_tem_landing_page}}`
- `{{plano_tem_treinamento_gravado}}`
- `{{plano_tem_solarzap_1_mes}}`
- `{{plano_tem_acompanhamento_semanal}}`
- `{{plano_tem_trafego_pago}}`

### 12.5. Prazo e pagamento
- `{{data_assinatura}}`
- `{{data_inicio}}`
- `{{vigencia_inicial_meses}}`
- `{{data_primeiro_vencimento}}`
- `{{dia_vencimento_mensal}}`
- `{{forma_pagamento_implantacao}}`
- `{{forma_pagamento_recorrencia}}`
- `{{prazo_cancelamento_dias}}`
- `{{prazo_exportacao_dados_dias}}`
- `{{multa_inadimplencia_percentual}}`
- `{{juros_inadimplencia_percentual}}`

### 12.6. Condição especial
- `{{tem_condicao_especial}}`
- `{{descricao_condicao_especial}}`
- `{{observacoes_comerciais}}`

### 12.7. Assinatura e foro
- `{{plataforma_assinatura_nome}}`
- `{{url_plataforma_assinatura}}`
- `{{foro_cidade}}`
- `{{foro_estado}}`

---

## 13. Regras de negócio por plano

### 13.1. Plano A — Essencial / Downsell
- implantação mais enxuta;
- sem acompanhamento semanal;
- sem suporte WhatsApp ampliado;
- sem landing page, salvo condição especial expressa;
- uso controlado e escopo mínimo.

### 13.2. Plano B — Implantação Guiada
- 1 reunião de coleta e alinhamento;
- 1 mês de SolarZap;
- tráfego pago;
- treinamento base;
- sem suporte WhatsApp contínuo, salvo previsão expressa;
- sem landing page, salvo condição especial expressa.

### 13.3. Plano C — Implementação Completa
- tudo do Plano B;
- acompanhamento semanal durante a implantação;
- suporte via WhatsApp durante a implantação;
- possibilidade de reunião extra;
- possibilidade de landing page como condição especial.

### 13.4. Regra obrigatória
A recorrência mensal deve sempre constar no contrato principal.

---

## 14. Estrutura dos anexos

### Anexo I — Plano A / Essencial
Deve conter:
- descrição objetiva do plano;
- itens inclusos;
- itens não inclusos;
- reuniões;
- suporte;
- limites de execução.

### Anexo II — Plano B / Implantação Guiada
Deve conter:
- tráfego pago;
- 1 mês de SolarZap;
- treinamento base;
- 1 reunião de coleta e alinhamento;
- implantação guiada;
- exclusão de suporte ampliado e landing page, salvo previsão expressa.

### Anexo III — Plano C / Implementação Completa
Deve conter:
- tudo do Plano B;
- acompanhamento semanal;
- suporte via WhatsApp na implantação;
- maior proximidade operacional;
- reunião extra quando registrada;
- landing page quando registrada.

### Anexo IV — Condição Especial
Deve conter:
- descrição exata da condição especial;
- validade dentro da contratação;
- regra de perda do bônus em caso de inadimplência ou ruptura antecipada, se aplicável.

### Anexo V — Resumo Comercial Final
Deve ser o espelho objetivo da contratação.

---

## 15. Regras de segurança e governança

O sistema deve prever:
- quem pode criar contratos;
- quem pode editar contratos em draft;
- quem pode gerar PDF;
- quem pode reenviar para assinatura;
- quem pode cancelar;
- quando uma nova versão deve ser criada em vez de sobrescrever a anterior.

---

## 16. Resultado esperado

Ao final, o módulo contratual do SolarZap deve permitir:

1. geração de contrato em fluxo interno ou embed;
2. vínculo do contrato com CRM e operação;
3. preview fiel do documento final;
4. exportação em PDF;
5. registro de versões;
6. automações futuras nativas;
7. independência da Landing Page como fonte de regra.

---

## 17. Regra final de implementação

Na implementação:

- o **blueprint** é a fonte de verdade da lógica estratégica;
- a **minuta estrutural** é a fonte de verdade da engenharia do gerador;
- o **contrato-base real** é a fonte de verdade do texto a ser preenchido.
