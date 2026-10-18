const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

let browser;
const root = path.resolve(__dirname, '..');
const appUrl = pathToFileURL(path.join(root, 'ST-ExampleBuilder-1.0.html')).href;
before(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
});
after(async () => { await browser?.close(); });

async function open(t, options = {}) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No uncaught browser errors'));
  await page.goto(appUrl);
  return page;
}

async function enter(page, text) {
  await page.locator('.editor').first().click();
  await page.keyboard.insertText(text);
}

async function importText(page, text) {
  await page.locator('#openImport').click();
  await page.locator('#importText').fill(text);
  await page.locator('#importMode').selectOption('replace');
}

test('saving, undo, redo, text exports and leave protection follow project content', async t => {
  const page = await open(t);
  assert.equal(await page.evaluate(() => hasUnsavedChanges()), false);
  await enter(page, 'Hello 👋');
  assert.match(await page.locator('#saveState').textContent(), /Unsaved changes/);
  assert.equal(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }), true);
  const textDownload = page.waitForEvent('download');
  await page.locator('#downloadText').click();
  await textDownload;
  assert.equal(await page.evaluate(() => hasUnsavedChanges()), true);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#saveProject').click();
  const download = await downloadEvent;
  const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  assert.equal(saved.version, '1.0');
  assert.equal(saved.blocks[1].text, 'Hello 👋');
  assert.match(await page.locator('#saveState').textContent(), /Project downloaded/);
  assert.equal(await page.evaluate(() => hasUnsavedChanges()), false);
  await page.locator('.editor').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' again');
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(() => hasUnsavedChanges()), false);
  await page.locator('#redo').click();
  assert.equal(await page.evaluate(() => hasUnsavedChanges()), true);
  assert.equal(await page.evaluate(() => {
    savedSnapshot = projectSnapshot();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }), false);
});

test('multiline editing, emoji and highlighted paste preserve literal text and caret', async t => {
  const page = await open(t);
  await enter(page, '*waves* "Hi 👋"');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Second line');
  assert.equal(await page.locator('.editor').textContent(), '*waves* "Hi 👋"\nSecond line');
  await page.evaluate(() => {
    const editor = document.querySelector('.editor');
    editor.focus();
    restoreSelection(editor, { anchor: 1, focus: 6 });
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '<img src=x onerror=alert(1)>\r\n😀');
    clipboardData.setData('text/html', '<b>UNSAFE</b>');
    editor.querySelector('.narration').dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, clipboardData
    }));
  });
  const expected = '*<img src=x onerror=alert(1)>\n😀* "Hi 👋"\nSecond line';
  assert.equal(await page.locator('.editor').textContent(), expected);
  assert.equal(await page.locator('.editor img, .editor b').count(), 0);
  assert.equal(await page.evaluate(() => selectionOffsets(document.querySelector('.editor')).focus),
    1 + '<img src=x onerror=alert(1)>\n😀'.length);
});

test('composition keeps its DOM and Enter keys until completion', async t => {
  const page = await open(t);
  const result = await page.evaluate(async () => {
    const editor = document.querySelector('.editor');
    editor.focus();
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const node = document.createTextNode('日本語');
    editor.replaceChildren(node);
    restoreSelection(editor, { anchor: 3, focus: 3 });
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true });
    editor.dispatchEvent(enter);
    const untouched = editor.firstChild === node && !enter.defaultPrevented;
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await Promise.resolve();
    return { untouched, text: blocks[1].text, count: blocks.length };
  });
  assert.deepEqual(result, { untouched: true, text: '日本語', count: 2 });
});

test('JSONL import selects dialogue and discards metadata', async t => {
  const page = await open(t);
  const raw = [
    { user_name: 'Private name', chat_metadata: { secret: 'metadata' } },
    { is_user: false, is_system: true, mes: 'System secret' },
    { is_user: true, mes: 'Keep this user message', name: 'Private name' },
    { is_user: false, mes: 'Skip this reply' },
    { is_user: false, mes: 'Keep this reply', send_date: 'Private date' }
  ].map(value => JSON.stringify(value)).join('\n');
  await importText(page, raw);
  assert.equal(await page.locator('#importMessages input').count(), 3);
  await page.locator('#selectNoMessages').click();
  await page.locator('#doImport').click();
  assert.match(await page.locator('#error').textContent(), /at least one/);
  await page.locator('#importMessages input').nth(0).check();
  await page.locator('#importMessages input').nth(2).check();
  await page.locator('#doImport').click();
  assert.equal(await page.locator('.editor').count(), 2);
  const output = await page.evaluate(() => JSON.stringify(blocks));
  assert.match(output, /Keep this reply/);
  assert.doesNotMatch(output, /Private|secret|Skip this reply/);
});

test('invalid imports select their line and beta projects remain compatible', async t => {
  const page = await open(t);
  await importText(page, '<START>\nWrong speaker: text');
  await page.locator('#doImport').click();
  assert.match(await page.locator('#error').textContent(), /Line 2.*\{\{user\}\}/);
  assert.equal(await page.locator('#importText').evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd)), 'Wrong speaker: text');
  await page.locator('#importText').fill(JSON.stringify({ app: 'ST Example Builder', version: '1.0-beta', blocks: [
    { type: 'start', label: 'Old project' }, { type: 'char', text: 'Compatible' }
  ] }));
  await page.locator('#doImport').click();
  assert.equal(await page.locator('.editor').textContent(), 'Compatible');
  assert.match(await page.locator('#saveState').textContent(), /Unsaved changes/);
});

test('example boundaries require confirmation and cancellation keeps messages intact', async t => {
  const page = await open(t);
  await importText(page, '<START>\n{{user}}: First\n<START>\n{{char}}: Second');
  await page.locator('#doImport').click();
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  const row = page.locator('.card').nth(1);
  await row.locator('summary').click();
  await row.locator('[data-action="down"]').click();
  await page.locator('.start').nth(1).locator('[data-action="remove"]').click();
  assert.equal(dialogs, 2);
  assert.equal(await page.locator('.start').count(), 2);
  assert.equal(await page.locator('.editor').first().textContent(), 'First');
});

test('privacy: no network, persistent drafts or executable imported markup', async t => {
  const page = await open(t);
  const requests = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.evaluate(() => localStorage.setItem('st-example-builder-beta-1', '{"private":"old draft"}'));
  await page.reload();
  assert.equal(await page.evaluate(() => localStorage.getItem('st-example-builder-beta-1')), null);
  await enter(page, '<script>alert("private")</script>');
  await page.reload();
  assert.equal(await page.locator('.editor').textContent(), '');
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
  assert.equal(await page.evaluate(async () => {
    try { await fetch('https://example.com/'); return false; } catch { return true; }
  }), true);
  assert.deepEqual(requests, []);
});

test('Pages entry point, mobile layout and current preview', async t => {
  const page = await open(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.waitForURL(appUrl);
  assert.equal(await page.title(), 'ST-ExampleBuilder 1.0');
  await enter(page, 'Mobile message 😀');
  await page.keyboard.press('Control+Enter');
  assert.equal(await page.locator('.editor').count(), 2);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.UPDATE_PREVIEW === '1') {
    await page.setViewportSize({ width: 1100, height: 1000 });
    await page.evaluate(() => {
      blocks = [makeBlock('start'), makeBlock('user', 'Hello! What are we exploring today?'),
        makeBlock('char', '*She opens a well-worn map.* "There is a trail beyond the old bridge."')];
      blocks[0].label = 'A new adventure';
      render();
      savedSnapshot = projectSnapshot();
      hasDownloadedProject = true;
      markUnsaved();
    });
    await page.screenshot({ path: path.join(root, 'docs', 'preview-1.0.png'), fullPage: true });
  }
});
