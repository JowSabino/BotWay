const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ─── Configurações ────────────────────────────────────────────────────────────
const ANTHROPIC_KEY    = process.env.ANTHROPIC_KEY;
const YOUTRACK_TOKEN   = process.env.YOUTRACK_TOKEN;
const YOUTRACK_URL     = process.env.YOUTRACK_URL || 'https://youtrack.cardway.net.br/youtrack';
const YOUTRACK_PROJECT = process.env.YOUTRACK_PROJECT || '0-64';
const TEAMS_WEBHOOK    = process.env.TEAMS_WEBHOOK; // webhook do canal BotWay

// ─── Estado das conversas em memória ─────────────────────────────────────────
// Chave: userId, Valor: { etapa, dados, timestamp }
const conversas = {};

const ETAPAS = ['tipo', 'descricao', 'fornecedor', 'produto', 'relevancia', 'confirmar'];

const PERGUNTAS = {
  tipo: '👋 Olá! Vamos criar um novo item no YouTrack.\n\nQual o **tipo**? Digite o número:\n`1` Demanda\n`2` Ação\n`3` Melhoria\n`4` Oportunidade',
  descricao: '📝 Descreva o que precisa ser registrado:',
  fornecedor: '🏭 Qual o **fornecedor**? (ou digite `-` para pular)',
  produto: '📦 Qual o **produto**? (ou digite `-` para pular)',
  relevancia: '⭐ Qual a **relevância**? Digite o número:\n`1` Bloqueadora\n`2` Crítica\n`3` Alta\n`4` Normal\n`5` Baixa',
  confirmar: '' // gerada dinamicamente
};

const TIPOS = { '1': 'Demanda', '2': 'Ação', '3': 'Melhoria', '4': 'Oportunidade' };
const RELEVANCIAS = { '1': 'Bloqueadora', '2': 'Crítica', '3': 'Alta', '4': 'Normal', '5': 'Baixa' };

// Limpar conversas antigas a cada 30 min
setInterval(() => {
  const agora = Date.now();
  Object.keys(conversas).forEach(key => {
    if (agora - conversas[key].timestamp > 30 * 60 * 1000) {
      delete conversas[key];
    }
  });
}, 5 * 60 * 1000);

// ─── Chamar Claude para sugerir título ───────────────────────────────────────
async function sugerirTitulo(dados) {
  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Você é um assistente do time de Produtos da CardWay.
        
Crie um título claro e objetivo (máximo 80 caracteres) para um item do YouTrack com base nessas informações:
Tipo: ${dados.tipo}
Descrição: ${dados.descricao}
Fornecedor: ${dados.fornecedor || '-'}
Produto: ${dados.produto || '-'}

Responda APENAS com o título, sem aspas, sem explicação.`
      }]
    }, {
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });
    return response.data.content[0].text.trim();
  } catch (e) {
    // Fallback: usar início da descrição
    return dados.descricao.substring(0, 75).trim();
  }
}

// ─── Criar issue no YouTrack ─────────────────────────────────────────────────
async function criarIssue(dados, titulo) {
  const response = await axios.post(
    `${YOUTRACK_URL}/api/issues?fields=id,idReadable,summary`,
    {
      summary: titulo,
      project: { id: YOUTRACK_PROJECT },
      customFields: [
        { name: 'Tipo PR', $type: 'SingleEnumIssueCustomField', value: { name: dados.tipo } },
        { name: 'Relevância', $type: 'SingleEnumIssueCustomField', value: { name: dados.relevancia } },
        ...(dados.fornecedor && dados.fornecedor !== '-' ? [
          { name: 'Fornecedor', $type: 'SingleEnumIssueCustomField', value: { name: dados.fornecedor } }
        ] : []),
        ...(dados.produto && dados.produto !== '-' ? [
          { name: 'Produto', $type: 'SingleEnumIssueCustomField', value: { name: dados.produto } }
        ] : [])
      ]
    },
    {
      headers: {
        'Authorization': `Bearer ${YOUTRACK_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
}

// ─── Enviar mensagem pro Teams via webhook ───────────────────────────────────
async function enviarMensagem(texto) {
  if (!TEAMS_WEBHOOK) return;
  try {
    await axios.post(TEAMS_WEBHOOK, {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [{
            type: 'TextBlock',
            text: texto,
            wrap: true
          }]
        }
      }]
    });
  } catch (e) {
    console.error('Erro ao enviar para Teams:', e.message);
  }
}

// ─── Processar mensagem do usuário ───────────────────────────────────────────
async function processarMensagem(userId, userName, texto) {
  const msg = (texto || '').trim();

  // Iniciar nova conversa
  if (msg.toLowerCase().includes('!criar') || msg.toLowerCase() === '/novo') {
    conversas[userId] = {
      etapa: 'tipo',
      dados: {},
      timestamp: Date.now()
    };
    return PERGUNTAS.tipo;
  }

  // Cancelar
  if (msg.toLowerCase() === '!cancelar' || msg.toLowerCase() === 'cancelar') {
    if (conversas[userId]) {
      delete conversas[userId];
      return '❌ Criação cancelada. Digite **!criar** para começar novamente.';
    }
    return null;
  }

  const conversa = conversas[userId];
  if (!conversa) return null; // Não está em conversa ativa

  conversa.timestamp = Date.now();
  const etapa = conversa.etapa;

  // ── Processar cada etapa ──────────────────────────────────────────────────
  if (etapa === 'tipo') {
    const tipo = TIPOS[msg];
    if (!tipo) return '⚠️ Opção inválida. Digite `1`, `2`, `3` ou `4`.';
    conversa.dados.tipo = tipo;
    conversa.etapa = 'descricao';
    return PERGUNTAS.descricao;
  }

  if (etapa === 'descricao') {
    if (msg.length < 10) return '⚠️ Descrição muito curta. Detalhe um pouco mais o que precisa ser feito.';
    conversa.dados.descricao = msg;
    conversa.etapa = 'fornecedor';
    return PERGUNTAS.fornecedor;
  }

  if (etapa === 'fornecedor') {
    conversa.dados.fornecedor = msg === '-' ? '' : msg;
    conversa.etapa = 'produto';
    return PERGUNTAS.produto;
  }

  if (etapa === 'produto') {
    conversa.dados.produto = msg === '-' ? '' : msg;
    conversa.etapa = 'relevancia';
    return PERGUNTAS.relevancia;
  }

  if (etapa === 'relevancia') {
    const relevancia = RELEVANCIAS[msg];
    if (!relevancia) return '⚠️ Opção inválida. Digite `1`, `2`, `3`, `4` ou `5`.';
    conversa.dados.relevancia = relevancia;

    // Chamar Claude para sugerir título
    const titulo = await sugerirTitulo(conversa.dados);
    conversa.dados.titulo = titulo;
    conversa.etapa = 'confirmar';

    const d = conversa.dados;
    return (
      `📋 **Resumo do item a criar:**\n\n` +
      `• **Tipo:** ${d.tipo}\n` +
      `• **Título:** ${d.titulo}\n` +
      `• **Fornecedor:** ${d.fornecedor || '-'}\n` +
      `• **Produto:** ${d.produto || '-'}\n` +
      `• **Relevância:** ${d.relevancia}\n\n` +
      `✅ Confirma a criação? Digite **S** para criar ou **N** para cancelar.`
    );
  }

  if (etapa === 'confirmar') {
    const resposta = msg.toLowerCase();

    if (resposta === 'n' || resposta === 'não' || resposta === 'nao') {
      delete conversas[userId];
      return '❌ Criação cancelada. Digite **!criar** para começar novamente.';
    }

    if (resposta !== 's' && resposta !== 'sim') {
      return '⚠️ Digite **S** para confirmar ou **N** para cancelar.';
    }

    // Criar no YouTrack
    try {
      const issue = await criarIssue(conversa.dados, conversa.dados.titulo);
      delete conversas[userId];
      return (
        `✅ **Item criado com sucesso!**\n\n` +
        `• **ID:** ${issue.idReadable}\n` +
        `• **Tipo:** ${conversa.dados.tipo}\n` +
        `• **Título:** ${issue.summary}\n\n` +
        `🔗 [Abrir no YouTrack](${YOUTRACK_URL}/issue/${issue.idReadable})`
      );
    } catch (e) {
      console.error('Erro ao criar no YouTrack:', e.message);
      return `❌ Erro ao criar o item no YouTrack: ${e.message}\n\nTente novamente ou verifique os campos.`;
    }
  }

  return null;
}

// ─── Rota principal — recebe mensagens do Teams via Power Automate ────────────
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Suporte a formato do Power Automate
    const userId    = body.userId || body.from?.id || 'unknown';
    const userName  = body.userName || body.from?.name || 'Usuário';
    const texto     = body.text || body.message || '';

    console.log(`[${userName}] ${texto}`);

    const resposta = await processarMensagem(userId, userName, texto);

    if (resposta) {
      res.json({ resposta });
    } else {
      res.json({ resposta: null });
    }
  } catch (e) {
    console.error('Erro no webhook:', e);
    res.status(500).json({ erro: e.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'BotWay online 🤖', versao: '1.0.0' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BotWay rodando na porta ${PORT}`);
});
