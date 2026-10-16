/**
 * Partner onboarding backend for onboarding.html.
 *
 * Receives the form as a JSON body (sent as text/plain to avoid a CORS preflight),
 * stores the SVG logos in a per-submission Drive folder, appends a row to the
 * responses sheet and emails a summary to the team.
 *
 * Logos: the partner sends at least one SVG. With only one, it is used for both
 * the app icon and the login screen; with both, the one without text ("symbol")
 * becomes the icon and the one with text ("full") goes on the login screen.
 *
 * Script Properties (Project Settings → Script Properties):
 *   FOLDER_ID     Drive folder that receives one subfolder per submission (required)
 *   SHEET_ID      Spreadsheet that stores the responses (required)
 *   NOTIFY_EMAIL  Who gets the notification email (default: contact@monamienet.org)
 */

const TIMEZONE = 'America/Sao_Paulo';
const NAME_MAX = 22; // 30-char store title limit minus "MonAmie "
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const HEX_RE = /^#[0-9A-F]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_SUBMISSIONS_PER_HOUR = 30;
const SHEET_HEADER = [
  'Data', 'E-mail', 'Nome do app', 'Nome alternativo', 'Identificador sugerido',
  'Cor primária', 'Cor secundária', 'Pasta', 'Logo sem texto', 'Logo com texto',
  'Arquivo do ícone', 'Arquivo da tela de login',
];

function doGet() {
  return json_({ ok: true, service: 'monamie-onboarding' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Honeypot filled: answer like a success so bots learn nothing.
    if (body.website) return json_({ ok: true });

    enforceRateLimit_();
    const data = validate_(body);
    const result = save_(data);
    notify_(data, result);
    return json_({ ok: true });
  } catch (err) {
    const message = err && err.userMessage ? err.userMessage : 'Erro interno. Tente novamente em instantes.';
    if (!(err && err.userMessage)) console.error(err);
    return json_({ ok: false, error: message });
  }
}

/* ---------- Validation ---------- */

function validate_(b) {
  const email = String(b.email || '').trim();
  if (!EMAIL_RE.test(email)) fail_('E-mail inválido.');

  const appName = cleanName_(b.appName, 'Nome desejado');
  const altName = cleanName_(b.altName, 'Nome alternativo');
  if (appName.toLowerCase() === altName.toLowerCase()) fail_('O nome alternativo precisa ser diferente do nome desejado.');

  const primary = String(b.primary || '').trim().toUpperCase();
  const secondary = String(b.secondary || '').trim().toUpperCase();
  if (!HEX_RE.test(primary)) fail_('Cor primária inválida.');
  if (!HEX_RE.test(secondary)) fail_('Cor secundária inválida.');

  if (b.rights !== true) fail_('É preciso confirmar a declaração de direitos.');

  const symbol = b.symbol ? decodeSvg_(b.symbol, 'Logo sem texto') : null;
  const full = b.full ? decodeSvg_(b.full, 'Logo com texto') : null;
  if (!symbol && !full) fail_('Envie ao menos um dos dois logos em SVG.');

  return { email, appName, altName, primary, secondary, symbol, full };
}

function cleanName_(value, label) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) fail_(label + ': campo obrigatório.');
  if (name.length > NAME_MAX) fail_(label + ': use no máximo ' + NAME_MAX + ' caracteres.');
  if (/^mon\s*amie\b/i.test(name)) fail_(label + ': não inclua “MonAmie”.');
  return name;
}

function decodeSvg_(f, label) {
  if (!f.data) fail_(label + ': arquivo vazio.');
  if (f.type !== 'image/svg+xml') fail_(label + ': envie um arquivo SVG.');
  // Cheap size check before decoding: base64 inflates by 4/3.
  if (f.data.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 4) fail_(label + ': o arquivo passa de 5 MB.');
  let bytes;
  try {
    bytes = Utilities.base64Decode(f.data);
  } catch (err) {
    fail_(label + ': não foi possível ler o arquivo.');
  }
  if (bytes.length > MAX_FILE_BYTES) fail_(label + ': o arquivo passa de 5 MB.');
  if (!/<svg[\s>]/i.test(Utilities.newBlob(bytes).getDataAsString())) fail_(label + ': o SVG não é válido.');
  return { bytes: bytes, name: String(f.name || '') };
}

/** Suggested instance slug, as used in org.monamienet.<slug> and monamienet-<slug>. */
function slug_(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* ---------- Persistence ---------- */

function save_(d) {
  const props = PropertiesService.getScriptProperties();
  const root = DriveApp.getFolderById(requiredProp_(props, 'FOLDER_ID'));
  const now = new Date();
  const stamp = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HHmm');

  const folder = root.createFolder(stamp + ' – MonAmie ' + d.appName);
  const saveSvg = (f, name) => (f ? folder.createFile(Utilities.newBlob(f.bytes, 'image/svg+xml', name)) : null);
  const symbolFile = saveSvg(d.symbol, 'logo-sem-texto.svg');
  const fullFile = saveSvg(d.full, 'logo-com-texto.svg');
  const iconFile = symbolFile || fullFile;
  const loginFile = fullFile || symbolFile;
  const url = (f) => (f ? f.getUrl() : '');

  const slug = slug_(d.appName);
  const row = [
    Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
    d.email,
    'MonAmie ' + d.appName,
    'MonAmie ' + d.altName,
    'org.monamienet.' + slug,
    d.primary,
    d.secondary,
    folder.getUrl(),
    url(symbolFile),
    url(fullFile),
    iconFile.getName(),
    loginFile.getName(),
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = SpreadsheetApp.openById(requiredProp_(props, 'SHEET_ID')).getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(SHEET_HEADER);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }

  return {
    folderUrl: folder.getUrl(),
    slug: slug,
    files: [symbolFile, fullFile].filter(Boolean),
    iconName: iconFile.getName(),
    loginName: loginFile.getName(),
  };
}

function notify_(d, r) {
  const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || 'contact@monamienet.org';
  const body = [
    'Novo onboarding de parceiro recebido.',
    '',
    'E-mail: ' + d.email,
    'Nome do app: MonAmie ' + d.appName,
    'Nome alternativo: MonAmie ' + d.altName,
    'Identificador sugerido: org.monamienet.' + r.slug + ' (projeto Firebase monamienet-' + r.slug + ')',
    'Cor primária: ' + d.primary,
    'Cor secundária: ' + d.secondary,
    '',
    'Ícone: ' + r.iconName,
    'Tela de login: ' + r.loginName,
    'Arquivos: ' + r.folderUrl,
  ].join('\n');

  MailApp.sendEmail({
    to: to,
    replyTo: d.email,
    subject: 'Onboarding – MonAmie ' + d.appName,
    body: body,
    attachments: r.files.map((f) => f.getBlob()),
  });
}

/* ---------- Helpers ---------- */

function enforceRateLimit_() {
  const cache = CacheService.getScriptCache();
  const key = 'submissions-' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMddHH');
  const count = Number(cache.get(key) || 0);
  if (count >= MAX_SUBMISSIONS_PER_HOUR) fail_('Muitos envios no momento. Tente novamente mais tarde.');
  cache.put(key, String(count + 1), 3600);
}

function requiredProp_(props, name) {
  const value = props.getProperty(name);
  if (!value) throw new Error('Missing script property ' + name);
  return value;
}

/** Throws an error whose message is safe to show to the user. */
function fail_(message) {
  const err = new Error(message);
  err.userMessage = message;
  throw err;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to grant permissions and check the configuration. */
function checkSetup() {
  const props = PropertiesService.getScriptProperties();
  const folder = DriveApp.getFolderById(requiredProp_(props, 'FOLDER_ID'));
  const sheet = SpreadsheetApp.openById(requiredProp_(props, 'SHEET_ID'));
  console.log('Pasta: ' + folder.getName() + ' | Planilha: ' + sheet.getName() + ' | Aviso para: ' + (props.getProperty('NOTIFY_EMAIL') || 'contact@monamienet.org'));
  MailApp.getRemainingDailyQuota();
}
