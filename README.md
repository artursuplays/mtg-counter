# MTG Life Counter

Contador de vida temático para Magic: The Gathering. Front-end estático (GitHub Pages) + backend real via Google Apps Script (planilha de decks + resultados).

## Estrutura

```
mtg-counter/
  index.html
  css/style.css
  js/
    app.js     — config, estado global, wake lock, áudio sintetizado
    ui.js      — DOM, menu radial, overlays
    game.js    — vida, dial, undo, vitória/derrota
    dice.js    — coin, d6, d10, d100
    oracle.js  — busca decks reais + coinflip Play/Draw
  assets/
    icons/     — ícones PWA (placeholders gerados — troque pelos definitivos)
  gas/Code.gs  — backend Apps Script (deploy separado, não vai pro Pages)
  manifest.json, sw.js — PWA
```

## Deploy — passo a passo

### 1. Planilha + Apps Script
1. Crie uma Google Sheet nova.
2. Crie uma aba **"Decks"** com colunas: `Nome | Formato | Emoji`.
3. Extensions > Apps Script → cole o conteúdo de `gas/Code.gs`.
4. Deploy > New deployment > **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copie a URL `.../exec`.
6. Cole essa URL em `js/app.js` na constante `CONFIG.API_URL`.

### 2. Git + GitHub Pages
```bash
cd mtg-counter
git init
git add .
git commit -m "Initial commit: MTG Life Counter"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/mtg-counter.git
git push -u origin main
```
No GitHub: **Settings > Pages > Source: main /(root)**. O site fica em
`https://SEU_USUARIO.github.io/mtg-counter/`.

### 3. Ícones definitivos
Os PNGs em `assets/icons/` são placeholders gerados automaticamente (círculo
laranja com "20"). Troque por arte real nos tamanhos 192x192 e 512x512.

## Fluxo da aplicação (v2)

1. **Setup**: formato (Standard/Commander), vida inicial (slider 20–40), qtd. de
   jogadores (2–6). Botão "Consultar o Oráculo".
2. **Oráculo — 3 cliques manuais na mesma tela**:
   - Clique 1 ("Invocar o Oráculo"): sorteia e revela os decks de cada jogador
     (cards animados, um a um).
   - Clique 2 ("Sortear Play/Draw"): joga a moeda e mostra quem tem prioridade.
   - Clique 3 ("Iniciar Partida"): entra na tela de vida.
3. **Partida**: toque direcional em cada zona — metade **direita = +1**, metade
   **esquerda = −1**. Segurar repete automaticamente (conveniência; o toque
   único já é funcional). Menu radial central com Vida / Undo / Dado / Coin / Reset.

## O que este código já resolve (vs. protótipo anterior)

- ✅ Backend real conectado à planilha (`oracle.js` + `Code.gs`), com filtro por formato
- ✅ Fluxo Play/Draw manual, em etapas explícitas (não mais automático)
- ✅ Dados corretos: coin, d6, d10, d100
- ✅ Toque direcional (single touch) substituindo o antigo mecanismo de arrastar
- ✅ Suporte a 2–6 jogadores (layout-6 adicionado) e vida 20–40 via slider
- ✅ Detecção de vitória/derrota + som + overlay
- ✅ Undo de vida, histórico de delta persistente por jogador
- ✅ Wake Lock, áudio sintetizado (Web Audio API), PWA instalável
- ✅ Resultado da partida salvo automaticamente na aba "Resultados"
- ✅ Tema visual MTG (Cinzel/Inter, paleta arcana + laranja, orbe animado)

## Pendências conhecidas (documentadas de propósito, não escondidas)

- **Persona visual do oráculo**: implementada como um busto místico abstrato
  e genérico — deliberadamente **não** uma tentativa de semelhança realista
  com pessoas reais nomeadas (Adelson/Roosevelt), por ser conteúdo sensível
  de retratar. A referência de humor continua no orbe/tema, mas sem tentar
  gerar likeness de figuras públicas.
- **Layouts de 3/5/6 jogadores**: retangulares, não diagonais/hexagonais como
  no mockup original.
- **Edição de vida e sorteio de dado (menu radial)**: usam `prompt()`/`alert()`
  do navegador como MVP funcional. Upgrade natural: modal customizado no tema do app.
- **Mudança de jogadores em partida**: o item "Reset" do menu volta pro setup
  (não há edição de contagem de jogadores no meio do jogo).
- **CORS do Apps Script**: testado com o padrão `text/plain` para evitar
  preflight. Fallback local já existe em `oracle.js` caso a API falhe.
