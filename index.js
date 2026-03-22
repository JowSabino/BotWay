const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
app.use(express.json());

const ANTHROPIC_KEY    = process.env.ANTHROPIC_KEY;
const YOUTRACK_TOKEN   = process.env.YOUTRACK_TOKEN;
const YOUTRACK_URL     = process.env.YOUTRACK_URL || 'https://youtrack.cardway.net.br/youtrack';
const YOUTRACK_PROJECT = process.env.YOUTRACK_PROJECT || '0-64';
const TEAMS_SECRET     = process.env.TEAMS_SECRET || 'xu3/G2wa7an/0WUBkpcekqvAT6Tt0/0X9j7Peaf0Qe4=';

const conversas = {};
const TIPOS       = { '1': 'Demanda', '2': 'Ação', '3': 'Melhoria', '4': 'Oportunidade' };
const RELEVANCIAS = { '1': 'Bloqueadora', '2': 'Crítica', '3': 'Alta', '4': 'Normal', '5': 'Baixa' };
const PERGUNTAS = {
  tipo:       '👋 Vamos criar um novo item no YouTrack!\n\nQual o **tipo**?\n`1` Demanda\n`2` Ação\n`3` Melhoria\n`4` Oportunidade',
  descricao:  '📝 Descreva o que precisa ser registrado:',
  fornecedor: '🏭 Qual o **fornecedor**? (ou `-` para pular)',
  produto:    '📦 Qual o **produto**? (ou `-` para pular)',
  relevancia: '⭐ Qual a **relevância**?\n`1` Bloqueadora\n`2` Crítica\n`3` Alta\n`4` Normal\n`5` Baixa'
};

setInterval(() => {
  const agora = Date.now();
  Object.keys(conversas).forEach(k => {
    if (agora - conversas[k].timestamp > 30 * 60 * 1000) delete conversas[k];
  });
}, 5 * 60 * 1000);

function validarToken(req) {
  try {
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('HMAC ')) return false;
    const hmacRecebido = auth.replace('HMAC ', '');
    const body = JSON.stringify(req.body);
    const key = Buffer.from(TEAMS_SECRET, 'base64');
    const hmacCalculado = crypto.createHmac('sha256', key).update(body, 'utf8').digest('base64');
    return hmacRecebido === hmacCalculado;
  } catch (e) {
    return false;
  }
}

async function sugerirTitulo(dados) {
  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Crie um título claro e objetivo (máximo 80 caracteres) para um item do YouTrack:\nTipo: ${dados.tipo}\nDescrição: ${dados.descricao}\nFornecedor: ${dados.fornecedor || '-'}\nProduto: ${dados.produto || '-'}\nResponda APENAS com o título, sem aspas.`
      }]
    }, {
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
    });
    return response.data.content[0].text.trim();
  } catch (e) {
    return dados.descricao.substring(0, 75).trim();
  }
}

async function criarIssue(dados, titulo) {
  const customFields = [
    { name: 'Tipo PR', $type: 'SingleEnumIssueCustomField', value: { name: dados.tipo } },
    { name: 'Relevância', $type: 'SingleEnumIssueCustomField', value: { name: dados.relevancia } }
  ];
  if (dados.fornecedor && dados.fornecedor !== '-') customFields.push({ name: 'Fornecedor', $type: 'SingleEnumIssueCustomField', value: { name: dados.fornecedor } });
  if (dados.produto && dados.produto !== '-') customFields.push({ name: 'Produto', $type: 'SingleEnumIssueCustomField', value: { name: dados.produto } });
  const response = await axios.post(
    `${YOUTRACK_URL}/api/issues?fields=id,idReadable,summary`,
    { summary: titulo, project: { id: YOUTRACK_PROJECT }, customFields },
    { headers: { 'Authorization': `Bearer ${YOUTRACK_TOKEN}`, 'Content-Type': 'application/json' } }
  );
  return response.data;
}

async function processarMensagem(userId, texto) {
  const msg = texto.replace(/<at>[^<]+<\/at>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`[${userId}] "${msg}"`);

  if (msg.toLowerCase() === '!cancelar' || msg.toLowerCase() === 'cancelar') {
    if (conversas[userId]) { delete conversas[userId]; return '❌ Criação cancelada. Digite **!criar** para começar novamente.'; }
    return null;
  }

  if (msg.toLowerCase().includes('!criar') || msg.toLowerCase() === '/novo') {
    conversas[userId] = { etapa: 'tipo', dados: {}, timestamp: Date.now() };
    return PERGUNTAS.tipo;
  }

  const conversa = conversas[userId];
  if (!conversa) return null;
  conversa.timestamp = Date.now();
  const etapa = conversa.etapa;

  if (etapa === 'tipo') {
    const tipo = TIPOS[msg];
    if (!tipo) return '⚠️ Opção inválida. Digite `1`, `2`, `3` ou `4`.';
    conversa.dados.tipo = tipo;
    conversa.etapa = 'descricao';
    return `✅ **${tipo}** selecionada.\n\n` + PERGUNTAS.descricao;
  }

  if (etapa === 'descricao') {
    if (msg.length < 5) return '⚠️ Descrição muito curta. Detalhe um pouco mais.';
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
    conversa.etapa = 'confirmar';
    const titulo = await sugerirTitulo(conversa.dados);
    conversa.dados.titulo = titulo;
    const d = conversa.dados;
    return `📋 **Resumo do item:**\n\n• **Tipo:** ${d.tipo}\n• **Título:** ${d.titulo}\n• **Fornecedor:** ${d.fornecedor || '-'}\n• **Produto:** ${d.produto || '-'}\n• **Relevância:** ${d.relevancia}\n\nConfirma a criação? Digite **S** para criar ou **N** para cancelar.`;
  }

  if (etapa === 'confirmar') {
    const r = msg.toLowerCase();
    if (r === 'n' || r === 'não' || r === 'nao') { delete conversas[userId]; return '❌ Cancelado. Digite **!criar** para começar novamente.'; }
    if (r !== 's' && r !== 'sim') return '⚠️ Digite **S** para confirmar ou **N** para cancelar.';
    try {
      const issue = await criarIssue(conversa.dados, conversa.dados.titulo);
      const id = issue.idReadable;
      delete conversas[userId];
      return `✅ **Item criado com sucesso!**\n\n• **ID:** ${id}\n• **Tipo:** ${conversa.dados.tipo}\n• **Título:** ${issue.summary}\n\n🔗 Abrir: ${YOUTRACK_URL}/issue/${id}`;
    } catch (e) {
      console.error('Erro YouTrack:', e.response?.data || e.message);
      return `❌ Erro ao criar no YouTrack: ${e.message}`;
    }
  }

  return null;
}

app.post('/webhook', async (req, res) => {
  if (!validarToken(req)) {
    console.warn('Token inválido');
    return res.status(401).json({ type: 'message', text: '⛔ Token inválido.' });
  }
  try {
    const userId  = req.body.from?.id || 'unknown';
    const texto   = req.body.text || '';
    const resposta = await processarMensagem(userId, texto);
    return res.json({ type: 'message', text: resposta || '' });
  } catch (e) {
    console.error('Erro:', e);
    return res.status(500).json({ type: 'message', text: '❌ Erro interno. Tente novamente.' });
  }
});

app.get('/', (req, res) => res.json({ status: 'BotWay online 🤖', versao: '1.1.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BotWay rodando na porta ${PORT}`));
