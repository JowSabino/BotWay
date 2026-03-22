# BotWay 🤖

Bot conversacional para criação de itens no YouTrack via Microsoft Teams.

## Variáveis de ambiente (configurar no Render)

| Variável | Descrição |
|---|---|
| `ANTHROPIC_KEY` | Chave da API Anthropic (`sk-ant-...`) |
| `YOUTRACK_TOKEN` | Token de API do YouTrack |
| `YOUTRACK_URL` | URL base do YouTrack (ex: `https://youtrack.cardway.net.br/youtrack`) |
| `YOUTRACK_PROJECT` | ID interno do projeto (ex: `0-64`) |
| `TEAMS_WEBHOOK` | URL do webhook do canal BotWay no Teams |

## Como usar no Teams

- Digite `!criar` no canal BotWay para iniciar
- Responda as perguntas uma por uma
- Digite `!cancelar` para cancelar a qualquer momento
