/**
 * BotWay - Microsoft Teams + YouTrack
 *
 * Requisitos:
 * - Node.js 18+
 * - npm install express helmet
 *
 * Variáveis de ambiente aceitas:
 * - PORT
 * - YOUTRACK_BASE_URL   (ou YOUTRACK_URL)
 * - YOUTRACK_TOKEN
 * - YOUTRACK_PROJECT_ID (ou YOUTRACK_PROJECT)
 * - YOUTRACK_FRENTE_NEGOCIO (opcional)
 */

const express = require('express');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

/**
 * YouTrack
 * Aceita nomes antigos e novos para evitar quebrar sua configuração no Render.
 */
const YOUTRACK_BASE_URL =
  process.env.YOUTRACK_BASE_URL ||
  process.env.YOUTRACK_URL ||
  '';

const YOUTRACK_TOKEN =
  process.env.YOUTRACK_TOKEN ||
  '';

const YOUTRACK_PROJECT_ID =
  process.env.YOUTRACK_PROJECT_ID ||
  process.env.YOUTRACK_PROJECT ||
  '';

/**
 * Campo obrigatório opcional no YouTrack.
 * Use o valor EXATO da opção cadastrada no campo "Frente de Negócio".
 */
const YOUTRACK_FRENTE_NEGOCIO =
  process.env.YOUTRACK_FRENTE_NEGOCIO ||
  '';

/**
 * Segurança compatível com Teams
 * Evita bloqueio em iframe/webview do Teams.
 */
app.use(
  helmet({
    frameguard: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'frame-ancestors': [
          "'self'",
          'https://teams.microsoft.com',
          'https://*.teams.microsoft.com',
          'https://*.skype.com',
          'https://*.microsoft.com'
        ]
      }
    }
  })
);

/**
 * Parsers
 */
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

/**
 * Log global de requisições
 */
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

/**
 * Arquivos estáticos opcionais
 */
app.use(express.static(path.join(__dirname, 'public')));

/* =========================================================
 * Helpers
 * =======================================================*/

/**
 * Decodifica entidades HTML comuns.
 */
function decodeHtmlEntities(text = '') {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Remove menções do Teams.
 */
function removeTeamsMentions(text = '') {
  return text
    .replace(/<at>.*?<\/at>/gi, ' ')
    .replace(
      /<span[^>]*itemtype=["']http:\/\/schema\.skype\.com\/Mention["'][^>]*>.*?<\/span>/gi,
      ' '
    );
}

/**
 * Remove tags HTML.
 */
function stripHtml(text = '') {
  return text.replace(/<[^>]+>/g, ' ');
}

/**
 * Normaliza espaços.
 */
function normalizeSpaces(text = '') {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Limpa o texto vindo do Teams.
 */
function normalizeTeamsText(text = '') {
  const decoded = decodeHtmlEntities(text);
  const withoutMentions = removeTeamsMentions(decoded);
  const noHtml = stripHtml(withoutMentions);
  return normalizeSpaces(noHtml);
}

/**
 * Extrai o texto da mensagem recebida.
 */
function extractIncomingText(body = {}) {
  return (
    body?.text ||
    body?.attachments?.[0]?.content ||
    body?.value?.text ||
    ''
  );
}

/**
 * Verifica se o YouTrack está configurado.
 */
function isYouTrackConfigured() {
  return Boolean(YOUTRACK_BASE_URL && YOUTRACK_TOKEN && YOUTRACK_PROJECT_ID);
}

/**
 * Monta URL da issue no YouTrack.
 */
function buildYouTrackIssueUrl(idReadable) {
  const base = YOUTRACK_BASE_URL.replace(/\/+$/, '');
  return `${base}/issue/${idReadable}`;
}

/**
 * Resposta simples para o Teams.
 * O Teams entende bem esse formato.
 */
function buildPlainMessage(text) {
  return {
    type: 'message',
    text
  };
}

/**
 * Cria issue no YouTrack.
 */
async function createYouTrackIssue({ summary, description }) {
  const base = YOUTRACK_BASE_URL.replace(/\/+$/, '');
  const url = `${base}/api/issues?fields=id,idReadable,summary`;

  const customFields = [];

  /**
   * Campo obrigatório opcional:
   * Frente de Negócio
   *
   * Assume tipo enum simples.
   */
  if (YOUTRACK_FRENTE_NEGOCIO) {
    customFields.push({
      name: 'Frente de Negócio',
      $type: 'SingleEnumIssueCustomField',
      value: {
        name: YOUTRACK_FRENTE_NEGOCIO
      }
    });
  }

  const payload = {
    summary,
    description,
    project: {
      id: YOUTRACK_PROJECT_ID
    },
    customFields
  };

  console.log('Payload YouTrack:', JSON.stringify(payload, null, 2));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${YOUTRACK_TOKEN}`
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let data;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { raw: responseText };
  }

  if (!response.ok) {
    throw new Error(
      `YouTrack retornou ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

/* =========================================================
 * Rotas básicas
 * =======================================================*/

app.get('/', (req, res) => {
  console.log('HOME / aberta');
  res.status(200).send(`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>BotWay</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 24px;">
        <h1>BotWay online</h1>
        <p>Serviço rodando com sucesso.</p>
        <p><a href="/health">/health</a></p>
      </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  console.log('Health check recebido');
  res.status(200).json({
    ok: true,
    service: 'BotWay',
    time: new Date().toISOString()
  });
});

app.get('/webhook', (req, res) => {
  console.log('GET /webhook recebido');
  res.status(200).send('Webhook ativo');
});

/* =========================================================
 * Webhook principal do Teams
 * =======================================================*/

app.post('/webhook', async (req, res) => {
  try {
    console.log('POST /webhook recebido');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const originalText = extractIncomingText(req.body);
    const cleanedText = normalizeTeamsText(originalText);
    const command = cleanedText.toLowerCase();

    console.log('Texto original:', originalText);
    console.log('Texto limpo:', cleanedText);
    console.log('Comando normalizado:', command);

    const requester = req.body?.from?.name || 'Usuário';
    const teamId = req.body?.channelData?.team?.aadGroupId || '';
    const channelId = req.body?.channelData?.channel?.id || '';
    const messageId = req.body?.id || '';

    /**
     * Comando de ajuda
     */
    if (command === '!chat' || command.startsWith('!chat ')) {
      return res.status(200).json(
        buildPlainMessage(
          [
            'Olá! Eu sou o BotWay.',
            '',
            'Comandos disponíveis:',
            '- !chat',
            '- !criar Título do item',
            '',
            'Exemplo:',
            '!criar Erro ao aprovar cartão no app'
          ].join('\n')
        )
      );
    }

    /**
     * Comando para criar issue
     */
    if (command === '!criar' || command.startsWith('!criar ')) {
      const summary = cleanedText.replace(/^!criar\s*/i, '').trim();

      if (!summary) {
        return res.status(200).json(
          buildPlainMessage('Envie o comando assim: !criar Título do item')
        );
      }

      if (!isYouTrackConfigured()) {
        return res.status(200).json(
          buildPlainMessage(
            [
              'Recebi o comando, mas o YouTrack ainda não está configurado no servidor.',
              'Defina as variáveis:',
              '- YOUTRACK_BASE_URL',
              '- YOUTRACK_TOKEN',
              '- YOUTRACK_PROJECT_ID'
            ].join('\n')
          )
        );
      }

      const descriptionLines = [
        `Solicitante: ${requester}`,
        'Origem: Microsoft Teams',
        teamId ? `TeamId: ${teamId}` : '',
        channelId ? `ChannelId: ${channelId}` : '',
        messageId ? `MessageId: ${messageId}` : '',
        '',
        `Texto recebido: ${cleanedText}`
      ].filter(Boolean);

      const issue = await createYouTrackIssue({
        summary,
        description: descriptionLines.join('\n')
      });

      const idReadable = issue?.idReadable || issue?.id || 'sem-id';
      const issueUrl = issue?.idReadable
        ? buildYouTrackIssueUrl(issue.idReadable)
        : YOUTRACK_BASE_URL;

      return res.status(200).json(
        buildPlainMessage(
          `Item criado no YouTrack com sucesso: ${idReadable}\n${issueUrl}`
        )
      );
    }

    /**
     * Fallback
     */
    return res.status(200).json(
      buildPlainMessage(
        'Comando não reconhecido. Use !chat ou !criar Título do item'
      )
    );
  } catch (error) {
    console.error('Erro no /webhook:', error);

    return res.status(200).json(
      buildPlainMessage(
        `Recebi a solicitação, mas ocorreu um erro: ${error.message}`
      )
    );
  }
});

/* =========================================================
 * Rotas auxiliares opcionais
 * =======================================================*/

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

/* =========================================================
 * 404
 * =======================================================*/

app.use((req, res) => {
  console.log(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    ok: false,
    error: 'Rota não encontrada'
  });
});

/* =========================================================
 * Tratamento de erro
 * =======================================================*/

app.use((err, req, res, next) => {
  console.error('Erro interno:', err);
  res.status(500).json({
    ok: false,
    error: 'Erro interno do servidor'
  });
});

/* =========================================================
 * Falhas globais
 * =======================================================*/

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

/* =========================================================
 * Start
 * =======================================================*/

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BotWay rodando na porta ${PORT}`);
  console.log('Health disponível em /health');
});