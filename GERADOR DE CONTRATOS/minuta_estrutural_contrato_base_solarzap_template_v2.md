# Minuta Estrutural Revisada do Contrato-Base SolarZap

## Finalidade deste arquivo
Este documento serve como **minuta estrutural e blueprint operacional** para a implementação do gerador contratual do SolarZap.

Ele deve orientar a construção do sistema em três níveis:

1. **texto contratual fixo**;
2. **variáveis jurídicas/comerciais que entram no contrato**;
3. **metadados internos do sistema que não entram no contrato, mas precisam ser persistidos**.

Este arquivo não substitui revisão jurídica profissional. Sua função é:
- organizar a arquitetura do contrato;
- separar texto fixo, variáveis de renderização e metadados internos;
- definir placeholders do gerador;
- definir lógica condicional por plano;
- definir estados, persistência e regras operacionais do módulo contratual.

---

# 1. Premissas do módulo contratual

## 1.1. Estrutura comercial refletida
O contrato deve refletir o modelo atual:
- contrato único;
- vigência inicial mínima de 3 meses;
- mês 1 = implantação inicial;
- meses 2 e 3 = continuidade operacional recorrente;
- renovação automática mensal após o ciclo inicial;
- plano contratado define o nível de acompanhamento e escopo variável;
- condição especial pode ser registrada no mesmo instrumento.

## 1.2. Local do gerador
O gerador deve ser tratado como **módulo central do SolarZap**, e não como componente da Landing Page.

## 1.3. Interfaces possíveis
O mesmo gerador deve funcionar em:
- fluxo interno do SolarZap;
- rota de embed;
- modal/iframe em interface externa;
- eventual fluxo administrativo futuro.

---

# 2. Arquitetura do documento gerado

O contrato gerado deve conter:

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

# 3. Separação obrigatória de dados

## 3.1. Grupo A — Campos que entram no contrato/PDF
Esses campos aparecem no texto final, no preview e no PDF.

### Dados da contratante
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

### Representante legal
- `{{responsavel_nome}}`
- `{{responsavel_nacionalidade}}`
- `{{responsavel_estado_civil}}`
- `{{responsavel_profissao}}`
- `{{responsavel_cpf}}`
- `{{responsavel_rg}}`
- `{{responsavel_cargo}}`
- `{{responsavel_email}}`
- `{{responsavel_telefone}}`

### Dados da contratada
- `{{contratada_razao_social}}`
- `{{contratada_nome_fantasia}}`
- `{{contratada_cnpj}}`
- `{{contratada_endereco}}`
- `{{contratada_representante_nome}}`
- `{{contratada_representante_cpf}}`

### Dados comerciais
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

### Prazo e pagamento
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

### Condição especial
- `{{tem_condicao_especial}}`
- `{{descricao_condicao_especial}}`
- `{{observacoes_comerciais}}`

### Assinatura e foro
- `{{plataforma_assinatura_nome}}`
- `{{url_plataforma_assinatura}}`
- `{{foro_cidade}}`
- `{{foro_estado}}`

---

## 3.2. Grupo B — Campos internos do sistema (NÃO renderizar no contrato)
Esses campos pertencem ao módulo contratual e ao SolarZap.

- `contract_draft_id`
- `contract_number`
- `contract_version`
- `template_version`
- `organization_id`
- `lead_id`
- `opportunity_id`
- `sales_session_id`
- `seller_user_id`
- `created_by_user_id`
- `last_updated_by_user_id`
- `generated_from`
- `embed_source`
- `embed_origin`
- `signature_provider`
- `signature_envelope_id`
- `contract_status`
- `signature_status`
- `automation_status`
- `preview_storage_path`
- `pdf_storage_path`
- `snapshot_json`
- `checksum_hash`
- `sent_to_signature_at`
- `signed_at`
- `cancelled_at`
- `archived_at`

Regra: **nenhum campo do Grupo B entra no texto jurídico final**, salvo decisão explícita do produto para campos como número do contrato ou versão.

---

# 4. Lógica condicional do gerador

## 4.1. Regra por plano

### Plano A — Essencial / Downsell
- implantação mais enxuta;
- sem acompanhamento semanal;
- sem suporte WhatsApp ampliado;
- sem landing page, salvo condição especial expressa;
- escopo mínimo e controlado.

### Plano B — Implantação Guiada
- 1 reunião de coleta e alinhamento;
- 1 mês de SolarZap;
- tráfego pago;
- treinamento base;
- sem suporte WhatsApp contínuo, salvo previsão expressa;
- sem landing page, salvo condição especial.

### Plano C — Implementação Completa
- tudo do Plano B;
- acompanhamento semanal durante a implantação;
- suporte via WhatsApp durante a implantação;
- possibilidade de reunião extra;
- possibilidade de landing page por condição especial.

## 4.2. Regra para condição especial
Se `{{tem_condicao_especial}} = sim`, o sistema deve:
- incluir anexo de condição especial;
- refletir isso no Resumo Comercial;
- aplicar as flags correspondentes do plano, quando necessário.

## 4.3. Regra da recorrência
A recorrência sempre faz parte do mesmo contrato.

O gerador deve sempre preencher:
- valor da implantação inicial;
- valor da recorrência mensal;
- data de início;
- vencimento mensal;
- regra de renovação;
- regra de cancelamento.

---

# 5. Estados do contrato

Estados mínimos obrigatórios:
- `draft`
- `review_ready`
- `preview_generated`
- `pdf_generated`
- `sent_for_signature`
- `signed`
- `cancelled`
- `expired`
- `failed`

## Regras de transição
- `draft` → edição livre autorizada
- `review_ready` → revisão final do usuário
- `preview_generated` → contrato renderizado
- `pdf_generated` → contrato exportado
- `sent_for_signature` → envio para assinatura
- `signed` → contrato concluído
- `cancelled` / `expired` → fluxo encerrado

---

# 6. Persistência obrigatória

O módulo contratual deve persistir:
- dados preenchidos no wizard;
- resumo comercial final;
- anexo do plano selecionado;
- anexo de condição especial, quando aplicável;
- snapshot do contrato preenchido;
- HTML do preview;
- PDF gerado;
- status do contrato;
- logs de geração e alteração;
- versão do template usada.

---

# 7. Ordem de precedência documental

Em caso de divergência, a precedência deve ser:

1. Resumo Comercial Final  
2. Condição Especial expressa  
3. Anexo do Plano  
4. Contrato-base  
5. Metadados internos do sistema (somente para fins operacionais, nunca para ampliar escopo jurídico)

---

# 8. Estrutura sugerida do contrato-base

## Cláusula 1 — Qualificação das partes
Inserir contratante e contratada com placeholders.

## Cláusula 2 — Definições
Definir SolarZap, Implantação Inicial, Continuidade Operacional, Plano Contratado, Condição Especial, Verba de Mídia e Resumo Comercial Final.

## Cláusula 3 — Objeto
Prestação de serviços de implantação comercial e continuidade operacional assistida, com metodologia ARKAN e plataforma SolarZap, conforme plano e anexos.

## Cláusula 4 — Plano contratado e anexos integrantes
Indicar plano e anexos aplicáveis.

## Cláusula 5 — Fase 1: Implantação Inicial
Descrever a lógica geral do primeiro mês.

## Cláusula 6 — Fase 2: Continuidade Operacional Recorrente
Descrever o que segue após a implantação.

## Cláusula 7 — Exclusões de escopo
Listar expressamente o que não está incluso.

## Cláusula 8 — Obrigações da contratante
Informações, acessos, veracidade, cooperação, mídia, pagamentos, operação comercial.

## Cláusula 9 — Obrigações da contratada
Implantação do escopo, reuniões, suporte, acesso ao SolarZap, melhores esforços.

## Cláusula 10 — Prazo, vigência e renovação
3 meses iniciais, renovação automática mensal após o ciclo inicial.

## Cláusula 11 — Remuneração, vencimento e inadimplência
Separar implantação inicial e recorrência.

## Cláusula 12 — Rescisão e cancelamento
Aviso prévio, permanência mínima, ausência de reembolso, suspensão por inadimplência.

## Cláusula 13 — Uso da plataforma, ativos e propriedade intelectual
Licença de uso, titularidade, limites, exportação de dados.

## Cláusula 14 — Proteção de dados e confidencialidade
LGPD, sigilo, proteção de dados.

## Cláusula 15 — Limitação de responsabilidade
Obrigação de meio, sem garantia de resultado.

## Cláusula 16 — Assinatura eletrônica
Plataforma eletrônica válida.

## Cláusula 17 — Disposições gerais
Tolerância, aditivos, nulidade parcial.

## Cláusula 18 — Foro
Foro eleito.

---

# 9. Anexos obrigatórios

## Anexo I — Plano A / Essencial
Campos mínimos:
- nome do plano;
- valor de implantação;
- valor recorrente;
- data de início;
- forma de pagamento;
- descrição objetiva do plano;
- reuniões;
- suporte;
- limites.

## Anexo II — Plano B / Implantação Guiada
Conteúdo mínimo:
- tráfego pago;
- 1 mês de SolarZap;
- treinamento base gravado;
- 1 reunião de coleta e alinhamento;
- implantação guiada;
- sem suporte ampliado, salvo registro expresso.

## Anexo III — Plano C / Implementação Completa
Conteúdo mínimo:
- tudo do Plano B;
- acompanhamento semanal;
- suporte via WhatsApp na implantação;
- reunião extra quando registrada;
- landing page quando registrada.

## Anexo IV — Condição Especial
Usar apenas quando houver condição especial ativa.

Campos mínimos:
- descrição da condição especial;
- validade dentro da contratação;
- regra de perda do bônus em caso de inadimplência ou ruptura, quando aplicável.

## Anexo V — Resumo Comercial Final
Espelho da contratação.

Campos mínimos:
- contratante;
- responsável;
- plano;
- valores;
- início;
- vencimento;
- reuniões;
- suporte WhatsApp;
- landing page;
- reunião extra;
- observações.

---

# 10. Campos do fluxo de formalização (wizard)

## Etapa 1 — Dados do responsável
- nome completo
- CPF
- RG
- nacionalidade
- estado civil
- profissão
- cargo
- e-mail
- telefone

## Etapa 2 — Dados da empresa
- razão social
- nome fantasia
- CNPJ
- logradouro
- número
- complemento
- bairro
- cidade
- estado
- CEP

## Etapa 3 — Plano contratado
- seleção do plano
- valor da implantação
- valor da recorrência
- quantidade de reuniões
- flags do plano

## Etapa 4 — Pagamento e vigência
- data de assinatura
- data de início
- primeiro vencimento
- dia mensal de vencimento
- forma de pagamento da implantação
- forma de pagamento da recorrência
- vigência inicial mínima
- prazo de cancelamento

## Etapa 5 — Condição especial e observações
- condição especial ativa?
- descrição da condição especial
- observações comerciais

## Etapa 6 — Revisão final
- resumo comercial final
- preview da renderização
- confirmação de geração

---

# 11. Campos que podem vir pré-preenchidos do contexto externo

O gerador deve aceitar prefill de:
- empresa;
- responsável;
- e-mail;
- telefone;
- plano sugerido;
- condição especial;
- vendedor responsável;
- sales_session_id.

Esses campos podem ser editáveis ou travados, conforme regra do produto.

---

# 12. Regras de governança e segurança

O sistema deve prever:
- quem pode criar contrato;
- quem pode editar draft;
- quem pode gerar PDF;
- quem pode enviar para assinatura;
- quem pode cancelar;
- quando criar nova versão em vez de sobrescrever;
- logs de todas as ações relevantes.

---

# 13. Entregável esperado do módulo contratual

Ao final da implementação, o sistema deve conseguir:

1. gerar um contrato draft;  
2. preencher contrato-base com placeholders;  
3. injetar anexo correto do plano;  
4. injetar condição especial;  
5. gerar preview;  
6. exportar PDF;  
7. persistir o resultado;  
8. preparar integração com assinatura e automações.
