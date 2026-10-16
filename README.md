# ⚡ FocusUp

Aplicativo progressivo (PWA) para gestão pessoal de foco, treinos, hábitos e finanças. Funciona direto no navegador, roda 100% offline e armazena os dados localmente no dispositivo via IndexedDB, sem dependência de contas ou servidores externos.

[![React](https://img.shields.io/badge/React-19-61dafb.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PWA](https://img.shields.io/badge/PWA-Instalável%20%26%20Offline-4f46e5.svg?style=flat-square)](https://web.dev/progressive-web-apps/)
[![Testes Automatizados](https://img.shields.io/badge/Testes-97%20passando-10b981.svg?style=flat-square)](https://vitest.dev)
[![Privacidade](https://img.shields.io/badge/Armazenamento-Local%20(IndexedDB)-f59e0b.svg?style=flat-square)]()

---

## Funcionalidades

### 1. Dashboard Integrado
Visão unificada das principais áreas do dia: sessões de foco acumuladas, status dos treinos, conclusão de hábitos da rotina, resumo financeiro rápido e nível de disciplina gamificado.

### 2. Timer de Foco (Pomodoro & Deep Work)
- Modos pré-configurados: Pomodoro (25 min), Deep Work (50 min) e Modo 5 Minutos.
- Cronômetro calculado por timestamps reais em UTC, mantendo a contagem exata mesmo com a tela do celular bloqueada ou ao trocar de aba.
- Alertas sonoros e vibração ao término de cada bloco e intervalo.

### 3. Painel Financeiro Completo
- **Indicadores em tempo real:** Saldo atual em conta, saldo projetado do mês, total de receitas recebidas, despesas realizadas, faturas em aberto e saldo de limite orçamentário.
- **Orçamento Mensal:** Barra de progresso do teto de gastos definido pelo usuário com alertas de aproximação do limite.
- **Gastos Fixos e Recorrências:** Cadastro de despesas fixas (mensais, semanais, trimestrais ou anuais), com suporte a gastos com data definida ou apenas recorrentes no mês. Permite dar baixa, pausar ou excluir sem gerar lançamentos duplicados.
- **Cartões de Crédito:** Controle de dia de fechamento, vencimento de fatura, limite total e limite disponível.
- **Registro por Comando de Voz:** Captura natural de voz via Web Speech API ("Gastei 45 reais no mercado no débito") com conversão automática de valor, forma de pagamento e categoria, incluindo fallback digitável e botão flutuante (FAB).
- **Importador de Extrato CSV:** Upload de arquivos bancários com detecção automática de estabelecimentos, valores e seleção de categorias por linha.
- **Gráficos Analíticos:** Distribuição de despesas por categoria, evolução financeira dos últimos meses e proporção entre despesas fixas e variáveis.

### 4. Treino & Academia
- Criação e edição de fichas personalizadas (Push, Pull, Legs, ABC, Fullbody).
- Consulta instantânea da carga e repetições da sessão anterior para guiar sobrecarga progressiva.
- Cronômetro de descanso entre séries com bipes de aviso sonoro e feedback tátil.

### 5. Rastreador de Hábitos
- Configuração de hábitos com metas diárias, dias fixos da semana ou frequência semanal flexível.
- Histórico visual de sequências (streaks) e taxa de consistência real sem penalizações em dias de descanso planejados.

### 6. Relatório Semanal
- Consolidação do tempo investido em foco, frequência de treinos concluídos e aproveitamento de hábitos.
- Visão comparativa por dia da semana para identificar padrões de produtividade.

### 7. Gamificação & Progresso
- Pontuação de XP e níveis acumulados a partir de ciclos de foco finalizados, treinos executados e hábitos compridos.

### 8. Backup e Privacidade
- Todos os dados ficam salvos no IndexedDB do navegador através do Dexie.js.
- Exportação e restauração completa de backup em formato JSON com validação via Zod.

---

## Como instalar no celular (PWA)

O FocusUp pode ser instalado na tela de início sem passar por lojas de aplicativos:

- **No iPhone (Safari):** Toque no botão de compartilhar (ícone com seta para cima) e escolha **"Adicionar à Tela de Início"**.
- **No Android (Chrome):** Abra o menu do navegador (três pontos) e selecione **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**.

O app abre em modo tela cheia e continua acessível mesmo sem conexão à internet.

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Interface | React 19, TypeScript, Lucide Icons |
| Estilização | Tailwind CSS v4 |
| Banco Local | Dexie.js (IndexedDB) |
| Validação | Zod |
| PWA / Cache | Vite PWA, Service Worker |
| Testes | Vitest (97 testes unitários e de integração) |
| Áudio / Tátil | Web Audio API, Vibration API, Web Speech API |

---

## Desenvolvimento Local

```bash
# 1. Clonar repositório
git clone https://github.com/guivolpolini/focusup.git

# 2. Entrar na pasta
cd focusup

# 3. Instalar dependências
npm install

# 4. Iniciar servidor de desenvolvimento
npm run dev

# 5. Executar suíte de testes automatizados
npx vitest run

# 6. Gerar build de produção
npm run build
```

---

## Licença

Distribuído sob a licença **MIT**.
