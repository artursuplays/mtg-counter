/**
 * MTG Life Counter — Backend (Google Apps Script)
 * Atua como API JSON pura. NÃO serve HTML (o front-end vive no GitHub Pages).
 *
 * Deploy:
 *   1. Extensions > Apps Script no Google Sheets do projeto.
 *   2. Cole este arquivo como Code.gs.
 *   3. Deploy > New deployment > Web app.
 *      - Execute as: Me
 *      - Who has access: Anyone
 *   4. Copie a URL gerada (.../exec) e cole em js/app.js -> CONFIG.API_URL
 *
 * Planilha esperada (três abas):
 *   "Decks"      | colunas: Nome | Formato | Emoji (opcional)
 *   "Resultados" | criada/gerenciada automaticamente por este script — 1 linha por partida
 *   "Log"        | criada/gerenciada automaticamente por este script — 1 linha por mudança de vida
 */

// ===== CONFIGURAÇÃO =====
const SHEET_DECKS = 'Decks';
const SHEET_RESULTS = 'Resultados';
const SHEET_LOG = 'Log';
const RESULTS_HEADER = ['Timestamp', 'MatchId', 'Formato', 'VidaInicial', 'Jogadores', 'Vencedor', 'ViradasDeVida', 'DuracaoSeg'];
const LOG_HEADER = ['Timestamp', 'MatchId', 'Formato', 'JogadorId', 'JogadorNome', 'Deck', 'Delta', 'VidaResultante'];

/**
 * GET /exec?action=decks
 * Retorna a lista de decks cadastrados na planilha.
 *
 * GET /exec?action=exportResultsCsv | exportLogCsv
 * Retorna a aba correspondente como texto CSV (Content-Type text/csv),
 * pronta pra download — é o "log de partida em CSV" pedido: a planilha já é
 * a fonte de verdade, este endpoint só a serializa sob demanda em vez de
 * escrever um arquivo .csv solto (Apps Script não tem disco persistente
 * fora do Drive, e a planilha já cumpre esse papel).
 */
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'decks';

    if (action === 'decks') {
      return jsonResponse({ ok: true, decks: getDecks() });
    }

    if (action === 'ping') {
      return jsonResponse({ ok: true, status: 'alive', timestamp: new Date().toISOString() });
    }

    if (action === 'exportResultsCsv') {
      return csvResponse(getSheet(SHEET_RESULTS));
    }

    if (action === 'exportLogCsv') {
      return csvResponse(getSheet(SHEET_LOG));
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action }, 400);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}

/**
 * POST /exec  (body: text/plain contendo JSON — evita preflight CORS)
 * Salva o resultado de uma partida na aba "Resultados" e o histórico
 * completo de mudanças de vida na aba "Log" (uma linha por evento).
 * Body esperado:
 * {
 *   "action": "saveResult",
 *   "matchId": "1737400000000-42",
 *   "format": "commander",
 *   "startingLife": 40,
 *   "players": [{ "id": 1, "name": "...", "deck": "...", "finalLife": 12,
 *                 "deltaHistory": [{ "change": -1, "life": 39, "timestamp": 1737400001000 }, ...] }, ...],
 *   "winnerId": 2,
 *   "lifeChanges": 47,
 *   "durationSeconds": 1834
 * }
 */
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'Missing request body' }, 400);
    }

    const body = JSON.parse(e.postData.contents);

    if (body.action !== 'saveResult') {
      return jsonResponse({ ok: false, error: 'Unknown action: ' + body.action }, 400);
    }

    validateResultPayload(body);
    saveResult(body);

    return jsonResponse({ ok: true, saved: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 400);
  }
}

// ===== LÓGICA DE NEGÓCIO =====

function getDecks() {
  const sheet = getSheet(SHEET_DECKS);
  const rows = sheet.getDataRange().getValues();

  if (rows.length < 2) return []; // só cabeçalho ou vazia

  const [header, ...data] = rows;
  const nameIdx = header.indexOf('Nome');
  const formatIdx = header.indexOf('Formato');
  const emojiIdx = header.indexOf('Emoji');

  if (nameIdx === -1) {
    throw new Error('Aba "Decks" precisa ter uma coluna "Nome"');
  }

  return data
    .filter(row => row[nameIdx]) // ignora linhas vazias
    .map(row => ({
      name: String(row[nameIdx]),
      format: formatIdx > -1 ? String(row[formatIdx] || 'Custom') : 'Custom',
      emoji: emojiIdx > -1 ? String(row[emojiIdx] || '🎴') : '🎴'
    }));
}

function validateResultPayload(body) {
  if (!Array.isArray(body.players) || body.players.length < 2 || body.players.length > 6) {
    throw new Error('players deve ter entre 2 e 6 jogadores');
  }
  body.players.forEach((p, i) => {
    if (typeof p.finalLife !== 'number') {
      throw new Error('players[' + i + '].finalLife deve ser numérico');
    }
  });
}

function saveResult(body) {
  const timestamp = new Date();
  const matchId = body.matchId || timestamp.getTime().toString();

  saveResultsSummary(body, timestamp, matchId);
  saveLogRows(body, timestamp, matchId);
}

function saveResultsSummary(body, timestamp, matchId) {
  const sheet = getSheet(SHEET_RESULTS);
  ensureHeader(sheet, RESULTS_HEADER);

  const winner = body.players.find(p => p.id === body.winnerId);
  const playersSummary = body.players
    .map(p => `${p.name || 'P' + p.id} (${p.deck || '—'}): ${p.finalLife}`)
    .join(' | ');

  sheet.appendRow([
    timestamp,
    matchId,
    body.format || 'custom',
    body.startingLife || '',
    playersSummary,
    winner ? (winner.name || 'P' + winner.id) : 'N/A',
    body.lifeChanges || 0,
    body.durationSeconds || 0
  ]);
}

/**
 * Grava o histórico completo de mudanças de vida (um evento por linha).
 * Enviado de uma vez só ao fim da partida (dentro de players[].deltaHistory)
 * em vez de uma chamada de rede por toque — mais robusto em wifi instável
 * de mesa de jogo, e ainda assim gera o log granular por evento.
 */
function saveLogRows(body, timestamp, matchId) {
  if (!body.players.some(p => Array.isArray(p.deltaHistory) && p.deltaHistory.length)) return;

  const sheet = getSheet(SHEET_LOG);
  ensureHeader(sheet, LOG_HEADER);

  const rows = [];
  body.players.forEach(p => {
    (p.deltaHistory || []).forEach(entry => {
      rows.push([
        entry.timestamp ? new Date(entry.timestamp) : timestamp,
        matchId,
        body.format || 'custom',
        p.id,
        p.name || ('P' + p.id),
        p.deck || '—',
        entry.change,
        entry.life
      ]);
    });
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LOG_HEADER.length).setValues(rows);
  }
}

// ===== HELPERS =====

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function ensureHeader(sheet, header) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
  }
}

/**
 * ContentService com JSON + status simulado no corpo (Apps Script não permite
 * setar status HTTP customizado em Web Apps simples; o front-end deve checar `ok`).
 */
function jsonResponse(obj, statusCode) {
  const payload = Object.assign({}, obj, statusCode ? { statusCode } : {});
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Serializa uma aba inteira (cabeçalho incluso) como CSV, RFC 4180. */
function csvResponse(sheet) {
  const rows = sheet.getDataRange().getValues();
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  return ContentService
    .createTextOutput(csv)
    .setMimeType(ContentService.MimeType.CSV);
}

function csvEscape(value) {
  if (value instanceof Date) value = value.toISOString();
  const str = String(value === null || value === undefined ? '' : value);
  return /[",\r\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}
