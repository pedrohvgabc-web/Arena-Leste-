# Arena Leste Multi Sports

Site público da Arena Leste em Porto Velho/RO, com seleção entre duas unidades, reserva online, painel administrativo e pré-inscrição do Torneio Novembro Azul.

## Stack e execução

- TanStack Start, React 19, Vite e Tailwind v4.
- PostgreSQL no Neon, acessado somente pelo servidor via `DATABASE_URL`.
- Render Static Site gratuito para a SPA/CDN e Web Service Node existente para as server functions.
- Instalação: `pnpm install --frozen-lockfile` · Desenvolvimento: `pnpm dev` · Testes: `pnpm test` · Frontend estático: `pnpm run build:static` · Backend: `pnpm build` · Produção Node: `pnpm start`.

## Configuração

- `DATABASE_URL`: conexão privada ao banco Neon; mantenha-a somente como segredo do backend.
- `ADMIN_PASSWORD`: senha forte para `/admin`; não a publique no GitHub.
- `WEB_PUSH_PUBLIC_KEY` e `WEB_PUSH_PRIVATE_KEY`: par VAPID do Web Push, somente no Web Service Node `arena-elsinho`; a chave privada nunca vai ao frontend nem ao Git.
- Identidade, telefone, redes sociais, unidades e mensagem de agendamento: `src/lib/site.ts`.
- A inscrição do campeonato é uma pré-inscrição e não cobra dinheiro pelo site. A confirmação e eventuais instruções de pagamento são feitas pela organização.
- O mapa usa um embed de busca do Google Maps, sem chave de Maps API no navegador. O número público da Unidade 2 diverge de posts antigos; confirme o endereço com a Arena antes de ir.
- A ilustração da quadra em `public/images/arena-leste-beach-hero.webp` é provisória e deve ser substituída por fotos oficiais quando forem fornecidas. A arte do Torneio Novembro Azul é promocional/ilustrativa, não representa uma foto real da Arena; o CDN publica apenas a variante WebP leve para a página e o JPEG compacto para compartilhamento social.

## Dados e migrações

O schema PostgreSQL versionado está em `drizzle/migrations/` e inclui reservas, horários, perfis admin, WMS e pré-inscrições, com extensões incrementais. A migração `0014_admin_push_subscriptions.sql` acrescenta uma tabela privada para assinaturas Web Push do Admin Master; não armazena dados de clientes nem altera reservas. O admin acessa os dados privados por server functions autenticadas; não há leitura do Neon no navegador.

Ao executar uma migração em produção, revise o SQL e use o fluxo de branch temporária/revisão do Neon antes de aplicar no branch principal. Depois de aplicar a migração, publique o deploy do backend e então o frontend.

## Hospedagem e privacidade

As rotas `/api/*` no Static Site são encaminhadas para o Web Service do Render. O shell, imagens, logo e mapa são carregados sem depender de uma requisição inicial ao backend; a pré-inscrição usa apenas as server functions e o Neon. Mantenha os serviços no plano gratuito existente e não adicione uma chave de pagamento ou Google Maps API sem autorização explícita.

A página `/privacidade` descreve finalidade, acesso restrito e exercício de direitos LGPD. Consulte também `ARCHITECTURE.md`, `SECURITY.md`, `PAYMENTS.md`, `PRIVACY.md`, `DESIGN_SYSTEM.md`, `QA_REPORT.md` e `FINAL_REVIEW.md`.
