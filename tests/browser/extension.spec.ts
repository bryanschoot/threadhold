import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { collapsedGeneralScript, nativeTableScript, realMonacoScript } from './native-host.fixture';

// Synthetic native host fixture: proves the installed extension, not ADO DOM compatibility.
const url = 'https://dev.azure.com/fixture/project/_git/repository/pullrequest/42';
const fixture = `<!doctype html><html><head><meta charset="utf-8"></head><body><main class="repos-pr-details-page"><button class="repos-pr-header-vote-button">Approve</button><nav><div role="tablist"><a role="tab" href="?">Overview</a></div></nav><div class="page-content"><div class="activity-feed-list"><div class="repos-discussion-thread" data-existing-thread><div class="repos-comment-viewer" id="1700000000">Original remote comment</div><div class="repos-discussion-thread-reply"><div class="repos-comment-editor-max-width"><input class="threadId-86671" aria-label="Reply to original comment"></div></div></div><div class="repos-discussion-thread"><div class="repos-discussion-thread-reply"><div class="repos-comment-editor-fit repos-comment-editor-max-width"><textarea class="threadId--1" aria-label="Add a comment"></textarea><div><button class="bolt-button" type="button" data-cancel>Cancel</button><button id="__bolt-comment-1" class="bolt-button primary" type="button">Comment</button></div></div></div></div></div></div></main><script>
if(new URLSearchParams(location.search).has('draft-pr'))document.querySelector('.repos-pr-header-vote-button').outerHTML='<div class="bolt-split-button"><button class="bolt-split-button-main bolt-button primary" aria-label="Publish">Publish</button><button class="bolt-button" aria-label="Publish options">▼</button></div>';
const textarea=document.querySelector('textarea');
document.querySelector('[data-cancel]').addEventListener('click',()=>{textarea.value='';});
async function publishGeneral(){await fetch(location.pathname.replace('/_git/repository/pullrequest/42','/_apis/git/repositories/repo-id/pullRequests/42/threads'),{method:'POST',body:JSON.stringify({body:textarea.value})});textarea.value='';}
document.querySelector('#__bolt-comment-1').addEventListener('click',publishGeneral);
textarea.addEventListener('input',()=>{
  const old=document.querySelector('#__bolt-comment-1'),fresh=old.cloneNode(true);
  fresh.className='bolt-button primary';fresh.addEventListener('click',publishGeneral);old.replaceWith(fresh);
});
textarea.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter')document.querySelector('#__bolt-comment-1').click()});
const replyThread=document.querySelector('[data-existing-thread]');
function expandReply(){
  replyThread.querySelector('.repos-discussion-thread-reply').innerHTML='<div class="repos-comment-editor-fit repos-comment-editor-max-width"><textarea aria-label="Reply to original comment"></textarea><div><button class="bolt-button">Cancel</button><button class="bolt-button primary">Reply</button><button class="bolt-button">Reply &amp; resolve</button></div></div>';
  const editor=replyThread.querySelector('textarea');
  replyThread.querySelector('button').addEventListener('click',()=>{editor.value='';});
  for(const button of replyThread.querySelectorAll('button')) if(button.textContent.startsWith('Reply')) button.addEventListener('click',async()=>{await fetch(location.pathname.replace('/_git/repository/pullrequest/42','/_apis/git/repositories/repo-id/pullRequests/42/threads/86671/comments'),{method:'POST',body:JSON.stringify({body:editor.value})});editor.value='';});
  editor.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter')replyThread.querySelector('.primary').click()});
  editor.focus();
}
replyThread.querySelector('input').addEventListener('click',expandReply);
if(sessionStorage.getItem('expandedReply'))expandReply();
if(new URLSearchParams(location.search).has('monaco')){
  const split=new URLSearchParams(location.search).has('split');
  const host=document.createElement('div');host.className='monaco-diff-editor';
  document.querySelector('main').append(host);
  const models=[],created=[];
  window.monaco={editor:{getModels:()=>models,onDidCreateEditor:callback=>{created.push(callback);return{dispose(){}}}}};
  for(const side of split?['Original','Modified']:['Modified']){
    const root=document.createElement('div');root.className='monaco-editor '+side.toLowerCase()+'-in-monaco-diff-editor';
    const uri=side==='Original'?'inmemory://model/3':'inmemory://model/git/repo-id/GC'+'a'.repeat(40)+'/src/example.ts';
    root.dataset.uri=uri;
    root.innerHTML='<button data-select-single>Select line 20</button><button data-select-range>Select lines 35–38</button><div widgetid="fixture:'+side+':AddCommentGutterWidget"><button class="repos-add-comment-button">Add inline comment</button></div><div widgetid="fixture:'+side+':AddCommentWidget"><button class="repos-add-comment-button">Comment on selection</button></div>';
    host.append(root);
    let selection={startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1};
    const selected={startLineNumber:35,startColumn:5,endLineNumber:38,endColumn:58};
    const model={uri:{toString:()=>uri},getLineCount:()=>100,getLineMaxColumn:()=>120,getAllDecorations:()=>[
      {range:{startLineNumber:39,startColumn:1,endLineNumber:39,endColumn:62},options:{inlineClassName:'highlight-discussion-range'}}
    ]};
    models.push(model);
    const zones=new Map();
    root.style.cssText='position:relative;min-height:600px;width:100%';
    let editorReady=false;
    const editor={getDomNode:()=>editorReady?root:null,getModel:()=>model,getSelection:()=>selection,setSelection:range=>{selection=range},
      revealRangeInCenter(){},focus(){
        root.querySelector('[widgetid$=":AddCommentGutterWidget"]').hidden=true;
        root.querySelector('[widgetid$=":AddCommentWidget"]').hidden=selection.startLineNumber===selection.endLineNumber&&selection.startColumn===selection.endColumn;
      },onDidDispose:()=>({dispose(){}}),onDidChangeModel:()=>({dispose(){}}),
      getLayoutInfo:()=>({width:root.clientWidth,height:600,contentLeft:0,contentWidth:root.clientWidth,verticalScrollbarWidth:0,horizontalScrollbarHeight:0}),
      getScrollTop:()=>0,onDidLayoutChange:()=>({dispose(){}}),onDidScrollChange:()=>({dispose(){}}),
      addOverlayWidget(widget){root.append(widget.getDomNode())},removeOverlayWidget(widget){widget.getDomNode().remove()},
      changeViewZones(callback){callback({addZone(zone){const id=crypto.randomUUID();root.append(zone.domNode);zones.set(id,zone);zone.onDomNodeTop?.(60);return id},
        removeZone(id){zones.get(id)?.domNode.remove();zones.delete(id)},layoutZone(id){zones.get(id)?.onDomNodeTop?.(60)}})}
    };
    for(const callback of created)callback(editor);
    editorReady=true;
    root.querySelector('[data-select-single]').addEventListener('click',()=>{selection={startLineNumber:20,startColumn:1,endLineNumber:20,endColumn:1}});
    root.querySelector('[data-select-range]').addEventListener('click',()=>{selection={...selected}});
    for(const button of root.querySelectorAll('.repos-add-comment-button')) button.addEventListener('click',()=>{
      if(root.querySelector('textarea:not([aria-hidden="true"])'))return;
      const thread=document.createElement('div');thread.className='repos-discussion-thread';
      thread.innerHTML='<div class="repos-discussion-thread-reply"><div class="repos-comment-editor-fit"><textarea class="threadId--5 bolt-textfield-auto-adjust-hidden" aria-hidden="true" style="position:absolute;visibility:hidden"></textarea><textarea class="threadId--5" aria-label="Inline comment"></textarea><div><button class="bolt-button">Cancel</button><button class="bolt-button primary" id="__bolt-comment-inline">Comment</button></div></div></div>';
      // Native focus changes must not replace the opening selection.
      selection={startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1};
      root.append(thread);thread.querySelector('button').addEventListener('click',()=>thread.remove());
      thread.querySelector('.primary').addEventListener('click',()=>fetch(location.pathname.replace('/_git/repository/pullrequest/42','/_apis/git/repositories/repo-id/pullRequests/42/threads'),{method:'POST',body:JSON.stringify({body:thread.querySelector('textarea:not([aria-hidden="true"])').value})}));
    });
  }
}
${collapsedGeneralScript}
${nativeTableScript}
${realMonacoScript}
</script></body></html>`;
let context: BrowserContext;
let page: Page;
let directory: string;
let writes: number;
let failPublication: boolean;
let published: { id: number; comments: { id: number; content: string; publishedDate: string; author: { id: string; displayName: string } }[] }[];
let originalThreadPresent: boolean;
test.use({ locale: 'nl-NL' });

test.beforeEach(async ({ locale }) => {
  const english = locale === 'en-US';
  directory = await mkdtemp(join(tmpdir(), 'threadhold-browser-'));
  const extensionPath = resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(directory, { channel: 'chromium', headless: true, locale, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  // Grant the optional host through Chromium's own management UI in this disposable profile.
  // Headless Chromium cannot display the human runtime-permission bubble.
  const management = await context.newPage();
  await management.goto('chrome://extensions');
  await management.evaluate(async extensionId => {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    chrome.developerPrivate.addHostPermission(extensionId, 'https://dev.azure.com/*', () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
    await promise;
  }, id);
  await management.close();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole('button', { name: english ? 'Grant access' : 'Toegang geven' }).click();
  await expect(popup.locator('#status')).toContainText(english ? 'Access is active' : 'Toegang actief');
  writes = 0; published = []; failPublication = false;
  originalThreadPresent = true;
  await context.route('https://dev.azure.com/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/__threadhold-monaco/')) {
      const base = resolve('node_modules/monaco-editor/min/vs');
      const file = resolve(base, decodeURIComponent(pathname.slice('/__threadhold-monaco/'.length)));
      if (!file.startsWith(`${base}${process.platform === 'win32' ? '\\' : '/'}`)) { await route.fulfill({ status: 404 }); return; }
      try {
        const contentType = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream';
        await route.fulfill({ contentType, body: await readFile(file) });
      } catch { await route.fulfill({ status: 404 }); }
      return;
    }
    if (pathname === '/avatars/user-id.png') {
      await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=', 'base64') }); return;
    }
    if (request.method() === 'POST') {
      writes++;
      if (failPublication) { await route.fulfill({ status: 503, json: { message: 'Uncertain result' } }); return; }
      const payload = JSON.parse(request.postData()!);
      const body = payload.body ?? payload.content ?? payload.comments?.[0]?.content;
      const reply = pathname.endsWith('/threads/86671/comments');
      published.push({ ...payload, id: reply ? 86671 : writes, comments: [{ id: reply ? writes + 1 : 1, content: body, publishedDate: new Date().toISOString(), author: { id: 'user-id', displayName: 'Reviewer' } }] });
      await route.fulfill({ json: published.at(-1) }); return;
    }
    if (pathname.includes('/_apis/')) {
      const json = pathname.endsWith('connectionData') ? { authenticatedUser: { id: 'user-id', providerDisplayName: 'Reviewer' } }
        : pathname.endsWith('/threads') ? { value: [...(originalThreadPresent ? [{ id: 86671, comments: [{ id: 1, content: 'Original remote comment', publishedDate: '2023-11-14T22:13:20.000Z', author: { id: 'other-user', displayName: 'Original reviewer' } }] }] : []), ...published] }
        : pathname.endsWith('/iterations') ? { value: [{ id: 1 }] }
        : /\/pullRequests\/\d+$/.test(pathname) ? { repository: { id: 'repo-id', project: { id: 'project-id' } }, lastMergeSourceCommit: { commitId: 'a'.repeat(40) }, lastMergeTargetCommit: { commitId: 'b'.repeat(40) } }
        : { id: 'repo-id', project: { id: 'project-id' } };
      await route.fulfill({ json }); return;
    }
    await route.fulfill({ contentType: 'text/html', body: fixture });
  });
  page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole('button', { name: english ? 'Save as draft' : 'Opslaan als draft', exact: true })).toBeVisible();
});
test.afterEach(async () => { await context?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

async function duringDraftWrite(startSave: () => Promise<void>, whilePending: () => Promise<void>) {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async () => {
    const open = indexedDB.open('threadhold');
    const { promise: opened, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    const database = await opened;
    const lock = database.transaction('drafts', 'readwrite');
    const store = lock.objectStore('drafts');
    let released = false;
    // Keep an earlier overlapping transaction active so the real save queues behind it.
    function holdLock() {
      if (!released) store.get('__fixture_lock__').onsuccess = holdLock;
    }
    holdLock();
    lock.oncomplete = () => database.close();

    const transaction = IDBDatabase.prototype.transaction;
    const { promise: queued, resolve: signalQueued } = Promise.withResolvers<void>();
    IDBDatabase.prototype.transaction = function (names, mode, options) {
      const result = transaction.call(this, names, mode, options);
      if (this.name === database.name && mode === 'readwrite' && result.objectStoreNames.contains('requests')) signalQueued();
      return result;
    };
    Reflect.set(globalThis, '__threadholdWriteGate', {
      queued,
      release() {
        IDBDatabase.prototype.transaction = transaction;
        released = true;
      },
    });
  });
  try {
    await startSave();
    await worker.evaluate(() => Reflect.get(globalThis, '__threadholdWriteGate').queued);
    await whilePending();
  } finally {
    await worker.evaluate(() => {
      Reflect.get(globalThis, '__threadholdWriteGate').release();
      Reflect.deleteProperty(globalThis, '__threadholdWriteGate');
    });
  }
}

test('browser-agent CRUD survives reload and never publishes', async () => {
  const text = 'Lokale review: café 🧵\n**Markdown** @<user-id> <img src=x onerror=alert(1)>';
  await page.getByRole('textbox', { name: 'Add a comment', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Opslaan als draft', exact: true }).click();
  const card = page.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body')).toContainText('Lokale review: café 🧵');
  await expect(card.locator('.th-body strong')).toHaveText('Markdown');
  await expect(page.locator('[data-existing-thread] [data-threadhold-card]')).toHaveCount(0);
  const id = await card.getAttribute('data-threadhold-draft-id');
  await page.reload();
  await expect(card.locator('.th-body strong')).toHaveText('Markdown');
  await card.getByRole('button', { name: 'Bewerken', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Add a comment', exact: true })).toHaveValue(text);
  await page.getByRole('textbox', { name: 'Add a comment', exact: true }).fill('Bijgewerkt');
  await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(card.locator('.th-body')).toHaveText('Bijgewerkt');
  await expect(card).toHaveAttribute('data-threadhold-draft-id', id!);
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  await card.getByRole('button', { name: 'Draft verwijderen', exact: true }).click();
  await card.getByRole('button', { name: 'Ja, draft verwijderen', exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(writes).toBe(0);
  await expect(page.locator('.th-index')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Drafts plaatsen', exact: true })).toBeVisible();
});

test('native draft editing saves locally with Ctrl+Enter and cancel keeps the saved revision', async () => {
  const editor = page.getByRole('textbox', { name: 'Add a comment', exact: true });
  await editor.fill('Local original');
  await page.getByRole('button', { name: 'Opslaan als draft', exact: true }).click();
  const card = page.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body')).toHaveText('Local original');
  await card.getByRole('button', { name: 'Bewerken', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(page.getByRole('button', { name: 'Comment', exact: true })).toBeHidden();
  await editor.fill('Local keyboard edit');
  await editor.press('Control+Enter');
  await expect(card.locator('.th-body')).toHaveText('Local keyboard edit');
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  await card.getByRole('button', { name: 'Bewerken', exact: true }).click();
  await editor.fill('Unsaved change');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card.locator('.th-body')).toHaveText('Local keyboard edit');
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  await expect(page.getByRole('button', { name: 'Comment', exact: true })).toBeVisible();
  await page.reload();
  await expect(card.locator('.th-body')).toHaveText('Local keyboard edit');
  expect(writes).toBe(0);
});

test('typing during draft creation preserves newer text and Ctrl+Enter updates the same draft', async () => {
  const thread = page.locator('[data-existing-thread]');
  await thread.getByRole('textbox', { name: 'Reply to original comment' }).click();
  const editor = thread.locator('textarea');
  const create = thread.getByRole('button', { name: 'Opslaan als draft', exact: true });
  await editor.fill('Snapshot voor opslag');
  await duringDraftWrite(() => create.click(), () => editor.fill('Nieuwere replytekst'));

  const card = thread.locator('[data-threadhold-card]');
  const save = thread.getByRole('button', { name: 'Opslaan', exact: true });
  await expect(save).toBeEnabled();
  await expect(editor).toHaveValue('Nieuwere replytekst');
  await expect(page.locator('.page-content > [data-threadhold-status]')).toContainText('De editor bevat nog niet-opgeslagen tekst.');
  await expect(thread.locator('.th-save [data-threadhold-status]')).toHaveText('De editor bevat nog niet-opgeslagen tekst. Sla opnieuw op om die te bewaren.');
  await expect(card.locator('.th-body')).toHaveText('Snapshot voor opslag');
  await expect(card).toHaveAttribute('data-threadhold-revision', '1');
  const id = await card.getAttribute('data-threadhold-draft-id');
  await expect(save).toHaveAttribute('data-threadhold-draft-id', id!);
  await expect(save).toHaveAttribute('data-threadhold-revision', '1');
  await expect(thread.locator('button').filter({ hasText: /^Reply(?: & resolve)?$/ })).toHaveCount(2);
  await expect(thread.locator('button').filter({ hasText: /^Reply$/ })).toBeHidden();
  await expect(thread.locator('button').filter({ hasText: /^Reply & resolve$/ })).toBeHidden();

  await editor.press('Control+Enter');
  await expect(editor).toHaveValue('');
  await expect(card).toBeVisible();
  await expect(card.locator('.th-body')).toHaveText('Nieuwere replytekst');
  await expect(card).toHaveAttribute('data-threadhold-draft-id', id!);
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  await expect(page.locator('[data-threadhold-card]')).toHaveCount(1);
  expect(writes).toBe(0);
});

for (const replace of [false, true]) {
test(`draft completion cannot close a ${replace ? 'replacement' : 'cancelled and reopened'} editor`, async () => {
  if (replace) {
    await page.goto(`${url}?collapsed-general=1`);
    await page.getByRole('textbox', { name: 'Add a comment...', exact: true }).click();
  }
  const editor = page.getByRole('textbox', { name: 'Add a comment', exact: true });
  const create = page.getByRole('button', { name: 'Opslaan als draft', exact: true });
  const inlineStatus = page.locator('.repos-comment-editor-fit .th-save [data-threadhold-status]');
  const pageStatus = page.locator('.page-content > [data-threadhold-status]');
  const text = 'Same text in a different editor session';
  await editor.fill(text);
  await duringDraftWrite(() => create.click(), async () => {
    if (replace) {
      await editor.evaluate(node => node.replaceWith(node.cloneNode(true)));
    } else {
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await editor.fill(text);
    await expect(create).toBeEnabled();
  });

  const card = page.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body')).toHaveText(text);
  await expect(card).toBeVisible();
  await expect(editor).toHaveValue(text);
  await expect(create).toBeEnabled();
  await expect(create).not.toHaveAttribute('data-threadhold-draft-id', /.+/);
  await expect(inlineStatus).toBeEmpty();
  await expect(pageStatus).toHaveCount(0);
  expect(writes).toBe(0);
});
}

for (const trigger of ['Comment', 'Ctrl+Enter', 'Reply & resolve'] as const) {
test(`native submission with ${trigger} ends the pending local save session`, async () => {
  const reply = trigger === 'Reply & resolve';
  const scope = reply ? page.locator('[data-existing-thread]') : page.locator('.page-content');
  if (reply) await scope.getByRole('textbox', { name: 'Reply to original comment' }).click();
  const editor = scope.getByRole('textbox', { name: reply ? 'Reply to original comment' : 'Add a comment', exact: true });
  const create = scope.getByRole('button', { name: 'Opslaan als draft', exact: true });
  const inlineStatus = scope.locator('.repos-comment-editor-fit .th-save [data-threadhold-status]');
  const text = 'Same text in a new native session';
  await editor.fill(text);
  await duringDraftWrite(() => create.click(), async () => {
    if (trigger === 'Ctrl+Enter') await editor.press('Control+Enter');
    else await scope.getByRole('button', { name: trigger, exact: true }).click();
    await expect(editor).toHaveValue('');
    await expect(create).toBeEnabled();
    await expect(inlineStatus).toBeEmpty();
    await editor.fill(text);
  });

  expect(published.map(thread => thread.comments[0]?.content)).toEqual([text]);
  const card = page.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body')).toHaveText(text);
  await expect(card).toBeVisible();
  await expect(editor).toHaveValue(text);
  await expect(create).toBeEnabled();
  await expect(create).not.toHaveAttribute('data-threadhold-draft-id', /.+/);
  await expect(inlineStatus).toBeEmpty();
  await expect(page.locator('.page-content > [data-threadhold-status]')).toHaveCount(0);
});
}

test('PR switch clears pending reattach instead of carrying it back to the original PR', async () => {
  const thread = page.locator('[data-existing-thread]');
  await thread.getByRole('textbox', { name: 'Reply to original comment' }).click();
  await thread.locator('textarea').fill('Original PR reply draft');
  await thread.getByRole('button', { name: 'Opslaan als draft', exact: true }).click();
  const card = page.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body')).toHaveText('Original PR reply draft');
  originalThreadPresent = false;
  await page.reload();
  await card.getByRole('button', { name: 'Opnieuw koppelen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Draft hier koppelen', exact: true })).toBeVisible();

  const nextPr = url.replace(/42$/, '43');
  await page.evaluate(next => history.pushState(null, '', next), nextPr);
  await expect(card).toHaveCount(0);
  const create = page.getByRole('button', { name: 'Opslaan als draft', exact: true });
  await expect(create).toBeVisible();
  // The same-document IPC scope fix for writing from PR 43 is covered by PR #5.
  // Return without a reload to verify the pending selection itself was discarded.
  await page.evaluate(previous => history.pushState(null, '', previous), url);
  const original = card.filter({ hasText: 'Original PR reply draft' });
  await expect(original.getByRole('button', { name: 'Opnieuw koppelen', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Add a comment', exact: true }).fill('Independent general draft');
  await create.click();
  await expect(card.filter({ hasText: 'Independent general draft' }).locator('.th-body')).toHaveText('Independent general draft');
  await expect(original.locator('.th-body')).toHaveText('Original PR reply draft');
  expect(writes).toBe(0);
});

test('reply draft follows the native thread after expansion and reload without DOM thread IDs', async () => {
  const thread = page.locator('[data-existing-thread]');
  await thread.getByRole('textbox', { name: 'Reply to original comment' }).click();
  const reply = thread.locator('textarea');
  await expect(reply).not.toHaveAttribute('class', /threadId/);
  await expect(thread.getByRole('button', { name: 'Reply', exact: true })).not.toHaveAttribute('id');
  await reply.fill('Local reply');
  await thread.getByRole('button', { name: 'Opslaan als draft', exact: true }).click();
  const card = thread.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body')).toHaveText('Local reply');
  const id = await card.getAttribute('data-threadhold-draft-id');
  await card.getByRole('button', { name: 'Bewerken', exact: true }).click();
  await expect(reply).toHaveValue('Local reply');
  await reply.fill('Updated local reply');
  await thread.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(card.locator('.th-body')).toHaveText('Updated local reply');
  await page.evaluate(() => sessionStorage.setItem('expandedReply', 'true'));
  await page.reload();
  await expect(thread.locator('input')).toHaveCount(0);
  await expect(card.locator('.th-body')).toHaveText('Updated local reply');
  await expect(card).toHaveAttribute('data-threadhold-draft-id', id!);
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  await card.getByRole('button', { name: 'Bewerken', exact: true }).click();
  await expect(reply).toHaveValue('Updated local reply');
  await expect(thread.getByRole('button', { name: 'Reply & resolve', exact: true })).toBeHidden();
  await thread.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card.locator('.th-body')).toHaveText('Updated local reply');
  expect(writes).toBe(0);
  await card.getByRole('button', { name: 'Draft verwijderen', exact: true }).click();
  await card.getByRole('button', { name: 'Ja, draft verwijderen', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(thread.locator('.repos-comment-viewer')).toHaveText('Original remote comment');
  await expect(page.locator('.th-index')).toHaveCount(0);
  expect(writes).toBe(0);
});

test('header publication requires consent and publishes general plus reply drafts once', async () => {
  await page.getByRole('textbox', { name: 'Add a comment', exact: true }).fill('General batch fixture');
  await page.getByRole('button', { name: 'Opslaan als draft', exact: true }).click();
  const thread = page.locator('[data-existing-thread]');
  await thread.getByRole('textbox', { name: 'Reply to original comment' }).click();
  await thread.locator('textarea').fill('Reply batch fixture');
  await thread.getByRole('button', { name: 'Opslaan als draft', exact: true }).click();
  await expect(page.locator('[data-threadhold-card]')).toHaveCount(2);
  const publish = page.getByRole('button', { name: 'Drafts plaatsen (2)', exact: true });
  await expect(page.locator('.repos-pr-header-vote-button + [data-threadhold-action="publish"]')).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await publish.click();
  await expect(publish).toBeEnabled();
  expect(writes).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  await publish.click();
  await expect(page.locator('[data-threadhold-card]')).toHaveCount(0);
  expect(writes).toBe(2);
  expect(published.map(item => item.comments[0]?.content)).toEqual(expect.arrayContaining(['General batch fixture', 'Reply batch fixture']));
  expect(published.find(item => item.id === 86671)?.comments[0]?.content).toBe('Reply batch fixture');
});

test('an uncertain header publication preserves its draft and cannot silently retry', async () => {
  await page.getByRole('textbox', { name: 'Add a comment', exact: true }).fill('Keep uncertain draft');
  await page.getByRole('button', { name: 'Opslaan als draft', exact: true }).click();
  failPublication = true;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Drafts plaatsen (1)', exact: true }).click();
  await expect(page.locator('[data-threadhold-card] .th-meta')).toContainText('Publicatiestatus onbekend');
  expect(writes).toBe(1);
  await page.getByRole('button', { name: 'Drafts plaatsen (1)', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('onbekende publicatiestatus');
  expect(writes).toBe(1);
});

for (const split of [false, true]) for (const side of split ? ['left', 'right'] as const : ['right'] as const) for (const multiline of [false, true]) {
test(`Monaco ${split ? 'split' : 'inline'} ${side} ${multiline ? 'multiline' : 'single-line'} draft survives native editing and reload`, async () => {
  await page.goto(`${url}?_a=files&path=/src/example.ts&monaco=1${split ? '&split=1' : ''}`);
  const monaco = page.locator(side === 'left' ? '.original-in-monaco-diff-editor' : '.modified-in-monaco-diff-editor');
  await monaco.getByRole('button', { name: multiline ? 'Select lines 35–38' : 'Select line 20', exact: true }).click();
  await monaco.getByRole('button', { name: multiline ? 'Comment on selection' : 'Add inline comment', exact: true }).click();
  const editor = monaco.getByRole('textbox', { name: 'Inline comment', exact: true });
  await editor.fill('Multiline draft');
  await monaco.getByRole('button', { name: 'Opslaan als draft', exact: true }).click();
  const card = monaco.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body')).toHaveText('Multiline draft');
  const id = await card.getAttribute('data-threadhold-draft-id');
  await page.reload();
  await expect(card.locator('.th-body')).toHaveText('Multiline draft');
  await expect(monaco.locator('textarea')).toHaveCount(0);
  await card.getByRole('button', { name: 'Bewerken', exact: true }).click();
  await expect(editor).toHaveValue('Multiline draft');
  await expect(monaco.getByRole('button', { name: 'Comment', exact: true })).toBeHidden();
  await editor.fill('Updated multiline draft');
  await editor.press('Control+Enter');
  await expect(card.locator('.th-body')).toHaveText('Updated multiline draft');
  await expect(card).toHaveAttribute('data-threadhold-draft-id', id!);
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  expect(writes).toBe(0);
  const sent = page.waitForRequest(request => request.method() === 'POST');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Drafts plaatsen (1)', exact: true }).click();
  const payload = (await sent).postDataJSON();
  expect(payload.threadContext).toEqual({
    filePath: '/src/example.ts',
    [side === 'left' ? 'leftFileStart' : 'rightFileStart']: multiline ? { line: 35, offset: 5 } : { line: 20, offset: 1 },
    [side === 'left' ? 'leftFileEnd' : 'rightFileEnd']: multiline ? { line: 38, offset: 58 } : { line: 20, offset: 1 },
  });
  await expect(card).toHaveCount(0);
  expect(writes).toBe(1);
});
}

test.describe(() => {
test.use({ locale: 'en-US' });

test('English browser gets English draft actions and native editing', async () => {
  await page.getByRole('textbox', { name: 'Add a comment', exact: true }).fill('English local draft');
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
  const card = page.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body')).toHaveText('English local draft');
  await expect(page.getByRole('button', { name: 'Publish drafts (1)', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Add a comment', exact: true }).fill('English updated draft');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(card.locator('.th-body')).toHaveText('English updated draft');
  await card.getByRole('button', { name: 'Delete draft', exact: true }).click();
  await card.getByRole('button', { name: 'Yes, delete draft', exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(writes).toBe(0);
});

test('typing during a draft update preserves exact text and advances the binding', async () => {
  const editor = page.getByRole('textbox', { name: 'Add a comment', exact: true });
  await editor.fill('Original local draft');
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
  const card = page.locator('[data-threadhold-card]');
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  const id = await card.getAttribute('data-threadhold-draft-id');
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(editor).toHaveValue('Original local draft');
  await expect(save).toBeEnabled();
  const snapshot = 'Updated local draft';
  const newer = `${snapshot} `;
  await editor.fill(snapshot);
  await duringDraftWrite(() => editor.press('Control+Enter'), () => editor.fill(newer));

  await expect(save).toBeEnabled();
  await expect(editor).toHaveValue(newer);
  await expect(page.locator('.page-content > [data-threadhold-status]')).toContainText('The editor still contains unsaved text.');
  await expect(card.locator('.th-body')).toHaveText(snapshot);
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  await expect(save).toHaveAttribute('data-threadhold-draft-id', id!);
  await expect(save).toHaveAttribute('data-threadhold-revision', '2');
  await expect(page.locator('#__bolt-comment-1')).toBeHidden();

  await editor.press('Control+Enter');
  await expect(editor).toHaveValue('');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-threadhold-revision', '3');
  await page.reload();
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('data-threadhold-draft-id', id!);
  await expect(card).toHaveAttribute('data-threadhold-revision', '3');
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor).toHaveValue(newer);
  expect(writes).toBe(0);
});
});

for (const en of [true, false]) test.describe(() => {
test.use({ locale: en ? 'en-US' : 'nl-NL' });

test(`${en ? 'English' : 'Dutch'} draft help is discoverable, keyboard accessible and survives header remount`, async () => {
  const label = en ? 'Draft help' : 'Drafthulp';
  const help = page.getByRole('button', { name: label, exact: true });
  await help.click();
  const dialog = page.getByRole('dialog', { name: label, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(en ? 'only when the user explicitly asks you to publish' : 'alleen wanneer de gebruiker expliciet om publicatie vraagt');
  await expect(dialog).toContainText(en ? 'do not fall back to publishing' : 'val niet terug op publiceren');
  const close = dialog.getByRole('button', { name: en ? 'Close' : 'Sluiten', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(help).toBeFocused();
  // Native SPA navigation can replace the header without changing the PR.
  await page.locator('.repos-pr-header-vote-button').evaluate(button => {
    const replacement = button.cloneNode(true);
    button.parentElement!.querySelectorAll('.th-publish,.th-help-button').forEach(control => control.remove());
    button.replaceWith(replacement);
  });
  await expect(help).toBeVisible();
  await help.click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('.th-help')).toHaveCount(1);
  await dialog.getByText(en ? 'Browser-agent controls' : 'Bediening voor browseragents', { exact: true }).click();
  await expect(dialog.locator('pre')).toBeVisible();
  await close.click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toBe(0);
});
});

test.describe(() => {
test.use({ locale: 'en-US' });

test('English draft PR keeps draft publication and help beside its native Publish action', async () => {
  await page.goto(`${url}?draft-pr=1`);
  await page.getByRole('textbox', { name: 'Add a comment', exact: true }).fill('Private draft on a draft PR');
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
  const card = page.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body')).toHaveText('Private draft on a draft PR');
  await expect(page.locator('.bolt-split-button + [data-threadhold-action="publish"]')).toBeVisible();
  await page.getByRole('button', { name: 'Draft help', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Draft help', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(card.locator('.th-body')).toHaveText('Private draft on a draft PR');
  expect(writes).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Publish drafts (1)', exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(writes).toBe(1);
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
});
});

for (const en of [true, false]) test.describe(() => {
test.use({ locale: en ? 'en-US' : 'nl-NL' });

test(`${en ? 'English' : 'Dutch'} general drafts render safe Markdown and reopen the collapsed native composer`, async () => {
  await page.goto(`${url}?collapsed-general=1`);
  const editLabel = en ? 'Edit' : 'Bewerken';
  const saveLabel = en ? 'Save' : 'Opslaan';
  const markdown = '# Review\n\n**Bold** and _italic_ and `value`\n\n- [ ] Verify\n\n> Quoted\n\n| Name | Value |\n| --- | --- |\n| Item | 42 |\n\n[External](https://example.com/) [Anchor](#section) [Unsafe](javascript:alert(1))\n\n@<11111111-1111-4111-8111-111111111111>\n\n```suggestion\nreplacement\n```\n\n<img src="/avatars/user-id.png" onerror="window.__draftXss=true"><script>window.__draftXss=true</script><svg onload="window.__draftXss=true"></svg><span data-threadhold-card="spoof">Safe text</span>';
  await page.getByRole('textbox', { name: 'Add a comment...', exact: true }).click();
  await page.getByRole('textbox', { name: 'Add a comment', exact: true }).fill(markdown);
  await page.getByRole('button', { name: en ? 'Save as draft' : 'Opslaan als draft', exact: true }).click();
  const card = page.locator('[data-threadhold-card]');
  const body = card.locator('.th-body');
  await expect(body.locator('h1')).toHaveText('Review');
  await expect(body.locator('strong')).toHaveText('Bold');
  await expect(body.locator('em')).toHaveText('italic');
  await expect(body.locator('blockquote')).toContainText('Quoted');
  await expect(body.locator('table')).toContainText('42');
  await expect(body.locator('input[type="checkbox"]')).toBeDisabled();
  await expect(body.locator('pre code')).toContainText('replacement');
  await expect(body).toContainText('@<11111111-1111-4111-8111-111111111111>');
  await expect(body.getByRole('link', { name: 'External', exact: true })).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(body.getByRole('link', { name: 'Anchor', exact: true })).toHaveAttribute('href', '#section');
  await expect(body.locator('a').filter({ hasText: 'Unsafe' })).not.toHaveAttribute('href');
  await expect(body.locator('script,svg,[onerror],[onload],[data-threadhold-card]')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__draftXss'))).toBeUndefined();
  await expect(card.locator('.th-author')).toHaveText('Reviewer - Team');
  await expect(card.locator('.bolt-coin img')).toHaveAttribute('src', `${new URL(url).origin}/avatars/user-id.png`);
  await expect(card.locator('time')).toHaveText(en ? 'Just now' : 'Zojuist');
  const cardBox = (await card.boundingBox())!;
  const composerBox = (await page.locator('[data-general-composer]').boundingBox())!;
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(composerBox.y + 1);
  expect(await card.evaluate(node => getComputedStyle(node).borderTopStyle)).toBe('solid');
  const id = await card.getAttribute('data-threadhold-draft-id');
  await page.reload();
  await expect(card).toHaveAttribute('data-threadhold-draft-id', id!);
  await card.getByRole('button', { name: editLabel, exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Add a comment', exact: true });
  await expect(editor).toHaveValue(markdown);
  await editor.fill('Locally updated');
  await page.getByRole('button', { name: saveLabel, exact: true }).click();
  await expect(body).toHaveText('Locally updated');
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  await card.getByRole('button', { name: editLabel, exact: true }).click();
  await expect(editor).toHaveValue('Locally updated');
  await editor.fill('Discard this change');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(body).toHaveText('Locally updated');
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  expect(writes).toBe(0);
});
});

async function dragNativeTableSelection(side: 'left' | 'right', endSide: 'left' | 'right' = side): Promise<void> {
  const points = await page.evaluate(selection => {
    function point(line: number, offset: number, which: 'left' | 'right') {
      const cell = document.querySelector(`.repos-summary-header [data-fixture-line="${line}"] .repos-line-content[data-${which === 'left' ? 'o' : 'm'}line] [data-code]`)!;
      const range = document.createRange();
      range.setStart(cell.firstChild!, offset); range.collapse(true);
      const rect = range.getBoundingClientRect();
      return { x: rect.x, y: rect.y + rect.height / 2 };
    }
    return { start: point(35, 4, selection.side), end: point(38, 57, selection.endSide) };
  }, { side, endSide });
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 8 });
  await page.mouse.up();
}

for (const split of [false, true]) for (const side of ['left', 'right'] as const) for (const multiline of [false, true]) {
test(`All Changes ${split ? 'split' : 'inline'} ${side} ${multiline ? 'multiline' : 'single-line'} retains native selection and edits after reload`, async () => {
  await page.goto(`${url}?_a=files&table-diff=1${split ? '&split=1' : ''}`);
  const section = page.locator('.repos-summary-header');
  if (multiline) await dragNativeTableSelection(side);
  await section.getByRole('button', { name: `Add ${side} comment on line ${multiline ? 38 : 35}`, exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Table inline comment', exact: true });
  await editor.fill('Table draft');
  await section.getByRole('button', { name: 'Opslaan als draft', exact: true }).click();
  const card = section.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body')).toHaveText('Table draft');
  const id = await card.getAttribute('data-threadhold-draft-id');
  await page.reload();
  await expect(card).toHaveAttribute('data-threadhold-draft-id', id!);
  await card.getByRole('button', { name: 'Bewerken', exact: true }).click();
  await expect(editor).toHaveValue('Table draft');
  await editor.fill('Edited table draft');
  await editor.press('Control+Enter');
  await expect(card.locator('.th-body')).toHaveText('Edited table draft');
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  expect(writes).toBe(0);
  const sent = page.waitForRequest(request => request.method() === 'POST');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Drafts plaatsen (1)', exact: true }).click();
  const payload = (await sent).postDataJSON();
  expect(payload.threadContext).toEqual({
    filePath: '/src/file-with-hyphens.ts',
    [side === 'left' ? 'leftFileStart' : 'rightFileStart']: { line: 35, offset: multiline ? 5 : 1 },
    [side === 'left' ? 'leftFileEnd' : 'rightFileEnd']: { line: multiline ? 38 : 35, offset: multiline ? 58 : 1 },
  });
  await expect(card).toHaveCount(0);
  expect(writes).toBe(1);
});
}

test.describe(() => {
test.use({ locale: 'en-US' });

for (const split of [false, true]) for (const side of split ? ['left', 'right'] as const : ['right'] as const) for (const multiline of [false, true]) {
test(`English real Monaco ${split ? 'split' : 'inline'} ${side} ${multiline ? 'multiline' : 'single-line'} draft stays bounded and pointer-editable`, async () => {
  await page.setViewportSize({ width: 1000, height: 820 });
  await page.goto(`${url}?_a=files&path=/src/example.ts&real-monaco=1${split ? '&split=1' : ''}`);
  await expect(page.locator('[data-real-diff][data-ready]')).toBeVisible();
  const root = page.locator(side === 'left' ? '.original-in-monaco-diff-editor' : '.modified-in-monaco-diff-editor');
  const code = root.locator('textarea.inputarea');
  await code.focus(); await code.press('Control+Home');
  await code.press('ArrowDown'); await code.press('ArrowDown');
  if (multiline) { await code.press('Shift+ArrowDown'); await code.press('Shift+ArrowDown'); }
  await root.getByRole('button', { name: 'Add inline comment', exact: true }).click();
  const editor = root.getByRole('textbox', { name: 'Inline comment', exact: true });
  await editor.fill('Pointer-editable draft\n\n**Native Markdown**');
  await root.getByRole('button', { name: 'Save as draft', exact: true }).click();
  const card = root.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body strong')).toHaveText('Native Markdown');
  const id = await card.getAttribute('data-threadhold-draft-id');
  await page.reload();
  await expect(page.locator('[data-real-diff][data-ready]')).toBeVisible();
  await expect(card).toHaveAttribute('data-threadhold-draft-id', id!);
  await expect(card).toBeVisible();
  async function assertBoundedAndClickable() {
    const bounds = (await root.boundingBox())!, box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
    for (const label of ['Edit', 'Delete draft']) {
      const button = card.getByRole('button', { name: label, exact: true });
      expect(await button.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
    }
  }
  await assertBoundedAndClickable();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor).toHaveValue('Pointer-editable draft\n\n**Native Markdown**');
  await editor.fill('Updated local draft');
  await editor.press('Control+Enter');
  await expect(card.locator('.th-body')).toHaveText('Updated local draft');
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  const scrollbar = root.locator(':scope > .overflow-guard > .monaco-scrollable-element > .scrollbar.horizontal');
  const track = await scrollbar.boundingBox();
  const thumb = await scrollbar.locator('.slider').boundingBox();
  if (!track || !thumb) throw new Error('Real horizontal scrollbar is required for this regression');
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
  await page.mouse.down(); await page.mouse.move(track.x + track.width - 12, thumb.y + thumb.height / 2, { steps: 8 }); await page.mouse.up();
  await assertBoundedAndClickable();
  const bounds = (await root.boundingBox())!;
  const beforeWheel = (await card.boundingBox())!.y;
  await page.mouse.move(bounds.x + bounds.width - 40, bounds.y + bounds.height - 70);
  await page.mouse.wheel(0, 600);
  await expect.poll(async () => (await card.boundingBox())!.y).toBeLessThan(beforeWheel);
  const vertical = root.locator(':scope > .overflow-guard > .monaco-scrollable-element > .scrollbar.vertical');
  const verticalTrack = (await vertical.boundingBox())!;
  const verticalThumb = (await vertical.locator('.slider').boundingBox())!;
  await page.mouse.move(verticalThumb.x + verticalThumb.width / 2, verticalThumb.y + verticalThumb.height / 2);
  await page.mouse.down(); await page.mouse.move(verticalThumb.x + verticalThumb.width / 2, verticalTrack.y + verticalTrack.height - 12, { steps: 8 }); await page.mouse.up();
  await expect(card).toBeHidden();
  const scrolledThumb = (await vertical.locator('.slider').boundingBox())!;
  await page.mouse.move(scrolledThumb.x + scrolledThumb.width / 2, scrolledThumb.y + scrolledThumb.height / 2);
  await page.mouse.down(); await page.mouse.move(scrolledThumb.x + scrolledThumb.width / 2, verticalTrack.y + 12, { steps: 8 }); await page.mouse.up();
  await expect(card).toBeVisible();
  await page.setViewportSize({ width: 820, height: 820 });
  await expect.poll(async () => (await root.boundingBox())!.width).toBeLessThan(bounds.width);
  await assertBoundedAndClickable();
  if (split && side === 'right' && multiline) await page.screenshot({ path: 'test-results/threadhold-fixed-split.png' });
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor).toHaveValue('Updated local draft');
  await editor.fill('Discard this edit');
  await root.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card.locator('.th-body')).toHaveText('Updated local draft');
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  await card.getByRole('button', { name: 'Delete draft', exact: true }).click();
  await card.getByRole('button', { name: 'Yes, delete draft', exact: true }).click();
  await expect(root.locator('[data-threadhold-slot]')).toHaveCount(0);
  expect(writes).toBe(0);
});
}
});

test('All Changes keyboard activation preserves an unchanged left-line anchor', async () => {
  await page.goto(`${url}?_a=files&table-diff=1`);
  const section = page.locator('.repos-summary-header');
  await section.getByRole('button', { name: 'Add left comment on line 35', exact: true }).press('Enter');
  await page.getByRole('textbox', { name: 'Table inline comment', exact: true }).fill('Keyboard draft');
  await section.getByRole('button', { name: 'Opslaan als draft', exact: true }).click();
  await expect(section.locator('[data-threadhold-card] .th-body')).toHaveText('Keyboard draft');
  expect(writes).toBe(0);
  const sent = page.waitForRequest(request => request.method() === 'POST');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Drafts plaatsen (1)', exact: true }).click();
  expect((await sent).postDataJSON().threadContext).toEqual({
    filePath: '/src/file-with-hyphens.ts',
    leftFileStart: { line: 35, offset: 1 }, leftFileEnd: { line: 35, offset: 1 },
  });
  await expect(section.locator('[data-threadhold-card]')).toHaveCount(0);
});

test('All Changes rejects a cross-side selection without losing native editor text', async () => {
  await page.goto(`${url}?_a=files&table-diff=1&split=1`);
  await dragNativeTableSelection('left', 'right');
  const section = page.locator('.repos-summary-header');
  await section.getByRole('button', { name: 'Add right comment on line 38', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Table inline comment', exact: true });
  await editor.fill('Keep this ambiguous selection text');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(section.locator('[data-threadhold-action="save"]')).toHaveCount(0);
  await expect(editor).toHaveValue('Keep this ambiguous selection text');
  await expect(section.getByRole('button', { name: 'Comment', exact: true })).toBeVisible();
  expect(writes).toBe(0);
});

test.describe(() => {
test.use({ locale: 'en-US' });

for (const split of [false, true]) for (const side of split ? ['left', 'right'] as const : ['right'] as const) for (const entry of ['F4', 'selected-text click', 'selected-text keyboard']) {
test(`English native ${entry} ${split ? 'split' : 'inline'} ${side} suggestions retain Markdown and range`, async () => {
  await page.goto(`${url}?_a=files&path=/src/example.ts&real-monaco=1${split ? '&split=1' : ''}`);
  await expect(page.locator('[data-real-diff][data-ready]')).toBeVisible();
  const root = page.locator(side === 'left' ? '.original-in-monaco-diff-editor' : '.modified-in-monaco-diff-editor');
  const code = root.locator('textarea.inputarea');
  await code.focus(); await code.press('Control+Home');
  await code.press('ArrowDown'); await code.press('ArrowDown');
  await code.press('Shift+ArrowDown'); await code.press('Shift+ArrowDown');
  if (entry === 'F4') await code.press('F4');
  else {
    const selectedText = root.getByRole('button', { name: 'Comment selected text', exact: true });
    if (entry === 'selected-text click') await selectedText.click();
    else { await selectedText.focus(); await selectedText.press('Enter'); }
  }
  const editor = root.getByRole('textbox', { name: 'Inline comment', exact: true });
  await expect(editor).toBeVisible();
  await root.getByRole('button', { name: 'Insert a suggestion', exact: true }).click();
  const body = '```suggestion\n' + [3, 4].map(line => `const line${line} = "${'long content '.repeat(18)}";`).join('\n') + '\n\n```\n';
  await expect(editor).toHaveValue(body);
  await root.getByRole('button', { name: 'Save as draft', exact: true }).click();
  const card = root.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body pre code')).toContainText('const line3 =');
  const id = await card.getAttribute('data-threadhold-draft-id');
  await page.reload();
  await expect(card).toHaveAttribute('data-threadhold-draft-id', id!);
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor).toHaveValue(body);
  await root.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  expect(writes).toBe(0);
  const sent = page.waitForRequest(request => request.method() === 'POST');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Publish drafts (1)', exact: true }).click();
  const payload = (await sent).postDataJSON();
  expect(payload.comments[0].content).toBe(body);
  expect(payload.threadContext).toEqual({
    filePath: '/src/example.ts',
    [side === 'left' ? 'leftFileStart' : 'rightFileStart']: { line: 3, offset: 1 },
    [side === 'left' ? 'leftFileEnd' : 'rightFileEnd']: { line: 5, offset: 1 },
  });
  await expect(card).toHaveCount(0);
});
}

test('English native F4 without a selection drafts a suggestion for the whole line', async () => {
  await page.goto(`${url}?_a=files&path=/src/example.ts&real-monaco=1`);
  await expect(page.locator('[data-real-diff][data-ready]')).toBeVisible();
  const root = page.locator('.modified-in-monaco-diff-editor');
  const code = root.locator('textarea.inputarea');
  await code.focus(); await code.press('Control+Home');
  await code.press('ArrowDown'); await code.press('ArrowDown'); await code.press('ArrowRight');
  await code.press('F4');
  await root.getByRole('button', { name: 'Insert a suggestion', exact: true }).click();
  const sourceLine = `const line3 = "${'long content '.repeat(18)}";`;
  const body = '```suggestion\n' + sourceLine + '\n```\n';
  await expect(root.getByRole('textbox', { name: 'Inline comment', exact: true })).toHaveValue(body);
  await root.getByRole('button', { name: 'Save as draft', exact: true }).click();
  const card = root.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body pre code')).toHaveText(sourceLine + '\n');
  expect(writes).toBe(0);
  const sent = page.waitForRequest(request => request.method() === 'POST');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Publish drafts (1)', exact: true }).click();
  const payload = (await sent).postDataJSON();
  expect(payload.comments[0].content).toBe(body);
  expect(payload.threadContext).toEqual({
    filePath: '/src/example.ts',
    rightFileStart: { line: 3, offset: 1 }, rightFileEnd: { line: 3, offset: sourceLine.length + 1 },
  });
  await expect(card).toHaveCount(0);
});

for (const split of [false, true]) for (const side of split ? ['left', 'right'] as const : ['right'] as const) for (const multiline of [false, true]) for (const entry of multiline ? ['F4', 'selected-text click', 'selected-text keyboard'] : ['F4']) {
test(`English narrow native panel ${split ? 'split' : 'inline'} ${side} ${multiline ? 'multiline suggestion' : 'single-line comment'} via ${entry} saves and reopens the same draft`, async () => {
  await page.setViewportSize({ width: 700, height: 820 });
  await page.goto(`${url}?_a=files&path=/src/example.ts&real-monaco=1${split ? '&split=1' : ''}`);
  await expect(page.locator('[data-real-diff][data-ready]')).toBeVisible();
  const root = page.locator(side === 'left' ? '.original-in-monaco-diff-editor' : '.modified-in-monaco-diff-editor');
  const code = root.locator('textarea.inputarea');
  await code.focus(); await code.press('Control+Home');
  await code.press('ArrowDown'); await code.press('ArrowDown');
  if (multiline) { await code.press('Shift+ArrowDown'); await code.press('Shift+ArrowDown'); }
  else await code.press('ArrowRight');
  if (entry === 'F4') await code.press('F4');
  else {
    const selectedText = root.getByRole('button', { name: 'Comment selected text', exact: true });
    if (entry === 'selected-text click') await selectedText.click();
    else { await selectedText.focus(); await selectedText.press('Enter'); }
  }
  const panel = page.locator('.bolt-panel');
  const editor = panel.getByRole('textbox', { name: 'Inline comment', exact: true });
  const body = multiline ? '```suggestion\n' + [3, 4].map(line => `const line${line} = "${'long content '.repeat(18)}";`).join('\n') + '\n\n```\n' : 'Single-line panel comment';
  if (multiline) await panel.getByRole('button', { name: 'Insert a suggestion', exact: true }).click();
  else await editor.fill(body);
  await expect(editor).toHaveValue(body);
  await panel.getByRole('button', { name: 'Save as draft', exact: true }).click();
  const card = root.locator('[data-threadhold-card]');
  if (multiline) await expect(card.locator('.th-body pre code')).toContainText('const line3 =');
  else await expect(card.locator('.th-body')).toHaveText(body);
  const id = await card.getAttribute('data-threadhold-draft-id');
  await page.reload();
  await expect(card).toHaveAttribute('data-threadhold-draft-id', id!);
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor).toHaveValue(body);
  await expect(panel.getByRole('button', { name: 'Save', exact: true })).toHaveCount(1);
  await editor.press('Control+Enter');
  await expect(card).toHaveAttribute('data-threadhold-revision', '2');
  expect(writes).toBe(0);
  const sent = page.waitForRequest(request => request.method() === 'POST');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Publish drafts (1)', exact: true }).click();
  const payload = (await sent).postDataJSON();
  expect(payload.comments[0].content).toBe(body);
  expect(payload.threadContext).toEqual({
    filePath: '/src/example.ts',
    [side === 'left' ? 'leftFileStart' : 'rightFileStart']: { line: 3, offset: 1 },
    [side === 'left' ? 'leftFileEnd' : 'rightFileEnd']: { line: multiline ? 5 : 3, offset: multiline ? 1 : `const line3 = "${'long content '.repeat(18)}";`.length + 1 },
  });
  await expect(card).toHaveCount(0);
});
}
});
