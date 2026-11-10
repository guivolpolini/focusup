# FocusUp

Web app (PWA) para acompanhamento diário de foco, treinos de musculação, hábitos e finanças pessoais. Funciona offline e armazena todos os registros localmente no navegador via IndexedDB, sem exigir login e sem depender de backend externo.

Disponível em produção: [focusup-phi.vercel.app](https://focusup-phi.vercel.app/)

## Visão geral

O FocusUp organiza as rotinas do dia em quatro áreas principais:

- **Hoje**: painel central com botão de foco rápido (25 min), check-in de treino do dia, checklist de hábitos, resumo da agenda e visão compacta das finanças do mês.
- **Finanças**: controle de saldo atual e projetado, cartões de crédito com fechamento e vencimento, despesas fixas recorrentes, gráficos por categoria, importador de extrato bancário em CSV e registro de gastos por comando de voz via Web Speech API.
- **Progresso**: mapa de consistência anual com visão de blocos estilo GitHub, estatísticas de tempo estudado e balanço semanal de atividades.
- **Mais**: acesso direto às telas detalhadas de Estudos (timer com timestamps UTC imune a abas fechadas), Fichas de Academia com histórico de carga por série, Agenda de compromissos e módulo de Backup.

## Instalação no celular (PWA)

O aplicativo pode ser instalado direto pelo navegador:

- **iOS (Safari)**: toque no botão de compartilhar e selecione "Adicionar à Tela de Início".
- **Android (Chrome)**: toque no menu de três pontos e selecione "Instalar aplicativo" ou "Adicionar à tela inicial".

Depois de instalado, o app roda em tela cheia e funciona normalmente sem conexão com a internet.

## Tecnologias

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React
- **Armazenamento**: IndexedDB gerenciado via Dexie.js
- **PWA e Service Worker**: Vite PWA com Workbox
- **Validação de dados**: Zod (utilizado nos modelos e na validação do backup)
- **APIs nativas do navegador**: Web Audio API (alertas sonoros do timer), Vibration API (feedback tátil), Web Speech API (reconhecimento de voz para gastos)
- **Testes**: Vitest (121 testes unitários e de integração cobrindo regras financeiras, agenda, hábitos e lógica de treinos)

## Como rodar localmente

Pré-requisito: Node.js 18 ou superior.

```bash
# Clonar o repositório
git clone https://github.com/guivolpolini/focusup.git

# Entrar na pasta
cd focusup

# Instalar dependências
npm install

# Iniciar o servidor local de desenvolvimento
npm run dev
```

O aplicativo roda localmente no endereço `http://localhost:5173`.

### Testes e build

```bash
# Executar a suíte de testes automatizados
npx vitest run

# Gerar o build de produção
npm run build
```

## Dados e privacidade

Nenhum dado financeiro ou de rotina sai do aparelho. Todas as informações ficam salvas no IndexedDB local do próprio navegador.

Na tela de Configurações é possível exportar um arquivo JSON com o backup completo de todas as tabelas para guardar ou restaurar em outro dispositivo.

## Licença

MIT
