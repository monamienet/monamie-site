// Browser test for onboarding.html. Injected into a copy of the page by tests/run.sh,
// it drives the real form and POSTs one PASS/FAIL line per check to /result-<variant>.
// Variant "unconfigured" keeps the placeholder APPS_SCRIPT_URL; variant "configured"
// swaps in a fake URL and stubs fetch() to capture the payload.
(async () => {
  const realFetch = window.fetch.bind(window);
  const variant = new URLSearchParams(location.search).get('variant');
  const out = [];
  const log = (name, ok, extra = '') => out.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : ''));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const field = (n) => form.querySelector(`.field[data-field="${n}"]`);
  const err = (n) => field(n).querySelector(':scope > .field-error').textContent;
  const warn = (n) => (field(n).querySelector(':scope > .field-warning') || {}).textContent || '';
  const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event('input')); };
  const focus = (id) => $(id).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  const shown = () => [...document.querySelectorAll('[data-preview-screen]')].find((s) => !s.hidden).dataset.previewScreen;
  const svg = (body, name = 'logo.svg', attrs = 'viewBox="0 0 10 10"') =>
    new File([`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`], name, { type: 'image/svg+xml' });
  const submit = async () => { form.requestSubmit(); await sleep(300); while (sending) await sleep(50); };

  async function setFile(key, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = $(key + 'Input');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(20);
    while (files[key] && files[key].pending) await sleep(20);
  }

  function fillTextFields() {
    type('email', 'cliente@empresa.com.br');
    type('appName', 'Aquarius Tur');
    type('altName', 'AquariusTur Viagens');
    type('primaryHex', '#0ABAB5');
    type('secondaryHex', '#088F8B');
    $('rights').checked = true;
    $('rights').dispatchEvent(new Event('change'));
  }

  try {
    // Empty submit
    await submit();
    const flagged = [...form.querySelectorAll('.field.has-error')].map((f) => f.dataset.field).join(',');
    log('empty submit flags required fields', flagged === 'email,appName,altName,primary,secondary,logos,rights', flagged);

    // Names
    type('appName', 'MonAmie Teste'); log('rejects MonAmie prefix', /MonAmie/.test(err('appName')), err('appName'));
    type('appName', 'A'.repeat(23)); validate('appName'); log('rejects 23 chars', /22/.test(err('appName')), err('appName'));
    type('appName', 'Aquarius Tur'); validate('appName'); log('accepts valid name', err('appName') === '');
    log('counter shows 20/30', form.querySelector('[data-counter-for="appName"]').textContent === '20/30');
    type('altName', 'aquarius  tur'); validate('altName'); log('alt equal to name rejected', /diferente/.test(err('altName')), err('altName'));

    // Email and colors
    type('email', 'foo@bar'); validate('email'); log('bad email rejected', err('email') !== '');
    type('primaryHex', '0abab5'); log('hex normalized and synced', $('primaryHex').value === '#0ABAB5' && $('primaryPicker').value === '#0abab5');
    type('secondaryHex', '#0ABAB6'); log('close colors warn', !$('colorWarning').classList.contains('hidden'));
    type('secondaryHex', '#zzzzzz'); validate('secondary'); log('bad hex rejected', err('secondary') !== '');
    $('secondaryPicker').value = '#088f8b'; $('secondaryPicker').dispatchEvent(new Event('input'));
    log('picker fills text', $('secondaryHex').value === '#088F8B' && err('secondary') === '');

    // SVG checks
    await setFile('symbol', new File(['x'], 'icon.png', { type: 'image/png' }));
    log('non-svg rejected', /SVG/.test(err('symbol')), err('symbol'));
    await setFile('symbol', new File(['<svg><g></svg>'], 'b.svg', { type: 'image/svg+xml' }));
    log('broken svg rejected', /não é válido/.test(err('symbol')), err('symbol'));
    await setFile('symbol', new File(['<html/>'], 'h.svg', { type: 'image/svg+xml' }));
    log('non-svg root rejected', err('symbol') !== '');
    await setFile('symbol', svg('<rect width="10" height="10"/>', 's.svg', 'width="10" height="10"'));
    log('svg without viewBox warns', err('symbol') === '' && /viewBox/.test(warn('symbol')), warn('symbol'));
    clearDrop('symbol');

    // Preview switching
    focus('primaryHex'); log('colors -> login', shown() === 'login');
    focus('email'); log('email keeps login', shown() === 'login');
    focus('appName'); log('name keeps login', shown() === 'login');
    await setFile('symbol', svg('<circle cx="5" cy="5" r="5"/>', 'symbol.svg')); log('symbol logo -> home', shown() === 'home');
    focus('email'); log('email keeps home', shown() === 'home');
    focus('altName'); log('name keeps home', shown() === 'home');
    $('fullInput').closest('.field').dispatchEvent(new Event('pointerdown', { bubbles: true })); log('full logo -> login', shown() === 'login');
    focus('secondaryHex'); log('colors stay login', shown() === 'login');
    $('symbolInput').closest('.field').dispatchEvent(new Event('pointerdown', { bubbles: true })); log('symbol click -> home', shown() === 'home');

    // Which SVG goes where
    log('only symbol: icon and login use it', $('pvIcon').src === files.symbol.url && $('pvLogo').src === files.symbol.url);
    await setFile('full', svg('<rect width="10" height="5"/>', 'full.svg'));
    log('both: symbol is icon, full is login', $('pvIcon').src === files.symbol.url && $('pvLogo').src === files.full.url);
    clearDrop('symbol'); updatePreview();
    log('only full: icon and login use it', $('pvIcon').src === files.full.url && $('pvLogo').src === files.full.url);
    log('one SVG satisfies the group', validate('logos'));
    clearDrop('full'); log('no SVG fails the group', !validate('logos') && /ao menos um/.test(err('logos')), err('logos'));

    // Launcher label and login title
    type('appName', 'AquariusTur');
    log('launcher label two lines', $('pvIconLabel').textContent === 'AquariusTur' && $('pvIconLabel').previousElementSibling.textContent === 'MonAmie');
    log('login title', $('pvLoginTitle').textContent === 'MonAmie AquariusTur');

    // Submit
    fillTextFields();
    await setFile('symbol', svg('<circle cx="5" cy="5" r="5"/>', 'symbol.svg'));
    await setFile('full', svg('<rect width="10" height="5"/>', 'full.svg'));
    let captured = null;
    window.fetch = async (url, opts) => { captured = { url, opts }; return new Response(JSON.stringify({ ok: true }), { status: 200 }); };
    await submit();
    const flagged2 = [...form.querySelectorAll('.field.has-error')].map((f) => f.dataset.field);
    log('valid form has no errors', flagged2.length === 0, flagged2.join(','));

    if (variant === 'configured') {
      const p = captured && JSON.parse(captured.opts.body);
      log('fetch without content-type', !!captured && !captured.opts.headers);
      log('payload has both SVGs', p && p.symbol.type === 'image/svg+xml' && /circle/.test(atob(p.symbol.data)) && /rect/.test(atob(p.full.data)));
      log('payload fields', p && p.appName === 'Aquarius Tur' && p.primary === '#0ABAB5' && p.secondary === '#088F8B' && p.rights === true);
      log('success card shown', !$('successCard').classList.contains('hidden') && form.classList.contains('hidden'));

      $('btnAnother').click();
      await sleep(50);
      log('reset clears form', $('appName').value === '' && files.symbol === null && files.full === null && !form.classList.contains('hidden'));

      fillTextFields();
      await setFile('full', svg('<rect width="10" height="5"/>', 'full.svg'));
      captured = null;
      await submit();
      const p2 = captured && JSON.parse(captured.opts.body);
      log('single SVG submit sends symbol=null', p2 && p2.symbol === null && p2.full && p2.full.type === 'image/svg+xml');
    } else {
      log('unconfigured URL -> toast, no fetch', captured === null && /configurado/.test($('toastMsg').textContent), $('toastMsg').textContent);
    }
  } catch (e) {
    out.push('FAIL exception :: ' + e.stack);
  }
  await realFetch('/result-' + variant, { method: 'POST', body: out.join('\n') });
})();
