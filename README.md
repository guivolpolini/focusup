# ⚡ FocusUp

> **Sua rotina de estudos, faculdade e treinos em um único lugar — 100% seu, direto no seu bolso e sem assinaturas.**

[![React](https://img.shields.io/badge/React-19-61dafb.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PWA](https://img.shields.io/badge/PWA-Instalável%20%26%20Offline-4f46e5.svg?style=flat-square)](https://web.dev/progressive-web-apps/)
[![Testes Automatizados](https://img.shields.io/badge/Testes-68%20passando-10b981.svg?style=flat-square)](https://vitest.dev)
[![Privacidade](https://img.shields.io/badge/Privacidade-100%25%20Local%20(IndexedDB)-f59e0b.svg?style=flat-square)]()

---

## 💡 Por que o FocusUp nasceu?

Equilibrar disciplinas difíceis da faculdade, projetos de programação, metas de academia e hábitos do dia a dia é cansativo. 

A maioria dos aplicativos por aí exige contas, cobra assinaturas mensais caras, enche a tela de anúncios ou perde seus dados quando a internet cai. Pior: dividem sua vida em 4 ou 5 apps diferentes que não conversam entre si.

O **FocusUp** foi criado para ser o inverso disso:
- **Tudo em um só lugar:** foco nos estudos, grade da faculdade, fichas da academia e hábitos diários.
- **Funciona de verdade offline:** se o sinal cair no metrô ou na academia, o app continua funcionando na hora.
- **Seus dados pertencem a você:** nada de rastreadores ou servidores externos. Tudo fica salvo diretamente no armazenamento seguro do seu próprio navegador (**IndexedDB** via Dexie).
- **Sem falsas promessas:** métricas honestas e baseadas apenas nas horas e treinos que você realmente concluiu.

---

## 🎯 O que o FocusUp faz por você?

### ⏱️ 1. Câmara de Foco (Pomodoro & Deep Work)
- Modos pré-configurados: **Pomodoro clássico (25m)**, **Deep Work (50m)** ou o **Modo 5 Minutos** (para vencer a procrastinação inicial).
- **Resiliente a bloqueio de tela:** o cronômetro usa marcas de tempo reais (UTC). Se você bloquear o celular, mudar de aba ou a tela apagar, o tempo não se perde e as pausas são contabilizadas com precisão.
- Notificações sonoras e vibração suave ao concluir cada ciclo.

### 🎓 2. Portal da Faculdade & Matérias
- **Grade Horária Semanal:** veja suas aulas organizadas por dia da semana com sala, professor e horários.
- **Simulador de Médias e Notas:** saiba exatamente quanto precisa tirar nas próximas provas para passar de ano sem pânico de última hora.
- **Importador Inteligente:** cole o texto da sua ementa ou importe arquivos (PDF/TXT) para cadastrar matérias e horários automaticamente.

### 🏋️ 3. Quartel da Academia (Treino com Propósito)
- **Fichas personalizadas:** organize treinos (Push/Pull/Legs, ABC, Fullbody) com séries, repetições alvo e descanso programado.
- **Carga anterior em 1 clique:** veja instantaneamente quanto peso você ergueu no último treino para buscar a sobrecarga progressiva com facilidade (`+2.5kg 🚀`, `+2 reps 🔥`).
- **Alarme de descanso ativo:** bipe melódico e vibração no celular para você não se perder no feed do Instagram entre as séries.
- **Proteção contra toques acidentais:** treinos sem séries não poluem sua meta semanal.

### 🌿 4. Rastreador de Hábitos Saudáveis
- Cadastre hábitos com frequências reais: diários, dias fixos ou X vezes na semana (ex: beber água, alongar, ler 15 minutos).
- **Sem penalidades injustas:** dias de descanso não contam como falha e dias futuros não quebram sua sequência.
- Histórico visual e taxa de consistência honesta.

### 📊 5. Relatório & Análise Semanal
- Veja o panorama completo da sua semana: horas dedicadas a cada matéria, quantidade de treinos feitos e evolução dos seus hábitos.
- Gráficos limpos que mostram seus melhores dias e matérias que merecem mais carinho na semana seguinte.
- Destaques objetivos calculados diretamente do que você viveu, sem adivinhações.

### 🧭 6. Trilhas de Aprendizagem & Portfólio
- Estruture trilhas de estudo passo a passo (tecnologias, certificações, livros) e acompanhe seu progresso aula a aula.
- Guarde seus projetos de programação com links para o GitHub e demos ao vivo.

### 🛡️ 7. Cofre de Dados (Backup & Restauração)
- Exporte toda a sua vida registrada em um arquivo JSON seguro com validação rigorosa (Zod).
- Trocou de celular ou quer sincronizar com o computador? Restaure ou mescle seus dados sem perder nada.

---

## 📱 Como colocar no seu Celular (iPhone ou Android)

O FocusUp foi construído como um **PWA (Progressive Web App)** de última geração. Isso significa que ele vira um app nativo no seu celular sem precisar de App Store ou Google Play:

1. Acesse o link do seu FocusUp pelo navegador do celular (Safari no iPhone, Chrome no Android).
2. Toque no menu de opções:
   - **No iPhone (Safari):** Toque no botão de **Compartilhar** (quadrado com seta para cima) → selecione **"Adicionar à Tela de Início"**.
   - **No Android (Chrome):** Toque nos **3 pontos verticais** no canto superior → selecione **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**.
3. Um ícone do FocusUp aparecerá na sua tela inicial. Ele abrirá em tela cheia, com barra de navegação ergonômica para o polegar e funcionará até no modo avião!

---

## 🛠️ Stack Tecnológica

- **Interface:** [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- **Estilos & Responsividade:** [Tailwind CSS v4](https://tailwindcss.com) + [Lucide Icons](https://lucide.dev)
- **Banco de Dados Local:** [Dexie.js](https://dexie.org) (IndexedDB nativo do navegador)
- **Validação de Schemas:** [Zod](https://zod.dev)
- **PWA & Offline:** [Vite PWA](https://vite-pwa-org.netlify.app/) com Service Worker automático
- **Testes Unitários:** [Vitest](https://vitest.dev) (68 testes automatizados)
- **Efeitos Sonoros & Vibração:** Web Audio API e Vibration API nativas do navegador

---

## 🚀 Como rodar localmente no seu computador

Se você quiser rodar o projeto no seu próprio ambiente de desenvolvimento:

```bash
# 1. Clone o repositório
git clone https://github.com/guivolpolini/focusup.git

# 2. Entre na pasta do projeto
cd focusup

# 3. Instale as dependências
npm install

# 4. Inicie o servidor local
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173) no seu navegador para ver o FocusUp rodando.

### Testar no celular pelo Wi-Fi local
```bash
npm run dev -- --host
```
O terminal exibirá o endereço de rede (ex: `http://192.168.1.X:5173`). Abra esse link no celular conectado no mesmo Wi-Fi.

### Rodar os testes automatizados
```bash
npx vitest run
```

### Gerar build de produção
```bash
npm run build
```

---

## 🤝 Filosofia do Projeto

- **Zero dependência de servidores terceiros:** nada de surpresas com APIs fora do ar ou cobranças inesperadas.
- **Simplicidade e Respeito:** ferramentas que te ajudam a ter clareza, e não mais uma distração para disputar sua atenção.

---

## 📄 Licença

Distribuído sob a licença **MIT**. Sinta-se livre para usar, estudar, modificar e adaptar para suas próprias necessidades.

<p align="center">
  Feito com foco e dedicação por <b>Guilherme Volpolini</b> ⚡
</p>
