# FocusUp — Arena do Conhecimento

> Aplicativo pessoal de estudos, consistência, repetição espaçada e produtividade. Funciona 100% no cliente (offline-first PWA) com persistência local IndexedDB.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Tests](https://img.shields.io/badge/tests-19%2F19%20passing-brightgreen.svg)]()
[![PWA](https://img.shields.io/badge/PWA-offline--ready-blue.svg)]()
[![Database](https://img.shields.io/badge/IndexedDB-Dexie.js-orange.svg)]()

---

## ✨ Funcionalidades Centrais

- ⏱️ **Câmara de Foco Resiliente:** Pomodoro (25m), Deep Work (50m) e Modo 5 Minutos. Baseado em timestamps UTC reais (`startedAt` e `accumulatedPausedMs`) que sobrevivem a suspensão de abas no celular ou recarregamento de página. Pausas não computam como estudo.
- 🧠 **Repetição Espaçada (SRS com Ease Factor):** Algoritmo determinístico inspirado no SM-2 simplificado. Avaliações *Difícil*, *Médio* e *Fácil* que adaptam os intervalos de revisão dinamicamente.
- 📅 **Planejador Semanal Heurístico:** Distribui atividades, revisões de flashcards e tarefas respeitando estritamente a capacidade diária em minutos configurada pelo usuário. Alerta sobrecarga de forma transparente sem descartar tarefas silenciosamente.
- 📊 **Revisão Semanal Baseada em Regras:** Análise determinística que detecta matérias negligenciadas, concentração excessiva de tempo e sugere o direcionamento da próxima semana.
- 🎓 **Trilhas de Aprendizagem Interativas:** Módulos e aulas com progresso percentual dinâmico e botões para iniciar foco direto no conteúdo.
- 💼 **Arsenal de Projetos (Portfólio):** Cadastre projetos de software com tags de habilidades, links para repositórios GitHub e demonstrações ao vivo.
- 🛡️ **Cofre de Dados (Backup & Restore com Merge LWW):** Exportação JSON completa com validação Zod e restauração com opção de *Substituição Total* ou *Mesclagem Determinística Last-Write-Wins (LWW)*.
- ⚡ **Identidade Gamificada no Tema Claro:** Níveis (1 a 7), títulos RPG, cálculo real de XP por minutos estudados e celebração com confetes.

---

## 🛠️ Stack Tecnológica

- **Frontend:** React 19, TypeScript, Vite
- **Estilização:** Tailwind CSS v4, Lucide React
- **Persistência Offline:** Dexie.js (IndexedDB)
- **Validação de Dados:** Zod
- **PWA:** Vite Plugin PWA com Service Worker offline e Web App Manifest
- **Testes Automatizados:** Vitest (19 testes cobrindo todas as regras de negócio)

---

## 🚀 Como Executar

### Pré-requisitos
- Node.js 18+ instalado
- npm ou pnpm

### Instalação
```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento local
npm run dev
```

### Executar Testes Automatizados
```bash
npx vitest run
```

### Compilar para Produção (PWA)
```bash
npm run build
```

---

## 📄 Licença
Distribuído sob a licença MIT.
