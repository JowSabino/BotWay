const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
app.use(express.json());

// ─── Configurações ────────────────────────────────────────────────────────────
const ANTHROPIC_KEY    = process.env.ANTHROPIC_KEY;
const YOUTRACK_TOKEN   = process.env.YOUTRACK_TOKEN;
const YOUTRACK_URL     = process.env.YOUTRACK_URL || 'https://youtrack.cardway.net.br/youtrack';
const YOUTRACK_PROJECT = process.env.YOUTRACK_PROJECT || '0-64';
const TEAMS_SECRET     = process.env.TEAMS_SECRET || 'xu3/G2wa7an/0WUBkpcekqvAT6Tt0/0X9j7Peaf0Qe4=';

// ─── Valores reais dos enums do YouTrack ──────────────────────────────────────
const ENUM_VALUES = {
  'Tipo PR': ['Demanda', 'Ação', 'Melhoria', 'Oportunidade'],
  'Relevância': ['Bloqueadora', 'Critica', 'Alta', 'Normal', 'Baixa'],
  'Origem PR': ['Cliente', 'Comercial', 'Operação', 'Suporte', 'Relacionamento', 'Diretoria', 'Dados e métricas', 'T.I', 'Fornecedor', 'Novos Negócios', 'Marketing'],
  'Frente de Negócio': ['CardMais', 'ADQ Sub + ISO', 'Corban', 'Tecfin', 'Fibra', 'Energia', 'Recargas / E-Gifts', 'Transporte', 'Sorteios e Capitalização', 'Saúde e Seguros', 'Plano empresarial Telecom SMB', 'Produtos Físicos', 'PIX', 'Inteligência de Mercado', 'Telecom', 'Certificado Digital', 'Linha de Crédito', 'Marketing', 'Outros'],
  'Fornecedor': ['Banco Bradesco', 'Banco do Brasil', 'Banco Rendimento', 'Evolua', 'Incomm', 'Sky', 'Familhão', 'Loteria Mineira', 'MG CAP', 'MS CAP', 'Palpite do Milhão', 'Promobem', 'Sorte Online', 'SuperTroco', 'Algar', 'Claro', 'Embratel', 'Sercomtel', 'Surf Telecom', 'Telefonica', 'TIM', 'Vertex E-Sim', 'Vivo', 'Autopass/TOP', 'Guaicurus', 'JAE', 'Otimo', 'Riocard', 'SPTrans', 'CardMais', 'SGV', 'Certifica', 'Tecfin', 'Outros', 'Dr Infinitto', 'MOTIVA'],
  'Produto': ['CardMais APP', 'CardMais POS', 'Portal do Cliente CardMais', 'Tecfin', 'POS Linux', 'Backoffice CardMais', 'Card FDV', 'SGV Mobile/SFA', 'Corban Digital', 'Corban Físico', 'Evolua', 'Anacapri', 'Applebees', 'Arezzo', 'Braz Pizzaria', 'Camarada Camarão', 'Centauro', 'Cinesystem', 'Claro TV +', 'Código do Google Play', 'Corello', 'Dufry', 'Escola de Dragões', 'Fogo de Chão', 'GG Credits', 'GNC Cinemas', 'Google Play Outros Valores', 'Havaianas', 'Imaginarium', 'iFood', 'IMVU', 'League of Legends', 'Level Up', 'Netflix', 'Nike', 'Outback', 'PlayStation Store', 'Razer Gold', 'Roblox', 'Spotify', 'Steam', 'Uber', 'Valorant', 'Xbox Game Pass', 'Xbox Live', 'Outros'],
  'Sistema': ['BACKOFFICE - CardMais', 'JDE', 'HOST', 'SIG', 'PORTAL CLIENTE - CardMais', 'CARD FDV', 'CARDOSO', 'Projeto', 'SGR WEB', 'BACKOFFICE SGV', 'SFA', 'POS SGV', 'Paynet', 'APP - CardMais', 'CARD HUB', 'POS - CardMais', 'RECARGA PIX - CardMais', 'Tecfin', 'Integrações', 'Marketplace', 'SPR', 'Card Connect', 'B.I.']
};

// ─── Templates de descrição por tipo ─────────────────────────────────────────
const TEMPLATES = {
  'Demanda': (titulo) => `# 📥 DEMANDA\n# **${titulo}**\n\n---\n\n## Resumo\nDescreva em 1 ou 2 linhas o que foi solicitado.\n\n---\n\n## Contexto\nExplique de forma objetiva o cenário, a necessidade ou o problema.\n\n---\n\n## Solicitação\nO que precisa ser atendido?\n\n---\n\n## Motivo / impacto\nPor que isso é importante agora?\nQual impacto existe se isso não for tratado?\n\n---\n\n## Tratativa inicial de Produtos\nDescreva o entendimento inicial do analista e a linha de ação pensada.\n\n---\n\n## Próximo passo\nQual é o próximo passo imediato para essa demanda andar?\n\n---\n\n## Observações\nRegistre aqui dependências, alinhamentos, riscos, pontos sensíveis ou qualquer detalhe relevante.`,

  'Ação': (titulo) => `# ⚙️ AÇÃO\n# **${titulo}**\n\n---\n\n## Objetivo\nDescreva claramente o que esta ação precisa entregar.\n\n---\n\n## Contexto\nExplique rapidamente o motivo da ação.\n\n---\n\n## Escopo\nO que exatamente será feito?\n\n---\n\n## Critério de conclusão\nComo vamos considerar essa ação concluída?\n\n---\n\n## Dependências\nExiste alguma dependência de área, fornecedor, sistema ou retorno externo?\n\n---\n\n## Próximo passo\nQual é a próxima ação imediata?\n\n---\n\n## Observações\nUse este espaço para registrar alinhamentos, evidências, retornos, bloqueios ou qualquer informação importante.`,

  'Melhoria': (titulo) => `# 🛠️ MELHORIA\n# **${titulo}**\n\n---\n\n## Objetivo da Melhoria\nDescreva claramente o que precisa melhorar.\n\n---\n\n## Contexto Atual\nComo funciona hoje?\nQual é o problema, limitação ou fricção atual?\n\n---\n\n## Mudança Desejada\nExplique o que precisa mudar no produto, processo, sistema, app, backoffice ou jornada.\n\n---\n\n## Regras de Negócio\nListe as regras que precisam ser respeitadas na solução.\n\n---\n\n## Critério de Aceite\nComo Produtos vai validar se a entrega voltou correta?\n\n---\n\n## Impacto Esperado\nO que deve melhorar depois da entrega?\n\n---\n\n## Orientações para TI / Qualidade\nListe detalhes importantes para desenvolvimento, testes e validação.\n\n---\n\n## Dependências / Riscos\nExiste alguma dependência, impedimento ou risco relevante?\n\n---\n\n## Observações\nUse este campo para complementar com exemplos, prints, cenários, exceções ou histórico importante.`,

  'Oportunidade': (titulo) => `# 🚀 OPORTUNIDADE\n# **${titulo}**\n\n---\n\n## Visão Geral\nDescreva de forma objetiva qual é a oportunidade e por que ela existe.\n\n---\n\n## Objetivo\nO que se espera alcançar com essa oportunidade?\n\n---\n\n## Problema / Contexto\nExplique a dor, contexto de negócio, necessidade de mercado ou oportunidade identificada.\n\n---\n\n## Hipótese de Valor\nQual ganho se espera gerar?\n\n---\n\n## Tese Comercial\nExplique a proposta de valor e a lógica comercial da oportunidade.\n\n---\n\n## Jornada / Escopo Inicial\nDescreva o desenho inicial da solução, da jornada ou do que está sendo considerado neste momento.\n\n---\n\n## Premissas e Restrições\nListe pontos importantes que precisam ser considerados para a oportunidade seguir.\n\n---\n\n## Checklist Executivo para Handoff\n\n**📋 Definição da Oportunidade**\n- [ ] 🎯 Objetivo definido e validado\n- [ ] 🔍 Problema / contexto descrito\n- [ ] 💡 Hipótese de valor registrada\n- [ ] 🗣️ Tese comercial estruturada\n- [ ] 🏢 Frente de Negócio, Fornecedor e Produto definidos\n- [ ] 👤 Patrocinador definido\n\n**✅ Viabilidades analisadas**\n- [ ] ⚙️ Viabilidade técnica analisada\n- [ ] 💰 Viabilidade financeira — custo e valor do produto definidos\n- [ ] 💵 Comissão definida\n- [ ] ⚖️ Viabilidade jurídica / regulatória analisada\n- [ ] 🤝 Negociação concluída e contrato assinado (exceto projetos internos)\n- [ ] 🔧 Parametrizações do produto definidas\n\n**📦 Artefatos para Handoff**\n- [ ] 📄 Escopo mínimo documentado\n- [ ] 🗺️ Jornada / fluxo desenhado\n- [ ] 📅 Data prevista de handoff definida\n- [ ] 🗣️ Tese comercial estruturada e validada\n\n---\n\n## Próximo Passo\nQual é o próximo avanço necessário para essa oportunidade seguir?\n\n---\n\n## Observações\nRegistre riscos, aprovações, pendências, decisões e alinhamentos relevantes.`
};

// ─── Estado das conversas em memória ─────────────────────────────────────────
const conversas = {};

setInterval(() => {
  const agora = Date.now();
  Object.keys(conversas).forEach(k => {
    if (agora - conversas[k].timestamp > 30 * 60 * 1000) delete conversas[k];
  });
}, 5 * 60 * 1000);

// ─── Funções auxiliares ───────────────────────────────────────────────────────
function validarToken(req) {
  try {
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('HMAC ')) return false;
    const hmacRecebido = auth.replace('HMAC ', '');
    const body = JSON.stringify(req.body);
    const key = Buffer.from(TEAMS_SECRET, 'base64');
    const hmacCalculado = crypto.createHmac('sha256', key).update(body, 'utf8').digest('base64');
    return hmacRecebido === hmacCalculado;
  } catch (e) { return false; }
}

// Busca o valor mais próximo de um campo enum
function encontrarValor(campo, busca) {
  if (!busca || busca === '-') return null;
  const valores = ENUM_VALUES[campo] || [];
  const buscaLower = busca.toLowerCase().trim();
  // Match exato
  const exato = valores.find(v => v.toLowerCase() === buscaLower);
  if (exato) return exato;
  // Match parcial
  const parcial = valores.filter(v => v.toLowerCase().includes(buscaLower) || buscaLower.includes(v.toLowerCase()));
  return parcial;
}

// Sugerir título via Claude
async function sugerirTitulo(tipo, descricao) {
  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{ role: 'user', content: `Crie um título claro e objetivo (máximo 80 caracteres) para um ${tipo} no YouTrack com base nessa descrição: "${descricao}". Responda APENAS com o título, sem aspas.` }]
    }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
    return response.data.content[0].text.trim();
  } catch (e) { return descricao.substring(0, 75).trim(); }
}

// Criar issue no YouTrack
async function criarIssue(dados) {
  const customFields = [
    { name: 'Tipo PR', $type: 'SingleEnumIssueCustomField', value: { name: dados.tipo } },
    { name: 'Relevância', $type: 'SingleEnumIssueCustomField', value: { name: dados.relevancia } },
    { name: 'Origem PR', $type: 'SingleEnumIssueCustomField', value: { name: dados.origem } }
  ];
  if (dados.frenteNegocio) customFields.push({ name: 'Frente de Negócio', $type: 'SingleEnumIssueCustomField', value: { name: dados.frenteNegocio } });
  if (dados.fornecedor) customFields.push({ name: 'Fornecedor', $type: 'SingleEnumIssueCustomField', value: { name: dados.fornecedor } });
  if (dados.produto) customFields.push({ name: 'Produto', $type: 'SingleEnumIssueCustomField', value: { name: dados.produto } });
  if (dados.sistema) customFields.push({ name: 'Sistema', $type: 'SingleEnumIssueCustomField', value: { name: dados.sistema } });

  const response = await axios.post(
    `${YOUTRACK_URL}/api/issues?fields=id,idReadable,summary`,
    { summary: dados.titulo, description: TEMPLATES[dados.tipo](dados.titulo), project: { id: YOUTRACK_PROJECT }, customFields },
    { headers: { 'Authorization': `Bearer ${YOUTRACK_TOKEN}`, 'Content-Type': 'application/json' } }
  );
  return response.data;
}

// ─── Fluxo de conversa ────────────────────────────────────────────────────────
async function processarMensagem(userId, texto) {
  const msg = texto.replace(/<at>[^<]+<\/at>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`[${userId}] "${msg}"`);

  if (msg.toLowerCase() === '!cancelar' || msg.toLowerCase() === 'cancelar') {
    if (conversas[userId]) { delete conversas[userId]; return '❌ Criação cancelada. Digite **!criar** para começar novamente.'; }
    return null;
  }

  if (msg.toLowerCase().includes('!criar') || msg.toLowerCase() === '/novo') {
    conversas[userId] = { etapa: 'tipo', dados: {}, timestamp: Date.now() };
    return '👋 Vamos criar um novo item no YouTrack!\n\nQual o **tipo**?\n`1` Demanda\n`2` Ação\n`3` Melhoria\n`4` Oportunidade';
  }

  const conversa = conversas[userId];
  if (!conversa) return null;
  conversa.timestamp = Date.now();

  const TIPOS = { '1': 'Demanda', '2': 'Ação', '3': 'Melhoria', '4': 'Oportunidade' };
  const RELEVANCIAS = { '1': 'Bloqueadora', '2': 'Critica', '3': 'Alta', '4': 'Normal', '5': 'Baixa' };

  // ── Aguardando seleção de múltiplos matches ───────────────────────────────
  if (conversa.aguardandoSelecao) {
    const { campo, opcoes, proximaEtapa } = conversa.aguardandoSelecao;
    const idx = parseInt(msg) - 1;
    if (isNaN(idx) || idx < 0 || idx >= opcoes.length) {
      return `⚠️ Digite o número da opção (1 a ${opcoes.length}).`;
    }
    conversa.dados[proximaEtapa] = opcoes[idx];
    delete conversa.aguardandoSelecao;
    conversa.etapa = proximaEtapa + '_confirmado';
    return avancarEtapa(conversa, userId);
  }

  return avancarEtapa(conversa, userId, msg);
}

async function avancarEtapa(conversa, userId, msg) {
  const TIPOS = { '1': 'Demanda', '2': 'Ação', '3': 'Melhoria', '4': 'Oportunidade' };
  const RELEVANCIAS = { '1': 'Bloqueadora', '2': 'Critica', '3': 'Alta', '4': 'Normal', '5': 'Baixa' };

  const etapa = conversa.etapa;
  const tipo = conversa.dados.tipo;

  // ── Tipo ──────────────────────────────────────────────────────────────────
  if (etapa === 'tipo') {
    const t = TIPOS[msg] || (msg.length > 2 ? Object.values(TIPOS).find(v => v.toLowerCase().includes(msg.toLowerCase())) : null);
    if (!t) return '⚠️ Digite `1` Demanda, `2` Ação, `3` Melhoria ou `4` Oportunidade.';
    conversa.dados.tipo = t;
    conversa.etapa = 'descricao';
    return `✅ **${t}** selecionada.\n\n📝 Descreva o que precisa ser registrado:`;
  }

  // ── Descrição ─────────────────────────────────────────────────────────────
  if (etapa === 'descricao') {
    if (msg.length < 10) return '⚠️ Descrição muito curta. Detalhe um pouco mais.';
    conversa.dados.descricao = msg;
    conversa.etapa = 'origem';
    const opcoesOrigem = ENUM_VALUES['Origem PR'].map((v, i) => `\`${i+1}\` ${v}`).join('\n');
    return `📌 Qual a **Origem PR** (de onde veio essa demanda)?\n\n${opcoesOrigem}`;
  }

  // ── Origem PR ─────────────────────────────────────────────────────────────
  if (etapa === 'origem') {
    const idx = parseInt(msg) - 1;
    const valores = ENUM_VALUES['Origem PR'];
    if (!isNaN(idx) && idx >= 0 && idx < valores.length) {
      conversa.dados.origem = valores[idx];
    } else {
      const match = encontrarValor('Origem PR', msg);
      if (!match) return `⚠️ Origem inválida. Digite o número de 1 a ${valores.length}.`;
      if (Array.isArray(match)) {
        if (match.length === 1) { conversa.dados.origem = match[0]; }
        else {
          conversa.aguardandoSelecao = { campo: 'Origem PR', opcoes: match, proximaEtapa: 'origem' };
          return `🔍 Encontrei várias opções para "${msg}":\n\n` + match.map((v, i) => `\`${i+1}\` ${v}`).join('\n') + '\n\nQual delas?';
        }
      } else { conversa.dados.origem = match; }
    }
    conversa.etapa = 'relevancia';
    return `⭐ Qual a **Relevância**?\n\n\`1\` 🔴 Bloqueadora\n\`2\` 🟠 Crítica\n\`3\` 🟡 Alta\n\`4\` 🟢 Normal\n\`5\` ⚪ Baixa`;
  }

  // ── Relevância ────────────────────────────────────────────────────────────
  if (etapa === 'relevancia') {
    const r = RELEVANCIAS[msg];
    if (!r) return '⚠️ Digite `1` a `5` para escolher a relevância.';
    conversa.dados.relevancia = r;

    // Próxima etapa depende do tipo
    if (tipo === 'Demanda') {
      conversa.etapa = 'gerar_titulo';
      return await gerarTituloEConfirmar(conversa);
    }
    conversa.etapa = 'fornecedor';
    return `🏭 Qual o **fornecedor**? (ou `-` para pular)\n\nExemplos: Claro, TIM, Vivo, CardMais, Incomm...`;
  }

  // ── Fornecedor ────────────────────────────────────────────────────────────
  if (etapa === 'fornecedor') {
    if (msg !== '-') {
      const match = encontrarValor('Fornecedor', msg);
      if (!match) { conversa.dados.fornecedor = msg; } // aceita valor livre
      else if (Array.isArray(match) && match.length > 1) {
        conversa.aguardandoSelecao = { campo: 'Fornecedor', opcoes: match, proximaEtapa: 'fornecedor' };
        return `🔍 Encontrei várias opções para "${msg}":\n\n` + match.map((v, i) => `\`${i+1}\` ${v}`).join('\n') + '\n\nQual delas?';
      } else {
        conversa.dados.fornecedor = Array.isArray(match) ? match[0] : match;
      }
    }
    conversa.etapa = 'produto';
    return `📦 Qual o **produto**? (ou \`-\` para pular)\n\nExemplos: CardMais APP, CardMais POS, Tecfin...`;
  }

  // ── Produto ───────────────────────────────────────────────────────────────
  if (etapa === 'produto') {
    if (msg !== '-') {
      const match = encontrarValor('Produto', msg);
      if (!match) { conversa.dados.produto = msg; }
      else if (Array.isArray(match) && match.length > 1) {
        conversa.aguardandoSelecao = { campo: 'Produto', opcoes: match, proximaEtapa: 'produto' };
        return `🔍 Encontrei várias opções para "${msg}":\n\n` + match.map((v, i) => `\`${i+1}\` ${v}`).join('\n') + '\n\nQual delas?';
      } else {
        conversa.dados.produto = Array.isArray(match) ? match[0] : match;
      }
    }

    // Frente de negócio para Oportunidade
    if (tipo === 'Oportunidade') {
      conversa.etapa = 'frente_negocio';
      const opcoes = ENUM_VALUES['Frente de Negócio'].map((v, i) => `\`${i+1}\` ${v}`).join('\n');
      return `🏢 Qual a **Frente de Negócio**?\n\n${opcoes}`;
    }

    // Sistema para Melhoria
    if (tipo === 'Melhoria') {
      conversa.etapa = 'sistema';
      const opcoes = ENUM_VALUES['Sistema'].map((v, i) => `\`${i+1}\` ${v}`).join('\n');
      return `💻 Qual o **Sistema** envolvido?\n\n${opcoes}`;
    }

    conversa.etapa = 'gerar_titulo';
    return await gerarTituloEConfirmar(conversa);
  }

  // ── Frente de Negócio ─────────────────────────────────────────────────────
  if (etapa === 'frente_negocio') {
    const idx = parseInt(msg) - 1;
    const valores = ENUM_VALUES['Frente de Negócio'];
    if (!isNaN(idx) && idx >= 0 && idx < valores.length) {
      conversa.dados.frenteNegocio = valores[idx];
    } else {
      const match = encontrarValor('Frente de Negócio', msg);
      if (!match) return `⚠️ Opção inválida. Digite o número de 1 a ${valores.length}.`;
      if (Array.isArray(match) && match.length > 1) {
        conversa.aguardandoSelecao = { campo: 'Frente de Negócio', opcoes: match, proximaEtapa: 'frenteNegocio' };
        return `🔍 Encontrei várias opções:\n\n` + match.map((v, i) => `\`${i+1}\` ${v}`).join('\n') + '\n\nQual delas?';
      }
      conversa.dados.frenteNegocio = Array.isArray(match) ? match[0] : match;
    }
    conversa.etapa = 'gerar_titulo';
    return await gerarTituloEConfirmar(conversa);
  }

  // ── Sistema (Melhoria) ────────────────────────────────────────────────────
  if (etapa === 'sistema') {
    const idx = parseInt(msg) - 1;
    const valores = ENUM_VALUES['Sistema'];
    if (!isNaN(idx) && idx >= 0 && idx < valores.length) {
      conversa.dados.sistema = valores[idx];
    } else {
      const match = encontrarValor('Sistema', msg);
      if (!match) return `⚠️ Opção inválida. Digite o número de 1 a ${valores.length}.`;
      if (Array.isArray(match) && match.length > 1) {
        conversa.aguardandoSelecao = { campo: 'Sistema', opcoes: match, proximaEtapa: 'sistema' };
        return `🔍 Encontrei:\n\n` + match.map((v, i) => `\`${i+1}\` ${v}`).join('\n') + '\n\nQual delas?';
      }
      conversa.dados.sistema = Array.isArray(match) ? match[0] : match;
    }
    conversa.etapa = 'gerar_titulo';
    return await gerarTituloEConfirmar(conversa);
  }

  // ── Confirmar título ──────────────────────────────────────────────────────
  if (etapa === 'confirmar_titulo') {
    if (msg.toLowerCase() !== 's' && msg.toLowerCase() !== 'sim') {
      conversa.etapa = 'titulo_manual';
      return '✏️ Digite o título que prefere para o item:';
    }
    conversa.etapa = 'confirmar_criacao';
    return gerarResumoFinal(conversa);
  }

  // ── Título manual ─────────────────────────────────────────────────────────
  if (etapa === 'titulo_manual') {
    conversa.dados.titulo = msg;
    conversa.etapa = 'confirmar_criacao';
    return gerarResumoFinal(conversa);
  }

  // ── Confirmação final ─────────────────────────────────────────────────────
  if (etapa === 'confirmar_criacao') {
    const r = msg.toLowerCase();
    if (r === 'n' || r === 'não' || r === 'nao') {
      delete conversas[userId];
      return '❌ Cancelado. Digite **!criar** para começar novamente.';
    }
    if (r !== 's' && r !== 'sim') return '⚠️ Digite **S** para confirmar ou **N** para cancelar.';

    try {
      const issue = await criarIssue(conversa.dados);
      delete conversas[userId];
      return `✅ **Item criado com sucesso!**\n\n• **ID:** ${issue.idReadable}\n• **Tipo:** ${conversa.dados.tipo}\n• **Título:** ${issue.summary}\n\n🔗 Abrir: ${YOUTRACK_URL}/issue/${issue.idReadable}`;
    } catch (e) {
      console.error('Erro YouTrack:', e.response?.data || e.message);
      return `❌ Erro ao criar no YouTrack: ${e.message}`;
    }
  }

  return null;
}

async function gerarTituloEConfirmar(conversa) {
  const titulo = await sugerirTitulo(conversa.dados.tipo, conversa.dados.descricao);
  conversa.dados.titulo = titulo;
  conversa.etapa = 'confirmar_titulo';
  return `🤖 Título sugerido pelo assistente:\n\n**"${titulo}"**\n\nAceita? Digite **S** para confirmar ou **N** para digitar outro.`;
}

function gerarResumoFinal(conversa) {
  const d = conversa.dados;
  const linhas = [
    `📋 **Resumo do item a criar:**\n`,
    `• **Tipo:** ${d.tipo}`,
    `• **Título:** ${d.titulo}`,
    `• **Origem PR:** ${d.origem}`,
    `• **Relevância:** ${d.relevancia}`
  ];
  if (d.frenteNegocio) linhas.push(`• **Frente de Negócio:** ${d.frenteNegocio}`);
  if (d.fornecedor) linhas.push(`• **Fornecedor:** ${d.fornecedor}`);
  if (d.produto) linhas.push(`• **Produto:** ${d.produto}`);
  if (d.sistema) linhas.push(`• **Sistema:** ${d.sistema}`);
  linhas.push(`\nConfirma a criação? Digite **S** para criar ou **N** para cancelar.`);
  return linhas.join('\n');
}

// ─── Rotas ────────────────────────────────────────────────────────────────────
// Outgoing Webhook do Teams
app.post('/webhook', async (req, res) => {
  if (!validarToken(req)) {
    console.warn('Token inválido');
    return res.status(401).json({ type: 'message', text: '⛔ Token inválido.' });
  }
  try {
    const userId = req.body.from?.id || 'unknown';
    const texto = req.body.text || '';
    const resposta = await processarMensagem(userId, texto);
    return res.json({ type: 'message', text: resposta || '' });
  } catch (e) {
    console.error('Erro webhook:', e);
    return res.status(500).json({ type: 'message', text: '❌ Erro interno. Tente novamente.' });
  }
});

// Rota para o Copilot Studio (campos simples)
app.post('/criar', async (req, res) => {
  try {
    const dados = req.body;
    if (!dados.tipo || !dados.titulo || !dados.relevancia || !dados.origem) {
      return res.status(400).json({ erro: 'Campos obrigatorios: tipo, titulo, relevancia, origem' });
    }
    const issue = await criarIssue(dados);
    return res.json({ idReadable: issue.idReadable, summary: issue.summary, url: `${YOUTRACK_URL}/issue/${issue.idReadable}` });
  } catch (e) {
    console.error('Erro /criar:', e.response?.data || e.message);
    return res.status(500).json({ erro: e.message });
  }
});

// Rota para buscar valores de enum (para o Copilot Studio)
app.get('/enum/:campo', (req, res) => {
  const campo = decodeURIComponent(req.params.campo);
  const valores = ENUM_VALUES[campo];
  if (!valores) return res.status(404).json({ erro: 'Campo não encontrado' });
  return res.json({ campo, valores });
});

app.get('/', (req, res) => res.json({ status: 'BotWay online 🤖', versao: '2.0.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BotWay v2.0.0 rodando na porta ${PORT}`));