const express = require('express');
const app = express();

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/health', (req, res) => {
  console.log('Health check recebido');
  res.status(200).send('ok');
});

// exemplo da rota que o Teams/bot usa
app.post('/api/messages', (req, res) => {
  console.log('POST /api/messages');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`BotWay rodando na porta ${PORT}`);
});
