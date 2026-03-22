const express = require('express');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

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

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  console.log('Health check recebido');
  res.status(200).json({
    ok: true,
    service: 'BotWay',
    time: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  console.log('HOME / aberta');
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

app.post('/api/messages', (req, res) => {
  console.log('POST /api/messages recebido');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  return res.status(200).json({
    ok: true,
    message: 'Mensagem recebida com sucesso'
  });
});

app.post('/validar', (req, res) => {
  console.log('POST /validar recebido');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  return res.status(200).json({
    ok: true,
    resultado: 'Validação recebida'
  });
});

// NOVA ROTA: é essa que seu log mostrou que o Teams está chamando
app.post('/webhook', (req, res) => {
  console.log('POST /webhook recebido');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  return res.status(200).json({
    ok: true,
    message: 'Webhook recebido com sucesso'
  });
});

// opcional: caso tentem abrir /webhook no navegador
app.get('/webhook', (req, res) => {
  console.log('GET /webhook recebido');

  return res.status(200).send('Webhook ativo');
});

app.use((req, res) => {
  console.log(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    ok: false,
    error: 'Rota não encontrada'
  });
});

app.use((err, req, res, next) => {
  console.error('Erro interno:', err);
  res.status(500).json({
    ok: false,
    error: 'Erro interno do servidor'
  });
});

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BotWay rodando na porta ${PORT}`);
  console.log('Health disponível em /health');
});
