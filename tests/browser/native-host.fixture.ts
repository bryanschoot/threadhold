// Structural regressions from observed Azure DevOps DOM; backend routing lives in extension.spec.ts.
export const collapsedGeneralScript = String.raw`
if(new URLSearchParams(location.search).has('collapsed-general')){
  const feed=document.querySelector('.activity-feed-list');
  const thread=textarea.closest('.repos-discussion-thread');
  const composer=document.createElement('div');composer.className='bolt-timeline-first-row';composer.dataset.generalComposer='';
  const persona=document.createElement('div');persona.className='bolt-coin repos-comment-header-persona';persona.setAttribute('aria-label','Reviewer - Team');persona.dataset.userId='user-id';
  const avatar=document.createElement('img');avatar.src='/avatars/user-id.png';avatar.alt='';persona.append(avatar);
  feed.insertBefore(composer,feed.firstChild);thread.remove();
  function collapse(){
    const input=document.createElement('input');input.className='threadId--1';input.setAttribute('aria-label','Add a comment...');
    const root=document.createElement('div');root.className='repos-comment-editor-max-width';root.append(input);composer.replaceChildren(persona,root);
    input.addEventListener('click',()=>{composer.replaceChildren(persona,thread);textarea.focus();});
  }
  thread.querySelector('[data-cancel]').addEventListener('click',collapse);
  collapse();
}
`;

export const nativeTableScript = String.raw`
if(new URLSearchParams(location.search).has('table-diff')){
  document.querySelector('.page-content').hidden=true;
  const split=new URLSearchParams(location.search).has('split');
  const section=document.createElement('section');section.className='repos-summary-header';
  section.style.cssText='width:1100px;max-width:100%;background:white;border:1px solid #ddd';
  const heading=document.createElement('button');heading.className='bolt-card-expand-button';heading.setAttribute('aria-label','/src/file-with-hyphens.ts');heading.textContent='file-with-hyphens.ts';section.append(heading);
  const content='const value = "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789"; // native range';
  let nextId=-3;
  for(let line=35;line<=38;line++){
    const row=document.createElement('div');row.className='repos-diff-contents-row monospaced-text';row.dataset.fixtureLine=String(line);row.style.cssText='display:flex;white-space:pre;font:13px monospace;line-height:24px';
    for(const side of ['left','right']){
      const gutter=document.createElement('span');gutter.className='repos-add-comment-widget';
      const add=document.createElement('button');add.setAttribute('role','button');add.id=(side==='left'?'o':'m')+'-diff-widget-file-with-hyphens.ts-'+line;add.textContent=side==='left'?'<':'>';add.setAttribute('aria-label','Add '+side+' comment on line '+line);gutter.append(add);row.append(gutter);
      if(split||side==='right'){
        const cell=document.createElement('span');cell.className='repos-line-content';
        if(split)cell.setAttribute(side==='left'?'data-oline':'data-mline',String(line));else{cell.setAttribute('data-oline',String(line));cell.setAttribute('data-mline',String(line));}
        cell.style.cssText='display:inline-block;min-width:0;overflow:hidden;flex:1';
        const accessible=document.createElement('span');accessible.className='screen-reader-only';accessible.textContent='Plus \u00a0';accessible.style.cssText='position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';cell.append(accessible);
        const code=document.createElement('span');code.dataset.code='';code.textContent=content;cell.append(code);row.append(cell);
      }
      add.addEventListener('click',()=>{
        if(section.querySelector('textarea'))return;
        window.getSelection()?.removeAllRanges();
        const slot=document.createElement('div');slot.className='repos-diff-contents-row';
        slot.innerHTML='<div class="repos-discussion-thread"><div class="repos-discussion-thread-reply"><div class="repos-comment-editor-fit"><textarea class="threadId-'+(nextId--)+'" aria-label="Table inline comment"></textarea><div><button class="bolt-button">Cancel</button><button class="bolt-button primary">Comment</button></div></div></div></div>';
        row.after(slot);slot.querySelector('button').addEventListener('click',()=>slot.remove());
        slot.querySelector('.primary').addEventListener('click',()=>fetch(location.pathname.replace('/_git/repository/pullrequest/42','/_apis/git/repositories/repo-id/pullRequests/42/threads'),{method:'POST',body:JSON.stringify({body:slot.querySelector('textarea').value})}));
        slot.querySelector('textarea').focus();
      });
    }
    section.append(row);
  }
  document.querySelector('main').append(section);
}
`;

export const realMonacoScript = String.raw`
if(new URLSearchParams(location.search).has('real-monaco')){
  document.querySelector('.page-content').hidden=true;
  document.body.style.margin='0';
  const host=document.createElement('div');host.style.cssText='height:540px;width:100%;margin-top:12px';host.dataset.realDiff='';document.querySelector('main').append(host);
  const loader=document.createElement('script');loader.src='/__threadhold-monaco/loader.js';document.head.append(loader);
  loader.onload=()=>{
    window.require.config({paths:{vs:'/__threadhold-monaco'}});
    window.require(['vs/editor/editor.main'],()=>{
      const diff=monaco.editor.createDiffEditor(host,{automaticLayout:true,renderSideBySide:new URLSearchParams(location.search).has('split'),renderSideBySideInlineBreakpoint:0,readOnly:true,editContext:false,scrollBeyondLastLine:false,minimap:{enabled:false},renderOverviewRuler:false,fontSize:13,lineHeight:20});
      const code=Array.from({length:100},(_,i)=>'const line'+(i+1)+' = "'+('long content '.repeat(18))+'";').join('\n');
      const original=monaco.editor.createModel(code,'plaintext');
      const modified=monaco.editor.createModel(code.replace('line50 =','changedLine50 ='),'plaintext',monaco.Uri.parse('inmemory://model/git/repo-id/GC'+'a'.repeat(40)+'/src/example.ts'));
      diff.setModel({original,modified});
      for(const [side,editor] of [['Original',diff.getOriginalEditor()],['Modified',diff.getModifiedEditor()]]){
        const root=editor.getDomNode();root.dataset.uri=editor.getModel().uri.toString();
        const button=document.createElement('button');button.className='repos-add-comment-button';button.textContent='Add inline comment';button.style.cssText='position:relative;z-index:1';
        const affordance=document.createElement('div');affordance.setAttribute('widgetid','fixture:'+side+':AddCommentGutterWidget');affordance.append(button);
        editor.addOverlayWidget({getId:()=> 'fixture:'+side+':AddCommentGutterWidget',getDomNode:()=>affordance,getPosition:()=>({preference:monaco.editor.OverlayWidgetPositionPreference.TOP_RIGHT_CORNER})});
        function openNativeComment(range=editor.getSelection()){
          if(root.querySelector('textarea[aria-label="Inline comment"]')||document.querySelector('[data-native-panel]'))return;
          const highlight=editor.createDecorationsCollection([{range,options:{inlineClassName:'highlight-discussion-range'}}]);
          const thread=document.createElement('div');thread.className='repos-discussion-thread';thread.style.cssText='position:absolute;box-sizing:border-box;background:white;padding:8px;pointer-events:auto';
          thread.innerHTML='<div class="repos-discussion-thread-reply"><div class="repos-comment-editor-fit"><textarea class="threadId--5" aria-label="Inline comment" style="width:90%;height:54px"></textarea><div><button aria-label="Insert a suggestion" data-suggestion>Suggestion</button></div><div><button class="bolt-button" data-cancel>Cancel</button><button class="bolt-button primary">Comment</button></div></div></div>';
          const input=thread.querySelector('textarea');
          const measure=document.createElement('textarea');measure.className='threadId--5 bolt-textfield-auto-adjust-hidden';measure.style.cssText='position:absolute;height:0;opacity:0;pointer-events:none';input.before(measure);
          let panel;
          if(innerWidth<800){
            panel=document.createElement('div');panel.className='bolt-portal-host';panel.dataset.nativePanel='';
            panel.style.cssText='position:fixed;inset:0;z-index:100;background:#fff';
            panel.innerHTML='<div class="bolt-portal"><div class="bolt-panel"><div class="bolt-panel-content"><div class="repos-editor-discussion-host"><div class="repos-editor-discussion"></div></div></div></div></div>';
            panel.querySelector('.repos-editor-discussion').append(thread);document.body.append(panel);
          }
          let zoneId,top=0;
          const zone={afterLineNumber:range.endLineNumber,heightInPx:112,domNode:document.createElement('div'),onDomNodeTop(value){top=value;place();}};
          const nativeOverlay={getId:()=> 'fixture-native:'+side,getDomNode:()=>thread,getPosition:()=>null};
          function place(){const layout=editor.getLayoutInfo();thread.style.top=top+'px';thread.style.left=layout.contentLeft+'px';thread.style.width=Math.max(0,layout.contentWidth-layout.verticalScrollbarWidth)+'px';}
          if(!panel){editor.addOverlayWidget(nativeOverlay);editor.changeViewZones(accessor=>{zoneId=accessor.addZone(zone);});place();}
          const layout=editor.onDidLayoutChange(place);
          thread.querySelector('[data-cancel]').addEventListener('click',()=>{layout.dispose();highlight.clear();if(!panel){editor.removeOverlayWidget(nativeOverlay);editor.changeViewZones(accessor=>accessor.removeZone(zoneId));}thread.remove();panel?.remove();});
          thread.querySelector('[data-suggestion]').addEventListener('click',()=>{
            const textarea=input;
            textarea.value='\x60\x60\x60suggestion\n'+editor.getModel().getValueInRange(range)+'\n\x60\x60\x60\n';
            textarea.dispatchEvent(new Event('input',{bubbles:true}));textarea.focus();
          });
          thread.querySelector('.primary').addEventListener('click',()=>fetch(location.pathname.replace('/_git/repository/pullrequest/42','/_apis/git/repositories/repo-id/pullRequests/42/threads'),{method:'POST',body:JSON.stringify({body:input.value})}));
          editor.setSelection(new monaco.Range(1,1,1,1));input.focus();
        }
        button.addEventListener('click',()=>openNativeComment());
        editor.onKeyDown(event=>{
          if(event.keyCode!==monaco.KeyCode.F4)return;
          let range=editor.getSelection();
          if(range.isEmpty())range=new monaco.Range(range.startLineNumber,1,range.endLineNumber,editor.getModel().getLineMaxColumn(range.endLineNumber));
          openNativeComment(range);event.preventDefault();
        });
        const selected=document.createElement('div');
        const selectionButton=document.createElement('button');selectionButton.className='repos-add-comment-button repos-add-comment-widget';selectionButton.setAttribute('aria-label','Comment selected text');selectionButton.textContent='Comment selected text';selected.append(selectionButton);
        const selectedWidget={getId:()=> 'fixture:'+side+':AddCommentWidget',getDomNode:()=>selected,getPosition:()=>{const selection=editor.getSelection();return selection&&!selection.isEmpty()?{position:selection.getPosition(),preference:[monaco.editor.ContentWidgetPositionPreference.EXACT]}:null}};
        editor.addContentWidget(selectedWidget);editor.onDidChangeCursorSelection(()=>editor.layoutContentWidget(selectedWidget));
        selectionButton.addEventListener('click',event=>{openNativeComment();event.preventDefault();});
      }
      host.dataset.ready='';
    });
  };
}
`;
