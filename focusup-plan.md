# FocusUp — Plano de Implementação (Faseado)

## Objetivo
Desenvolver o FocusUp do zero de acordo com a especificação técnica revisada: app pessoal de estudos e produtividade, offline-first (PWA), com persistência IndexedDB (Dexie), timer de foco com resiliência temporal, repetição espaçada (SRS determinístico com ease factor), planejador semanal heurístico, relatórios semanais, e sistema completo de backup/restore com merge determinístico.

---

## Stack Tecnológica Escolhida
- **Core / Bundler:** Vite + React 19 + TypeScript
- **Estilização & UI:** Tailwind CSS v4 + Lucide React + Radix UI / Primitivos shadcn
- **Persistência Local:** Dexie.js (IndexedDB)
- **Validação de Schemas:** Zod
- **Roteamento & Telas:** React Router DOM (Single Page Navigation mobile-first)
- **PWA:** Vite Plugin PWA (`vite-plugin-pwa`) com Service Worker offline
- **Testes:** Vitest + React Testing Library

---

## Fases de Execução

### Fase 1: Auditoria e Diagnóstico (Concluída)
- [x] Inspecionar diretório do projeto (`c:\Users\guilherme\Downloads\focusup`)
- [x] Diagnóstico: pasta vazia, sem código legado
- [x] Elaborar plano mestre de implementação e arquitetura de dados

### Fase 2: Fundação & Persistência Base (Dexie + Models)
- [ ] Inicializar projeto Vite + React + TypeScript + Tailwind CSS
- [ ] Configurar schema Dexie (`src/lib/db.ts`):
  - `subjects`, `tasks`, `learningPaths`, `studySessions`, `flashcards`, `studyPlans`, `weeklyReviews`, `careerGoals`, `preferences`
- [ ] Implementar hook de cronômetro com resiliência temporal baseada em timestamps (`startedAt`, `pausedDurationMs`)
- [ ] Teste unitário: resiliência e cálculo de tempo decorrido do timer

### Fase 3: Revisão Inteligente (Flashcards & SRS)
- [ ] Implementar motor SRS determinístico (`src/lib/srs.ts`):
  - Algoritmo baseado em `easeFactor`, `interval`, `repetitions`
  - Ações: Difícil, Médio, Fácil
- [ ] Interface da Central de Flashcards:
  - Criação/edição/arquivamento de cartões vinculados a matérias/trilhas
  - Modo revisão (pergunta -> virar -> avaliar)
- [ ] Teste unitário: progressão de intervalos e ease factor

### Fase 4: Planejador Semanal Heurístico
- [ ] Algoritmo de empacotamento determinístico (`src/lib/scheduler.ts`):
  - Alocação por disponibilidade diária
  - Priorização: Flashcards do dia > Tarefas atrasadas/urgentes > Matérias prioritárias
  - Detecção de sobrecarga e lista de itens não alocados
- [ ] UI da Agenda Semanal (visão lista mobile / grade desktop) com suporte a reagendamento
- [ ] Teste unitário: respeito a limites de carga horária diária

### Fase 5: Revisão Semanal & Métricas
- [ ] Motor de agregação de métricas reais (`src/lib/weeklyReview.ts`)
- [ ] Regras determinísticas de análise (alertas de desbalanceamento, metas não batidas)
- [ ] Gerador de proposta de plano para próxima semana com opções (Aceitar / Editar / Descartar)
- [ ] UI da página de Progresso e Métricas

### Fase 6: Backup, Restauração & Resolução de Conflitos
- [ ] Validação de schema com Zod (`src/lib/backupSchema.ts`)
- [ ] Exportador de JSON completo com metadados
- [ ] Importador com duas estratégias:
  - Substituição total (com snapshot temporário de segurança)
  - Merge determinístico Last-Write-Wins (LWW) via `updatedAt`
- [ ] Teste unitário: validação de schemas Zod e merge determinístico

### Fase 7: Shell UI Mobile-First, Dashboard & Trilhas
- [ ] Layout com Bottom Navigation (mobile) e Sidebar (desktop)
- [ ] Dashboard Principal: "O que fazer agora?", streak real, metas diárias, atalho de foco
- [ ] Trilhas estruturadas com templates iniciais editáveis (AWS, SQL, NoSQL, Java)
- [ ] Seção de Carreira e Portfólio

### Fase 8: PWA, Bateria de Testes & Verificação Final
- [ ] Configuração do Web App Manifest e Service Worker (offline-first)
- [ ] Execução da suíte completa de testes (Vitest)
- [ ] Build de produção (`npm run build`) e verificação de integridade
