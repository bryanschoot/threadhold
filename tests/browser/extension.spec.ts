import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// Synthetic native host fixture: proves the installed extension, not ADO DOM compatibility.
const url = 'https://dev.azure.com/fixture/project/_git/repository/pullrequest/42';
const fixture = `<!doctype html><html><head><meta charset="utf-8"></head><body><main class="repos-pr-details-page"><button class="repos-pr-header-vote-button">Approve</button><nav><div role="tablist"><a role="tab" href="?">Overview</a></div></nav><div class="page-content"><div class="activity-feed-list"><div class="repos-discussion-thread" data-existing-thread><div class="repos-comment-viewer" id="1700000000">Original remote comment</div><div class="repos-discussion-thread-reply"><div class="repos-comment-editor-max-width"><input class="threadId-86671" aria-label="Reply to original comment"></div></div></div><div class="repos-discussion-thread"><div class="repos-discussion-thread-reply"><div class="repos-comment-editor-fit repos-comment-editor-max-width"><textarea class="threadId--1" aria-label="Add a comment"></textarea><div><button class="bolt-button" type="button" data-cancel>Cancel</button><button id="__bolt-comment-1" class="bolt-button primary" type="button">Comment</button></div></div></div></div></div></div></main><script>
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
    let editorReady=false;
    const editor={getDomNode:()=>editorReady?root:null,getModel:()=>model,getSelection:()=>selection,setSelection:range=>{selection=range},
      revealRangeInCenter(){},focus(){
        root.querySelector('[widgetid$=":AddCommentGutterWidget"]').hidden=true;
        root.querySelector('[widgetid$=":AddCommentWidget"]').hidden=selection.startLineNumber===selection.endLineNumber&&selection.startColumn===selection.endColumn;
      },onDidDispose:()=>({dispose(){}}),onDidChangeModel:()=>({dispose(){}}),
      changeViewZones(callback){callback({addZone(zone){const id=crypto.randomUUID();root.append(zone.domNode);zones.set(id,zone);return id},
        removeZone(id){zones.get(id)?.domNode.remove();zones.delete(id)},layoutZone(){}})}
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
</script></body></html>`;
let context: BrowserContext;
let page: Page;
let directory: string;
let writes: number;
let failPublication: boolean;
let published: { id: number; comments: { id: number; content: string; publishedDate: string; author: { id: string; displayName: string } }[] }[];
let english: boolean;

test.beforeEach(async ({}, info) => {
  english = info.title.startsWith('English');
  directory = await mkdtemp(join(tmpdir(), 'threadhold-browser-'));
  const extensionPath = resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(directory, { channel: 'chromium', headless: true, locale: english ? 'en-US' : 'nl-NL', args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
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
  await context.route('https://dev.azure.com/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
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
        : pathname.endsWith('/threads') ? { value: [{ id: 86671, comments: [{ id: 1, content: 'Original remote comment', publishedDate: '2023-11-14T22:13:20.000Z', author: { id: 'other-user', displayName: 'Original reviewer' } }] }, ...published] }
        : pathname.endsWith('/iterations') ? { value: [{ id: 1 }] }
        : pathname.endsWith('/pullRequests/42') ? { repository: { id: 'repo-id', project: { id: 'project-id' } }, lastMergeSourceCommit: { commitId: 'a'.repeat(40) }, lastMergeTargetCommit: { commitId: 'b'.repeat(40) } }
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

test('browser-agent CRUD survives reload and never publishes', async () => {
  const text = 'Lokale review: café 🧵\n**Markdown** @<user-id> <img src=x onerror=alert(1)>';
  await page.getByRole('textbox', { name: 'Add a comment', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Opslaan als draft', exact: true }).click();
  const card = page.locator('[data-threadhold-card]');
  await expect(card.locator('.th-body')).toHaveText(text);
  await expect(page.locator('[data-existing-thread] [data-threadhold-card]')).toHaveCount(0);
  const id = await card.getAttribute('data-threadhold-draft-id');
  await page.reload();
  await expect(card.locator('.th-body')).toHaveText(text);
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
  await expect(page.locator('.page-content > [role="status"]')).toContainText('onbekende publicatiestatus');
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
