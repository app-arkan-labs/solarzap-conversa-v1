# Plano de Ação — Redesign Premium de Login e Criação de Conta

> Data: 2026-03-16  
> Status: Proposta para implementação  
> Escopo: Portal de autenticação do app, com criação de conta no próprio fluxo e continuidade visual até billing

---

## 1. Objetivo

Redesenhar a experiência de `login`, `criação de conta`, `recuperação de senha` e `confirmação de email` para que ela deixe de parecer uma tela utilitária simples e passe a funcionar como o **portal premium de entrada do produto**.

O objetivo não é construir uma landing page. O foco é entregar uma experiência de acesso ao app que:

- transmita mais valor percebido logo na primeira tela;
- permita criação de conta sem sair do portal;
- conecte visualmente a etapa de autenticação com `pricing/billing` e `onboarding`;
- reduza sensação de quebra quando o usuário confirma o email e segue para o próximo passo;
- preserve clareza e leveza visual, sem excesso de elementos de marketing.

---

## 2. Diagnóstico do Estado Atual

## 2.1 Estrutura existente

Hoje a autenticação está concentrada principalmente em [src/pages/Login.tsx](../src/pages/Login.tsx), com três estados no mesmo card:

- `login`
- `signup`
- `forgot`

O visual base usa classes globais de [src/index.css](../src/index.css):

- `auth-shell`
- `auth-card`
- `brand-gradient-button`
- `brand-logo-disc`

O billing/pricing já tem linguagem mais forte e mais madura em [src/pages/Pricing.tsx](../src/pages/Pricing.tsx), com:

- hero mais editorial;
- superfícies premium com blur e gradientes sutis;
- melhor hierarquia visual;
- sensação de produto mais robusto.

## 2.2 Problemas percebidos

- A tela atual é funcional, mas parece um card isolado e pouco memorável.
- O fluxo de criação de conta não comunica claramente que o usuário está entrando em um produto premium.
- O layout não cria uma ponte visual forte com `billing`, que hoje já parece mais sofisticado.
- O estado pós-signup depende de toast, mas não existe uma etapa visual dedicada de `verifique seu email`.
- `UpdatePassword` reaproveita a mesma base, mas não existe ainda um shell compartilhado de autenticação com componentes consistentes.
- A página resolve autenticação, mas ainda não se posiciona como um verdadeiro `portal do app`.

## 2.3 Conclusão

O problema principal não é falta de funcionalidade. É falta de **sistema visual e de jornada** para auth.

---

## 3. Direção de Produto e UX

## 3.1 Princípio central

A página deve parecer a entrada de um software premium, não um formulário genérico.

## 3.2 O que isso significa na prática

- manter foco em autenticação, sem inflar a tela com blocos de marketing;
- trabalhar com uma composição de duas zonas: identidade do produto + área transacional;
- reforçar confiança, continuidade e clareza de próximo passo;
- usar o mesmo idioma visual já presente em `pricing` e `onboarding`;
- tratar `signup` e `confirm email` como partes da mesma jornada, não como eventos desconectados.

## 3.3 Experiência-alvo

Fluxo esperado:

```text
Chegada em /login
  -> visão premium do portal
  -> login ou criação de conta sem trocar de contexto
  -> conta criada
  -> estado visual de verificação de email dentro do mesmo shell
  -> clique no email
  -> retorno ao app com continuidade visual para onboarding ou billing
```

---

## 4. Conceito Visual Recomendado

## 4.1 Estrutura de layout

Trocar o card único centralizado por um `Auth Portal Shell` com duas áreas complementares:

- coluna esquerda ou topo em mobile: narrativa curta de produto, marca, diferenciais e sinais de confiança;
- coluna direita ou bloco principal: formulário e estados transacionais.

Essa composição deve continuar leve, com bastante respiro. A parte institucional não deve competir com o formulário.

## 4.2 Elementos visuais recomendados

- fundo com profundidade, usando gradientes e halos mais sofisticados que o `auth-shell` atual;
- superfícies translúcidas no mesmo idioma de `public-hero-surface` e `app-shell-bg`;
- tipografia mais refinada na hierarquia de títulos e subtítulos;
- destaque para logo e assinatura da marca;
- uso contido de badges, microcopy e indicadores de progresso de jornada;
- animações discretas de entrada e transição entre estados.

## 4.3 Linguagem visual que deve ser herdada de billing

O redesign deve herdar de [src/pages/Pricing.tsx](../src/pages/Pricing.tsx):

- gradientes quentes com acento premium;
- hero com texto mais confiante;
- superfícies arredondadas com sombra suave e blur;
- badges de contexto e blocos informativos com aparência de produto consolidado.

## 4.4 O que evitar

- visual de landing page com excesso de cards e promessas;
- excesso de ícones ou métricas publicitárias;
- blocos longos de texto;
- imagens decorativas pesadas que distraiam do login;
- mudança visual tão radical que pareça outro produto ao chegar em billing.

---

## 5. Nova Arquitetura de Experiência

## 5.1 Estados que devem existir no portal

Além dos estados atuais, o portal deve suportar explicitamente:

- `login`
- `signup`
- `forgot-password`
- `verify-email-pending`
- `email-confirmed-loading`
- `access-blocked-or-next-step` quando houver redirecionamento para billing, onboarding ou seleção de organização

## 5.2 Mudança importante de jornada

Após `signUp`, em vez de depender apenas de toast e voltar silenciosamente para `login`, o fluxo deve ir para um estado dedicado de `verifique seu email`, dentro do mesmo shell visual.

Esse estado deve mostrar:

- email cadastrado;
- instrução clara do próximo passo;
- feedback de reenvio;
- observação de spam/lixeira;
- expectativa do que acontece depois da confirmação.

## 5.3 Continuidade até billing

Quando o usuário confirmar o email e avançar para o passo seguinte, a sensação deve ser de continuação do mesmo produto. Para isso:

- auth e billing devem compartilhar a mesma base visual;
- badges, gradientes, sombra e tom de copy devem conversar entre si;
- se houver `plan hint`, isso precisa aparecer no portal como continuidade contextual;
- se o próximo passo for checkout, o usuário não pode sentir salto de linguagem.

---

## 6. Proposta Técnica de Implementação

## 6.1 Criar um shell compartilhado de autenticação

Criar um componente base, por exemplo:

- `src/components/auth/AuthPortalShell.tsx`

Responsabilidades:

- controlar layout premium do portal;
- renderizar zona institucional e zona transacional;
- suportar variações por estado;
- centralizar fundos, superfícies e espaçamento;
- servir também para `UpdatePassword` e futuros estados de confirmação.

## 6.2 Extrair componentes de UI de auth

Criar componentes menores para evitar que [src/pages/Login.tsx](../src/pages/Login.tsx) continue concentrando layout, estado e fluxo:

- `AuthPortalHeader`
- `AuthModeTabs` ou seletor de modo
- `AuthBenefitRail`
- `LoginForm`
- `SignupForm`
- `ForgotPasswordForm`
- `VerifyEmailState`
- `AuthContextBadge` para plano, etapa ou origem do fluxo

## 6.3 Evoluir o modelo de estado da página

O tipo atual:

```ts
type ViewMode = 'login' | 'signup' | 'forgot';
```

deve evoluir para um modelo que represente estados reais da jornada, incluindo confirmação de email e carregamentos pós-confirmação.

## 6.4 Reaproveitar e ampliar os tokens visuais existentes

Expandir [src/index.css](../src/index.css) com classes específicas de auth premium, evitando duplicar estilos diretamente no JSX:

- `auth-portal-shell`
- `auth-portal-panel`
- `auth-portal-aside`
- `auth-portal-form-surface`
- `auth-portal-glow`
- `auth-status-card`

Objetivo: alinhar auth com `pricing` sem copiar e colar trechos visuais ad hoc.

## 6.5 Aplicar o mesmo shell em UpdatePassword

[src/pages/UpdatePassword.tsx](../src/pages/UpdatePassword.tsx) deve migrar para o mesmo `AuthPortalShell`, com variação de conteúdo.

Isso garante consistência nos fluxos:

- login
- criar conta
- redefinir senha
- confirmação intermediária

---

## 7. Escopo Funcional do Redesign

## 7.1 Login

Melhorias propostas:

- cabeçalho com mais presença de marca;
- organização visual superior dos campos;
- link de recuperação com mais destaque sem poluir;
- indicação contextual quando o usuário veio de plano em `pricing`.

## 7.2 Criação de conta

Melhorias propostas:

- formulário com percepção de maior valor;
- comunicação mais clara sobre o que acontece após criar a conta;
- estado dedicado de confirmação de email;
- preservação do `plan hint` quando o usuário iniciou pela seleção de plano.

## 7.3 Recuperação de senha

Melhorias propostas:

- estado menos improvisado, usando o mesmo nível visual dos demais;
- melhor feedback de envio;
- texto curto e objetivo sobre o próximo passo.

## 7.4 Confirmação de email

Melhoria central do projeto:

- transformar confirmação de email em uma etapa visível do portal, e não apenas em toast;
- mostrar reenvio automático/manual de forma mais previsível;
- explicar ao usuário se o próximo destino será onboarding, billing ou acesso direto.

---

## 8. Arquivos Impactados

Arquivos prováveis para implementação:

- [src/pages/Login.tsx](../src/pages/Login.tsx)
- [src/pages/UpdatePassword.tsx](../src/pages/UpdatePassword.tsx)
- [src/index.css](../src/index.css)
- [src/pages/Pricing.tsx](../src/pages/Pricing.tsx) apenas para alinhamento fino, se necessário
- [src/components/onboarding/OnboardingWizardShell.tsx](../src/components/onboarding/OnboardingWizardShell.tsx) apenas se for necessário ajustar continuidade visual

Novos arquivos recomendados:

- `src/components/auth/AuthPortalShell.tsx`
- `src/components/auth/AuthBenefitRail.tsx`
- `src/components/auth/AuthContextBadge.tsx`
- `src/components/auth/VerifyEmailState.tsx`
- `src/components/auth/forms/LoginForm.tsx`
- `src/components/auth/forms/SignupForm.tsx`
- `src/components/auth/forms/ForgotPasswordForm.tsx`

---

## 9. Plano de Execução

## Fase 1 — Definição visual e estrutural

- definir referência visual do portal premium com base no idioma de `pricing`;
- aprovar wireframe de desktop e mobile;
- aprovar quais sinais institucionais entram no shell sem virar landing page.

Entregável:

- blueprint visual do `Auth Portal Shell`.

## Fase 2 — Refatoração estrutural do auth

- extrair shell compartilhado;
- quebrar [src/pages/Login.tsx](../src/pages/Login.tsx) em componentes menores;
- padronizar zonas de layout, espaçamento e responsividade;
- migrar [src/pages/UpdatePassword.tsx](../src/pages/UpdatePassword.tsx) para o novo shell.

Entregável:

- nova base técnica do auth pronta para evoluções.

## Fase 3 — Redesign dos estados transacionais

- redesenhar `login`, `signup` e `forgot-password`;
- adicionar estado explícito de `verify-email-pending`;
- melhorar feedbacks de erro, loading e reenvio;
- reforçar continuidade com `plan hint` e próxima etapa do fluxo.

Entregável:

- jornada completa de autenticação dentro do mesmo portal.

## Fase 4 — Continuidade com billing e onboarding

- alinhar microcopy e componentes de contexto com `pricing`;
- revisar transição visual ao sair do auth para `billing` ou `onboarding`;
- ajustar detalhes finos de gradiente, hero, badge e superfícies.

Entregável:

- experiência contínua entre autenticação e próxima etapa do produto.

## Fase 5 — QA e validação

- validar desktop e mobile;
- validar estados com `mode=signup` e `plan` na query string;
- validar reenvio de confirmação;
- validar acessibilidade básica de foco, contraste e teclado;
- validar consistência com tema atual do app.

Entregável:

- redesign pronto para produção.

---

## 10. Critérios de Aceite

O redesign só deve ser considerado concluído quando:

- a página transmitir percepção de produto premium sem parecer landing page;
- login, signup e recuperação estiverem visualmente integrados;
- existir estado explícito de `verifique seu email` dentro do portal;
- a transição para billing ou onboarding parecer continuação do mesmo sistema;
- a experiência funcionar bem em mobile e desktop;
- [src/pages/Login.tsx](../src/pages/Login.tsx) estiver estruturalmente mais simples e menos monolítico;
- [src/pages/UpdatePassword.tsx](../src/pages/UpdatePassword.tsx) compartilhar o mesmo sistema visual.

---

## 11. Riscos e Cuidados

- Não transformar auth em tela de marketing. O foco precisa continuar sendo conversão para acesso.
- Não introduzir excesso de animação que atrase a interação.
- Não duplicar lógica de autenticação durante a refatoração visual.
- Não quebrar o fluxo de `plan hint`, que hoje conecta `pricing` com `login`.
- Não criar divergência entre auth premium e o restante do app; o redesign precisa puxar billing para perto, não se afastar dele.

---

## 12. Recomendação Final

Executar o redesign como **refatoração de experiência + sistema visual compartilhado**, e não como simples maquiagem em [src/pages/Login.tsx](../src/pages/Login.tsx).

O melhor caminho é construir um `Auth Portal Shell` reutilizável, inserir o estado visual de `verificação de email` e alinhar auth com a linguagem já mais madura de [src/pages/Pricing.tsx](../src/pages/Pricing.tsx).

Essa abordagem resolve o problema principal: fazer o usuário sentir que entrou em um produto premium desde o primeiro contato e continuar percebendo essa qualidade quando avançar para billing.