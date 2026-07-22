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
 * Planilha esperada (duas abas):
 *   "Decks"      | colunas: Nome | Formato | Emoji (opcional)
 *   "Resultados" | criada/gerenciada automaticamente por este script
 */

// ===== CONFIGURAÇÃO =====
const SHEET_DECKS = 'Decks';
const SHEET_RESULTS = 'Resultados';
const RESULTS_HEADER = ['Timestamp', 'Formato', 'Jogadores', 'Vencedor', 'ViradasDeVida', 'DuracaoSeg'];

/**
 * GET /exec?action=decks
 * Retorna a lista de decks cadastrados na planilha.
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

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action }, 400);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}

/**
 * POST /exec  (body: text/plain contendo JSON — evita preflight CORS)
 * Salva o resultado de uma partida na aba "Resultados".
 * Body esperado:
 * {
 *   "action": "saveResult",
 *   "format": "commander",
 *   "players": [{ "name": "...", "deck": "...", "finalLife": 12 }, ...],
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
  if (!Array.isArray(body.players) || body.players.length < 2 || body.players.length > 5) {
    throw new Error('players deve ter entre 2 e 5 jogadores');
  }
  body.players.forEach((p, i) => {
    if (typeof p.finalLife !== 'number') {
      throw new Error('players[' + i + '].finalLife deve ser numérico');
    }
  });
}

function saveResult(body) {
  const sheet = getSheet(SHEET_RESULTS);
  ensureHeader(sheet, RESULTS_HEADER);

  const winner = body.players.find(p => p.id === body.winnerId);
  const playersSummary = body.players
    .map(p => `${p.name || 'P' + p.id} (${p.deck || '—'}): ${p.finalLife}`)
    .join(' | ');

  sheet.appendRow([
    new Date(),
    body.format || 'custom',
    playersSummary,
    winner ? (winner.name || 'P' + winner.id) : 'N/A',
    body.lifeChanges || 0,
    body.durationSeconds || 0
  ]);
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
