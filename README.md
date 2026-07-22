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

## Fluxo da aplicação (v3)

1. **Setup**: formato (dropdown Standard/Commander), vida inicial (6 presets —
   20/25/30/40/50/60 — dentro do intervalo permitido 20–80), qtd. de
   jogadores (2–6), orientação (rotação automática por assento vs. todos
   eretos) e som (on/off). Botão "Consultar o Oráculo".
2. **Oráculo — 3 cliques manuais na mesma tela**:
   - Clique 1 ("Invocar o Oráculo"): sorteia e revela os decks de cada jogador
     (cards animados, um a um).
   - Clique 2 ("Sortear Play/Draw"): joga a moeda e mostra quem tem prioridade.
   - Clique 3 ("Iniciar Partida"): entra na tela de vida.
3. **Partida — dial de vida por jogador**: metade **direita = +1**, metade
   **esquerda = −1** a cada toque. Segurar parado repete automaticamente; a
   partir de um certo deslocamento, **arrastar o dedo** passa a controlar a
   contagem diretamente (cada ~24px = 1 ponto, na direção do arraste) — como
   girar um dial. Menu radial central em forma de roda, com 5 segmentos:
   **Vida** (editar valor exato via modal temático), **Jogadores** (mudar a
   quantidade de jogadores em plena partida), **Dado/Coin** (moeda, d6, d10,
   d100), **Reset** (volta ao setup) e **Menu** (desfazer última jogada,
   alternar som).

## O que este código já resolve (vs. protótipo anterior)

- ✅ Backend real conectado à planilha (`oracle.js` + `Code.gs`), com filtro por formato
- ✅ Fluxo Play/Draw manual, em etapas explícitas (não mais automático)
- ✅ Dados corretos: coin, d6, d10, d100
- ✅ Dial de vida por toque **e** arraste (não só toque), com direção
  coerente em zonas rotacionadas 180°
- ✅ Suporte a 2–6 jogadores e vida inicial 20–80 (6 presets rápidos no setup)
- ✅ Detecção de vitória/derrota + som (com toggle) + overlay
- ✅ Undo de vida, histórico de delta persistente por jogador
- ✅ Wake Lock, áudio sintetizado (Web Audio API), PWA instalável
- ✅ Menu radial redesenhado como roda de segmentos temática (SVG), incluindo
  edição de quantidade de jogadores em plena partida
- ✅ Modais temáticos (edição de vida, jogadores, dado/coin, menu) substituindo
  `prompt()`/`alert()` do MVP anterior
- ✅ Orientação configurável (rotação automática por assento vs. todos eretos)
- ✅ Resultado da partida salvo na aba "Resultados" **+ log detalhado por
  evento de vida** na aba "Log" — ambos exportáveis como CSV via
  `?action=exportResultsCsv` / `?action=exportLogCsv`
- ✅ Tema visual MTG (Cinzel/Inter, paleta arcana + laranja, orbe animado)

## Pendências conhecidas (documentadas de propósito, não escondidas)

- **Persona visual do oráculo**: implementada como um busto místico abstrato
  e genérico — deliberadamente **não** uma tentativa de semelhança realista
  com pessoas reais nomeadas (Adelson/Roosevelt), por ser conteúdo sensível
  de retratar. A referência de humor continua no orbe/tema, mas sem tentar
  gerar likeness de figuras públicas.
- **Layouts diagonais/hexagonais (3/5/6 jogadores)**: permanecem retangulares.
  Uma divisão diagonal em "Y" pro layout de 3 jogadores foi avaliada
  (`clip-path` em 3 zonas sobrepostas) mas descartada nesta rodada: o número
  de vida fica centralizado na zona inteira, não no centroide do recorte
  diagonal, e o toque direito/esquerdo (que hoje usa a metade da caixa
  delimitadora) para de fazer sentido geometricamente numa zona em cunha —
  os dois problemas dão pra resolver, mas exigem ajuste fino visual num
  navegador real antes de entrar. Ficou pra uma próxima rodada dedicada a isso.
- **Formato do dropdown**: continua limitado a Standard/Commander (mesmo
  conjunto de antes, só que como `<select>` em vez de pills, pra bater com o
  mockup) — nenhum formato novo foi adicionado.
- **Deploy do backend**: as mudanças em `gas/Code.gs` (abas "Log", CSV,
  `matchId`, limite de 6 jogadores) só valem depois de colar o arquivo
  atualizado no Apps Script e reimplantar (mesmo passo do "Deploy —
  passo a passo" acima). Enquanto isso não for feito, o app continua
  funcionando normalmente (o POST antigo é compatível), só sem o log
  granular novo.
- **CORS do Apps Script**: testado com o padrão `text/plain` para evitar
  preflight. Fallback local já existe em `oracle.js` caso a API falhe.
