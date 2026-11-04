# Fazenda dos Sonhos: publicar com pagamento automático

Antes de divulgar, troque `[COLOQUE AQUI O E-MAIL DE CONTATO]` em `public/termos/index.html` e `public/privacidade/index.html`.

Você vai precisar de uma conta no Mercado Pago, uma conta no Cloudflare e do Node.js LTS instalado (nodejs.org).
Abra um terminal dentro desta pasta para executar os comandos.

## 1. Instalar e entrar no Cloudflare
    npm install
    npx wrangler login

## 2. Criar o banco de pedidos
    npx wrangler d1 create fazenda-pagamentos

Copie o `database_id` exibido e cole no lugar de `COLE_AQUI_O_ID_DO_BANCO`, no arquivo `wrangler.toml`. Depois execute:

    npx wrangler d1 migrations apply fazenda-pagamentos --remote

## 3. Publicar o site
    npx wrangler deploy

Anote o endereço exibido, algo como `https://fazenda-dos-sonhos.SEU-NOME.workers.dev`.
Nesta etapa, os pacotes ainda aparecem como "Em breve".

## 4. Configurar o Mercado Pago, primeiro em teste
1. Em Mercado Pago Developers > Suas integrações, crie uma aplicação do tipo Checkout Pro.
2. Em Webhooks > Configurar notificações, use a URL `https://SEU-ENDERECO/api/webhook` e marque o evento **Pagamentos**. Faça isso no modo de teste.
3. Copie a **assinatura secreta** do webhook e o **Access Token de teste**.
4. Grave os dois no servidor. Cada comando pede para colar o valor:

       npx wrangler secret put MP_ACCESS_TOKEN
       npx wrangler secret put MP_WEBHOOK_SECRET
       npx wrangler secret put MP_SANDBOX

   Em `MP_SANDBOX`, digite `1`.
5. Abra o jogo, vá em Loja > Diamantes e compre com um usuário e um cartão de teste do Mercado Pago.
6. Confira se os diamantes entram sozinhos. Para ver avisos do servidor durante o teste, execute `npx wrangler tail`.

## 5. Começar a vender
Repita as etapas 4.2 a 4.4 com as credenciais de produção, no modo produtivo. Em `MP_SANDBOX`, digite `0`.
Faça uma compra real de valor baixo antes de divulgar.

## Mudar preços
Altere `PACKS` no início de `src/index.js` e execute `npx wrangler deploy`. O jogo mostra automaticamente o que o servidor informar.

## Atender um cliente
Ninguém além de você deve ver o Access Token ou a assinatura secreta. Se vazarem, gere novos no Mercado Pago.
Para ver as compras:

    npx wrangler d1 execute fazenda-pagamentos --remote --command "SELECT id,gems,amount,status,payment_id,created_at FROM orders ORDER BY created_at DESC LIMIT 50"

Status: `pending` aguardando, `paid` pago, `refunded` devolvido, `charged_back` contestado.
O jogo não retira diamantes depois de uma devolução. Se um jogador perder os dados do navegador, compense com um código do arquivo CSV.
