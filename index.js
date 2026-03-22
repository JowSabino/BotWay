const express = require('express');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

/**
 * Segurança compatível com abertura dentro do Teams
 * Evita bloquear a aplicação em iframe/webview do Teams.
 */
app.use(
  helmet({
    frameguard: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "frame-ancestors": [
          "'self'",
          "https://teams.microsoft.com",
          "https://*.teams.microsoft.com",
          "https://*.skype.com",
          "https://*.microsoft.com"
        ]
      }
    }
  })
);

// Parsing de JSON
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Log de todas as requisições
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

// Se tiver front-end estático, deixe os arquivos em /public
app.use(express.static(path.join(__dirname, 'public')));

// Health check para acordar/testar o Render
app.get('/health', (req, res) => {
  console.log('Health check recebido');
  res.status(200).json({
    ok: true,
    service: 'BotWay',
    time: new Date().toISOString()
  });
});

// Página inicial simples
app.get('/', (req, res) => {
  res.status(200).send(`
    <html>
      <head>
        <title>BotWay</title>
      </head>
      <body style="font-family: Arial; padding: 24px;">
        <h1>BotWay online</h1>
        <p>Serviço rodando com sucesso.</p>
        <p>Health: <a href="/health">/health</a></p>
      </body>
    </html>
  `);
});

/**
 * Rota de teste para receber chamadas do Teams / Power Automate / card
 * Ajuste esta rota se seu app usa outro endpoint.
 */
app.post('/api/messages', (req, res) => {
  console.log('POST /api/messages recebido');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  return res.status(200).json({
    ok: true,
    message: 'Mensagem recebida com sucesso'
  });
});

/**
 * Rota opcional para o botão "Validar com assistente"
 * Use esta rota se seu card/app estiver chamando um endpoint web.
 */
app.post('/validar', (req, res) => {
  console.log('POST /validar recebido');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  return res.status(200).json({
    ok: true,
    resultado: 'Validação recebida'
  });
});

// 404
app.use((req, res) => {
  console.log(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    ok: false,
    error: 'Rota não encontrada'
  });
});

// Tratamento de erro
app.use((err, req, res, next) => {
  console.error('Erro interno:', err);
  res.status(500).json({
    ok: false,
    error: 'Erro interno do servidor'
  });
});

// Logs de falhas globais
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`BotWay rodando na porta ${PORT}`);
  console.log(`Health disponível em /health`);
});
