# Plano — Arena Leste Multi Sports

## Objetivo e limites

Integrar a nova versão enviada em `arena-leste-projeto.zip` ao site já operacional da Arena Leste, sem trocar a stack TanStack Start/React 19/Vite/Tailwind v4, as duas origens de deploy no Render, o domínio atual ou o PostgreSQL Neon. O ZIP é referência de identidade visual, vídeos, copy, fluxo e módulos; não substituir o app por seu HTML de hash nem portar o `localStorage` inseguro. Preservar o login existente, as oito quadras atuais (quatro por unidade), as reservas legadas e a pré-inscrição do Torneio Novembro Azul. Manter o plano gratuito.

## Design e experiência

- **Design Movement:** reprodução fiel da direção original enviada no ZIP — hero, navegação, fita, campanha, paleta, tipografia, microinterações e módulos — portada para marcação React para que todos os controles continuem funcionais com o banco real.
- **Princípios centrais:** (1) vídeo e copy específicos da Arena como ponto focal; (2) navegação e reserva imediatamente encontráveis; (3) superfícies e módulos administrativos claros, sem transformar tudo em cartões idênticos; (4) mobile, acessibilidade e rapidez desde o primeiro carregamento.
- **Filosofia de cor — 6 valores principais:** papel quente `#FFF9F2` (fundo editorial), branco `#FFFFFF` (superfícies), tinta `#1A1210` (texto de alta leitura), taupe `#6B5F57` (texto secundário), laranja `#DF4F07` (cor proprietária/ações da Arena, com texto escuro nos botões) e azul `#2457D6` (bloco do Novembro Azul, com branco). Para texto pequeno laranja em superfícies claras, usar o tom derivado acessível `#AD4306`; no hero audiovisual, usar superfície derivada navy `#11171E`, texto creme e laranja original nos títulos grandes. Manter verde apenas em WhatsApp e estados de sucesso.
- **Tipografia:** Barlow Condensed 800/itálica para títulos curtos e esportivos; Barlow para leitura, formulários e interface; JetBrains Mono em metadados compactos, códigos e horários. Escala fluida com `clamp()`, parágrafos com largura confortável, títulos `text-wrap: balance` e números tabulares.
- **Paradigma de layout:** faixas e alinhamento à esquerda, com um hero audiovisual assimétrico; linhas editoriais para as duas unidades; campanha destacada como cartaz azul; formulários com uma tarefa por etapa e resumo sticky apenas em telas grandes; o admin usa uma navegação por módulos no desktop e trilho horizontal no celular. Wireframe:

```text
[ faixa Novembro Azul · data · inscrição rolando, parada em movimento reduzido ]
[ logo ] [ Unidades | Torneio | Contato ]                     [ Agendar ]
[ hero: “Bora pra areia?” + contexto Porto Velho | vídeo real + bola interativa ]
[ botões de reserva Unidade 1 / Unidade 2 ]
[ Unidades: duas linhas editoriais + mapa e endereços ]
[ Novembro Azul: vídeo do torneio + countdown + premiação + inscrição ]
[ Instagram / WhatsApp / endereços / rodapé ]

/reservar: 01 Unidade e quadra → 02 Dia → 03 Horário → 04 Seus dados → confirmação
            etapas empilhadas no mobile; resumo lateral no desktop
/admin: módulos (Geral, Agenda e reservas, Quadras e horários, Torneio,
        Contato, Backup, Histórico) → um painel ativo por vez
```

- **Elementos de assinatura:** logo oficial já existente, linhas de quadra em traço laranja, abreviações monoespaçadas em agenda e imagens do esporte fornecidas pelo usuário. Evitar repetição de cards arredondados.
- **Interação:** chamadas de ação levam à reserva interna com unidade pré-selecionada; selecionar hora e receber resposta é direto, com feedback em menos de 100 ms. Mapa e canais sociais permanecem acessíveis; WhatsApp é opcional e não abre o fluxo de reserva.
- **Animação e movimento:** reproduzir intro, bola interativa, fita rolante, reveal e CTA que acompanha o cursor do ZIP; a bola/CTA continuam focáveis e acessíveis ao toque. Vídeos sem áudio, com poster imediato e carregamento sob demanda/visibilidade; ribbon e movimento respeitam `prefers-reduced-motion`. Em movimento reduzido, manter poster estático e conteúdo completo. Nenhuma informação depende de animação para ser compreendida.
- **Essência da marca:** o ponto de encontro de vôlei e esportes de areia de Porto Velho, com duas unidades e reserva direta no site; personalidade ativa, acolhedora e direta.
- **Voz:** português brasileiro coloquial e específico, sem horários ou endereços tratados como confirmados quando não foram. Exemplos: “Bora pra areia?” / “Escolha a unidade e marque seu próximo jogo.”
- **Logo e cor proprietária:** manter o arquivo oficial `src/assets/arena-leste-logo.webp`, que corresponde à identidade do logo menor do ZIP; laranja `#DF4F07` é a assinatura da Arena.

## Integração técnica do ZIP

- Continuar servindo as rotas reais `/`, `/reservar`, `/torneio` e `/admin` pelo TanStack Router. Não copiar o shell `index.html` de três telas com hash; manter SEO, manifesto de rotas, proxy `/api/*`, frontend estático e API Node atuais.
- Copiar o CSS original do ZIP para `src/arena-zip.css` e reproduzir sua estrutura e copy nas rotas React com componentes acessíveis; não carregar o HTML/JavaScript legado como scripts nem usar o `localStorage` do protótipo.
- Aparar os primeiros 1,25 s do clipe do hero, que mostram contatos antigos, e usar poster limpo. Incluir também o vídeo original do campeonato de 60 fps no bloco Novembro Azul e em sua página, sem a tarja azul em tela cheia; retocar somente o telefone antigo da placa original, mantendo título, data e CTA na camada React, fora do vídeo. Publicar apenas os derivados comprimidos em `public/videos/` e seus posters leves em `public/images/`; os originais do ZIP permanecem intactos. Manter `preload=none`, reprodução sob `IntersectionObserver`, sem áudio e poster estático para movimento reduzido.
- Reimplementar o agendamento como wizard de quatro etapas (unidade/quadra, dia, horário, dados e pagamento), mantendo seleção entre as quatro quadras disponíveis em cada unidade, observações opcionais, horários/preços do Neon, validação final no servidor, idempotência, conflito transacional, Pix demonstrativo e confirmação no próprio site.
- Organizar o painel autenticado em módulos React. Reutilizar as APIs existentes para reservas atuais, quadras, grade semanal, torneio e histórico; acrescentar cópia autenticada da grade semanal entre unidades e exportação JSON de backup somente para admin. Manter contatos e dados do evento que são fonte oficial como leitura; preço, estado/nome/duração das quadras e janelas semanais editáveis no admin.
- O protótipo local do ZIP permite `localStorage`, importação livre, apagar todos os registros e restaurar dados de exemplo. Não copiar esses controles destrutivos para produção: importar ou zerar reservas reais pode prejudicar clientes. O módulo de backup no site real será exportação; cancelamentos individuais/de grupo continuam disponíveis com confirmação.
- A migração aditiva `0008_cancelled_slot_offers.sql` cria ofertas temporárias para horários cancelados: apenas unidade/quadra/data/faixas de horário e timestamps, sem nome, telefone, CPF, endereço ou código do cliente. A oferta expira em 12 horas, deixa de aparecer se algum horário for ocupado e é reivindicada na mesma transação que grava a nova reserva. A leitura pública retorna somente esses campos não pessoais; cancelamento e gravação são validados no servidor.
- O cancelamento administrativo calcula no servidor se o primeiro horário começa em até 24 horas; sem confirmação explícita, a operação é recusada. Para quadras reais, cancelar e gravar a oferta acontecem na mesma transação; reservas legadas sem unidade não geram oferta pública.
- Novas funções de exportação/cópia passam por `requireAdmin()`, SQL parametrizado e auditoria; dados pessoais continuam restritos ao painel autenticado.

## Reservas e regras

- O visitante inicia e conclui a reserva dentro do site. WhatsApp aparece apenas como canal opcional, especialmente após a gravação; não redirecionar no primeiro passo.
- O público vê somente quadras ativas com preço configurado e slots permitidos pela grade semanal. As configurações atuais da base começam fechadas e sem preço para não inventar valores ou horários da Arena.
- Atividade comunicada: vôlei de praia. Observações podem informar outra atividade própria para areia, sem promover modalidade oficial não confirmada.
- Não alterar a lógica existente do Torneio Novembro Azul nem seu formulário/tabela: data de 28/11/2026 às 15h, quarteto masculino, R$150 por equipe, até seis integrantes contando o capitão, premiação de R$800/R$400/R$200 com troféu e medalhas, sem cobrança online.

## Segurança e continuidade

- Reusar sessão admin HttpOnly/Secure, `requireAdmin()`, queries parametrizadas, schemas Zod, rate limit, auditoria, idempotência e validação final de conflito. Nenhum endpoint público retorna dados pessoais.
- Manter `/api/*` no Web Service Node e banco/segredos só no servidor; não expor contatos antigos que aparecem no material audiovisual.
- Manter Render/Neon nos planos atuais, domínio e endpoints existentes; otimizar assets para não aumentar o carregamento inicial.

## Estrutura principal

- `src/routes/index.tsx`: home editorial, hero, ribbon, torneio, unidades e mapa.
- `src/routes/reservar.tsx`: wizard online de quatro etapas conectado a `getSpaces`, `getAvailability` e `createBooking`.
- `src/routes/admin.tsx`: sessão e navegação modular; arquivo legado claramente separado e contato oficial somente leitura.
- `src/lib/admin-navigation.ts`: lista tipada dos sete módulos administrativos e seus ícones.
- `src/components/AdminOverview.tsx`: indicadores reais e atalhos da operação.
- `src/components/CurrentBookingsAdmin.tsx`: agenda diária, busca, filtro de status e ações em grupos.
- `src/components/ArenaSettingsAdmin.tsx`: edição de quadras, preços, duração, ativação e grade semanal.
- `src/components/AdminDataBackup.tsx`: exportação autenticada e explícita de JSON com alerta de dados pessoais.
- `src/components/TournamentRegistrationsAdmin.tsx`: listagem autenticada e atualização de status das pré-inscrições.
- `src/components/LazyLoopVideo.tsx`: poster imediato e reprodução adiada dos vídeos de hero e campanha.
- `src/components/TournamentCountdown.tsx`: countdown compartilhado entre a home e a página do evento, com data ISO centralizada.
- `src/components/ReleasedSlotsNotice.tsx`: aviso flutuante em páginas públicas; diálogo detalha somente unidade, quadra, data e horários e leva ao formulário pré-preenchido.
- `src/lib/arena.functions.ts`: server functions de disponibilidade, gravação, admin, cópia de grade e backup exportável.
- `src/lib/arena-rules.ts`: fuso, slots e validações compartilhadas.
- `src/lib/site.ts`: identidade, unidades, canais e conteúdo oficial da campanha.
- `public/videos/` e `public/images/`: versões tratadas dos assets enviados, sem introduzir contatos desatualizados.
- `drizzle/migrations/0003_arena_units_and_hours.sql`: catálogo de quadras/grade já aplicado.
- `drizzle/migrations/0008_cancelled_slot_offers.sql`: armazenamento aditivo de ofertas; requer aplicação no Neon antes de ativar a função.
- `src/styles.css`, `vite.config.ts` e `vite.static.config.ts`: tokens, estilos e builds atuais dos serviços Render.


## Extensão solicitada — galeria de fotos 3D

- **Posição e aparência:** inserir uma seção escura de galeria entre a faixa do campeonato e as unidades, preservando o laranja `#DF4F07`, os títulos esportivos Barlow Condensed e o restante do visual já aprovado.
- **Movimento:** adaptar a referência do vídeo/HTML anexado para uma esteira de fotos 3D controlada pela rolagem natural da página. O palco fica sticky por uma sequência longa; as fotos passam de uma perspectiva diagonal para a posição frontal, ampliam ao chegar ao foco e a última termina de frente antes de a rolagem normal prosseguir ao restante do site. Não interceptar/travar o scroll, não iniciar autoplay e não depender de WebGL.
- **Mobile e acessibilidade:** reduzir a extensão da sequência e o raio 3D em celular; manter alvos e texto legíveis, lista acessível das fotos e uma grade estática para `prefers-reduced-motion`/fallback sem animação.
- **Conteúdo real:** fotos enviadas pelo admin são o conteúdo da galeria; não apresentar posters promocionais ou imagens ilustrativas como se fossem fotos reais da Arena. Antes de haver quatro fotos publicadas, manter a seção sem esteira e orientar que ela será ativada após a inclusão das imagens.
- **Armazenamento e leveza:** não há serviço de objetos configurado no Render; persistir fotos em uma tabela própria do Neon, como WebP binário após otimização no navegador (largura máxima de 1.600 px, até 600 KiB por imagem), mantendo metadados e entrega por rota de imagem com cache. Limitar a biblioteca a 50 registros e a apresentação simultânea a 12 fotos publicadas; os limites preservam a hospedagem e a transferência atuais.
- **Administração:** acrescentar um módulo autenticado “Galeria de fotos” para enviar imagens, editar título/descrição alternativa, ordenar, publicar/ocultar e excluir com confirmação. Aplicar o limite de 12 fotos publicadas também no servidor, proteger uploads por sessão/admin e registrar alterações no log de auditoria.
- **Estrutura principal:** `src/components/PhotoConveyorGallery.tsx` apresenta a galeria pública; `src/components/PhotoGalleryAdmin.tsx` gerencia a biblioteca; `src/routes/api.gallery.$id.ts` serve os binários com MIME seguro; `src/lib/arena.functions.ts` fornece listagem e operações autenticadas; migration aditiva `0009_photo_gallery.sql` adiciona tabela e índices. Render/Neon e as rotas existentes permanecem intactas.


## Extensão solicitada — CTA, galeria paginada, perfis/auditoria e WMS

- **CTA e galeria:** logo após a inscrição do Novembro Azul, inserir o texto exato “Clique no botão para achar sua foto<br>e postar nas redes sociais” e o botão “Ache aqui sua foto!”. Criar `/fotos` com busca, filtro por quadra, download, carregamento incremental e paginação por cursor, suportando 200+ fotos por evento.
- **Persistência de fotos:** não gravar no disco temporário do Render. A primeira implementação preserva bytes em armazenamento persistente do banco já conectado; o índice terá evento, quadra, URLs/objetos, dimensões e estado de publicação para permitir migração posterior a object storage sem quebrar a API.
- **Perfis:** Caixa (4 contas; geral/estoque), Mídia (2 contas; geral/fotos) e Admin Master (1 conta; todos os módulos, usuários e auditoria). O frontend filtra o menu, mas todo endpoint repete a autorização no servidor.
- **Auditoria:** cada escrita de agenda, horários, fotos, usuários e estoque registra ator, papel, módulo, ação, entidade, antes/depois e data em tabela append-only. A leitura “Alterações feitas” é exclusiva do Admin Master.
- **WMS:** preparar superfície `/estoque` para o preview e arquitetura de serviço separado. Produto inclui SKU, custo, venda e estoque mínimo; Caixa vê somente preço de venda e saldo; Admin Master vê custo, margem, preço e histórico. Saídas usam transação e bloqueio de linha para nunca permitir saldo negativo em concorrência.
- **Subdomínio:** `estoque.arena-leste.com.br` não será considerado publicado até haver configuração de DNS, serviço Render separado e uma estratégia de sessão realmente compartilhável entre origens do domínio pai. O preview usa a mesma autorização server-side sem fingir que o cookie atual funciona em outro domínio.
- **Validação:** manter alterações no branch/preview; testar visual em desktop/mobile e tentar acessar auditoria, usuários e custo/margem com Caixa antes de qualquer deploy do código.


## Fase final — Perfis administrativos, auditoria e gestão de acessos

**Assunto/público/ação principal:** painel administrativo da Arena Leste para Master, Caixa e Mídia; cada pessoa entra com seu próprio usuário e vê somente os módulos autorizados.

**Escolha de design:** manter o painel operacional atual, com fundo escuro, acento laranja Arena, tipografia condensada e navegação lateral; adicionar uma faixa de identidade do usuário e uma área de gestão do Master com tabelas legíveis, estados de permissão claros e sem alterar o estilo existente.

### Arquitetura

- Criar `admin_users` com username, nome de exibição, hash de senha, perfil (`master`, `caixa`, `midia`), ativo e timestamps.
- Associar `admin_sessions` ao usuário autenticado, mantendo compatibilidade com sessões Master legadas.
- Centralizar `requireAdminContext()` e `requireAdminRole()` no backend; esconder abas no frontend não será a única proteção.
- Atualizar o login `/admin` para aceitar nome de usuário e senha. O login legado com a senha administrativa atual cria/associa o usuário Master para a transição.
- Criar endpoints Master-only para listar usuários, criar/renomear/desativar contas e alterar senhas; cada operação grava auditoria.
- Criar endpoint Master-only para consultar todas as alterações administrativas com nome do usuário, horário, módulo, ação e detalhes.
- Aplicar matriz: Caixa → Visão geral, Reservas, Horários; Mídia → Agenda, Torneio, Galeria; Master → todos os módulos, Alterações feitas e Gerenciar acessos.
- Enforce no backend: Caixa não acessa agenda/torneio/galeria/usuários/auditoria; Mídia não acessa reservas/horários/usuários/auditoria; somente Master gerencia acessos e vê auditoria completa.

### UI

- Login com campos Usuário e Senha.
- Sidebar filtrada pelo perfil, com perfil/nome no topo e indicação de acesso.
- Aba `Alterações feitas`: tabela responsiva com usuário, data/hora, módulo, ação e detalhes.
- Aba `Gerenciar acessos`: sete posições (1 Master, 4 Caixa, 2 Mídia), username, nome, status, troca de senha e ativação/desativação.
- Preservar visual de cartões arredondados, preto/roxo profundo, laranja e fonte condensada.

### Depois desta fase

Otimizar a renderização e consultas de Visão geral e Auditoria com carregamento sob demanda, consultas agregadas e paginação, conforme pedido do usuário.


## Extensão solicitada — mobile prioritário e avisos push de reservas

- **Home para celular:** manter a direção de arte existente da Arena. Reduzir navegação para duas faixas curtas; alinhar logo e botão “Agendar” na primeira faixa e os atalhos em uma linha. Encaixar no hero, sem animação de entrada que atrase o toque, o título “Bora pra areia?”, a frase institucional, “Escolher meu horário”, “Ver unidades”, “Reveja suas jogadas e compartilhe” e a chamada “Alugue mais, pague menos”. O menu flutuante de WhatsApp mantém a área de clique somente nos próprios controles; a caixa recolhida não pode bloquear o conteúdo.
- **CTA principal:** usar destino direto `/reservar?unit=unidade-1`, com comportamento de link HTML compatível com navegação móvel; testar toque pelo Playwright nos viewports de 390×844 e 375×667.
- **Reserva:** reduzir densidade de cabeçalho, cards, calendário e opções, mantendo conteúdo essencial. Ao selecionar uma data, recolher o calendário e exibir uma ação “Alterar data”; horários permanecem no mesmo passo, promoção segue entre data e horários, e o resumo/progresso/ações de etapa ficam acessíveis. Preservar a rolagem quando a quantidade de horários ou os campos do formulário excederem a altura útil; não truncar informação nem fingir que o cadastro completo cabe em telas baixas.
- **PWA:** publicar `public/manifest.webmanifest` com `display: standalone`, ícone Arena já existente e `start_url` `/`; servir `public/sw.js` para receber Web Push e abrir `/admin` ao tocar na notificação. Revalidar o cache do manifesto e do service worker.
- **Permissão e admin:** mostrar o controle push somente a contas com papel `master`; cada server function repete `requireAdminRole(["master"])`. Solicitar permissão exclusivamente após o clique explícito no botão. Permitir remover a assinatura do dispositivo; não enviar push de teste.
- **Dados e mensagem:** após a transação criar uma reserva nova, enviar de forma tolerante a falhas somente nome, data da reserva, unidade “Cuniã” ou “Pinheiro Machado” e faixas contíguas de horas alugadas. Nunca incluir valor, telefone, CPF, endereço, observações ou campos de pagamento. Repetições idempotentes não geram um segundo aviso. Os envios dirigem-se somente a assinaturas atuais de contas Master ativas.
- **Servidor:** armazenar endpoint e chaves da assinatura na nova migração aditiva `drizzle/migrations/0014_admin_push_subscriptions.sql`, sem modificar reservas. As chaves VAPID ficam fora do repositório e devem ser configuradas no Web Service `arena-elsinho` como `WEB_PUSH_PUBLIC_KEY` e `WEB_PUSH_PRIVATE_KEY` antes de habilitar a ativação em produção. O frontend nunca recebe a chave privada.
- **Compatibilidade e transparência:** documentar que iOS/iPadOS 16.4 ou posterior exige o site adicionado à Tela de Início e permissão iniciada por toque; atualizar a Política de Privacidade para explicar o serviço de push do navegador e a presença possível na tela bloqueada.

### Estrutura adicionada

- `src/components/MasterPushNotifications.tsx`: ação master-only para habilitar/desabilitar o dispositivo e explicar a compatibilidade iOS.
- `src/lib/admin-push.functions.ts`: server functions com autorização master para consultar/configurar/remover assinaturas.
- `src/lib/admin-push.service.ts`: armazenamento e entrega Web Push no Node, com limpeza de endpoints expirados e sem depender do sucesso do envio para salvar a reserva.
- `src/lib/push-notification-content.ts`: formatação pura com lista de campos permitidos e junção de intervalos contínuos.
- `public/manifest.webmanifest` e `public/sw.js`: contrato PWA, recepção em segundo plano e abertura segura do painel ao tocar.
- `drizzle/migrations/0014_admin_push_subscriptions.sql`: armazenamento privado e aditivo das assinaturas administrativas.

## Extensão solicitada — agenda confirmada e Admin mobile

- **Janelas públicas:** segunda a sexta-feira, 19:00–23:00; sábado e domingo, 15:00–23:00. Aplicar os mesmos intervalos às duas unidades na grade semanal persistida, preservando exceções de datas que o Admin tenha configurado explicitamente.
- **Preço e promoção:** tarifa-base de R$60 por hora; somente Pix ou dinheiro recebem promoção: acima de duas horas, R$40/h de domingo a quarta e R$45/h de quinta a sábado; exatamente duas horas de quinta a sábado, iniciando às 19h ou 21h, custam R$90. Revisar cálculo server-side, resumo do cliente e cada mensagem promocional; não apresentar mais tarifa base de R$50 nem horários promocionais antigos.
- **Confirmação e ocupação:** reservas de clientes só participam da ocupação depois que o backend verifica com o provedor o pagamento correspondente à entrada de 30% ou ao valor integral. Reservas `pending`, canceladas, expiradas ou com cobrança ainda não confirmada não bloqueiam a disponibilidade pública nem a restrição de exclusão do banco. Não haverá retenção durante o checkout. Confirmações concorrentes serão serializadas por quadra/data; a primeira confirmação elegível bloqueia o horário, e um pagamento confirmado em conflito permanece em revisão para estorno manual, sem confirmar o horário nem simular reembolso automático.
- **Reserva manual Master:** adicionar, na aba Reservas, formulário protegido server-side exclusivamente ao Admin Master, que permite escolher unidade/quadra, data e qualquer intervalo compatível com a duração configurada entre 13:00 e 24:00, em qualquer dia da semana. Os únicos dados pessoais pedidos são nome e telefone. Essa reserva tem origem administrativa explícita, bloqueia o horário imediatamente como exceção autorizada e pode ser cancelada; não criar nem registrar pagamento fictício.
- **Experiência móvel do Admin:** preservar os módulos e a identidade visual existente; tornar navegação, identificação do módulo, ações de sessão, formulários e listas legíveis e utilizáveis em smartphones, com áreas de toque adequadas, cartões substituindo tabelas largas, hierarquia de status/ação clara, e estados de carregamento/erro/vazio fáceis de entender. A revisão de fluxo da aba Reservas segundo o BellaSys fica para uma solicitação futura; esta entrega cobre a reserva manual e responsividade geral, sem imitar o BellaSys.
- **Estrutura principal:** estender `src/lib/arena.functions.ts` para confirmação, conflito, disponibilidade e criação Master; `src/lib/arena-rules.ts` e seus testes para preços/horários; `src/components/CurrentBookingsAdmin.tsx` e `src/routes/admin.tsx` para reserva manual e mobile; ajustar os componentes administrativos e CSS responsivos existentes; criar migração aditiva em `drizzle/migrations/` para origem manual e nova regra de exclusão, sem reescrever histórico de pagamentos.

### Fechamento e publicação (24/11/2026)

- Implementação publicada em `main`, commit `d0ae6a455eea201445a51f39826e57c972232bf6`; o mesmo hash está em `origin/main`. Os deploys Render do site estático e do backend estão `live` e vinculados a esse commit.
- Smoke test sem escrita: `/reservar` e a raiz do backend responderam HTTP 200 em aproximadamente 0,9 s. Na agenda pública, a quarta-feira 25/11/2026 exibiu 19:00–23:00 e o sábado 28/11/2026 exibiu 15:00–23:00; promoção e base R$60/h estavam visíveis. Nenhum horário foi selecionado e nenhum formulário/checkout foi enviado.
- A migration `0015_manual_bookings_and_payment_confirmed_occupancy.sql` foi previamente validada numa cópia temporária e aplicada em produção após confirmação do usuário. Foram inspecionados os metadados resultantes sem gravar reservas fictícias ou realizar pagamentos.
- Testes: 63/63; builds do app e estático, lint dos arquivos alterados e `git diff --check` passaram. O lint global continua com 450 problemas de Prettier em arquivos alheios ao diff. A responsividade mobile foi revisada no código, mas não houve emulação de viewport nem teste em aparelhos físicos nesta sessão.
- O journal de migrations Drizzle continua deliberadamente sem alterações porque está defasado e a base não possui `__drizzle_migrations`; não executar o migrador automático sem reconciliação.
