import { HANDOFF_CONTEXT_KEYS, HANDOFF_EVENT_ACTIONS } from "@/lib/experience-handoff";

/** Route-owned UI, applied at delivery so existing saved experiences gain it too. */
export function appendOwnerHandoff(html: string, id: string, nonce: string, embedded: boolean): string {
  if (embedded || !/^[a-z0-9_-]{8,128}$/i.test(id)) return html;
  const runtime = `<style>
  #flz-owner-handoff{box-sizing:border-box;width:min(540px,calc(100vw - 32px));max-height:calc(100dvh - 32px);margin:auto;padding:38px;border:1px solid #d8ecfa;border-radius:24px;background:#fff;color:#1c293f;box-shadow:0 28px 90px #07142840;font-family:Arial,sans-serif;text-align:left}
  #flz-owner-handoff::backdrop{background:#07142888;backdrop-filter:blur(4px)}
  #flz-owner-handoff h2{margin:0 32px 28px 0;color:#1c293f;font:700 clamp(28px,5vw,36px)/1.1 Arial,sans-serif;letter-spacing:-.03em;text-transform:none}
  #flz-owner-handoff .flz-handoff-actions{display:grid;gap:12px}
  #flz-owner-handoff a{box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-height:52px;padding:14px 18px;border:1px solid #d8ecfa;border-radius:999px;background:#fff;color:#0048de;font:600 15px/1.4 Arial,sans-serif;text-align:center;text-decoration:none;text-transform:none;letter-spacing:normal}
  #flz-owner-handoff a:first-child{background:#0077ff;color:#fff;border-color:#0077ff}
  #flz-owner-handoff a:hover{background:#eaf5ff;color:#0048de}#flz-owner-handoff a:first-child:hover{background:#0048de;color:#fff}
  #flz-owner-handoff .flz-handoff-close{position:absolute;right:12px;top:12px;display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:transparent;color:#53647f;font:28px/1 Arial,sans-serif;cursor:pointer}
  #flz-owner-handoff :focus-visible{outline:3px solid #0077ff;outline-offset:4px}
  @media(max-width:560px){#flz-owner-handoff{padding:30px 22px}}
  </style><script data-flz-handoff nonce="${nonce}">
  (function(){
    if(window.parent!==window)return;
    var sessionId=${JSON.stringify(id)},attempted=false,events=[],handoffPaused=false,visibleSince=document.visibilityState==='visible'?Date.now():0,visibleMs=0;
    var originalAnalytics=window.flzAnalytic;
    var actions=${JSON.stringify(HANDOFF_EVENT_ACTIONS)},contextKeys=${JSON.stringify(HANDOFF_CONTEXT_KEYS)};
    window.flzAnalytic=function(action,payload){
      if(actions.indexOf(action)!==-1){
        var context={};
        contextKeys.forEach(function(key){var value=payload&&payload[key];if(typeof value==='string'&&value.length<=160&&!/[@\\u0000-\\u001f\\u007f]/.test(value))context[key]=value});
        events.push({action:action,context:context,at:Date.now()});events=events.slice(-24);
      }
      if(typeof originalAnalytics==='function')return originalAnalytics.apply(this,arguments);
    };
    function synchronizeVisibility(){if(document.visibilityState==='hidden'||handoffPaused){if(visibleSince)visibleMs+=Date.now()-visibleSince;visibleSince=0}else if(!visibleSince)visibleSince=Date.now()}
    document.addEventListener('visibilitychange',synchronizeVisibility);
    function saveActivity(){try{window.sessionStorage.setItem('tmn_handoff_'+sessionId,JSON.stringify({savedAt:Date.now(),events:events,engagedSeconds:Math.floor((visibleMs+(visibleSince?Date.now()-visibleSince:0))/1000)}))}catch(_storageError){}}
    function show(request){
      var previous=document.activeElement,dialog=document.createElement('dialog');
      if(typeof dialog.showModal!=='function')return;
      dialog.id='flz-owner-handoff';dialog.setAttribute('aria-labelledby','flz-handoff-title');
      var label=request?(request.status==='awaiting_targets'?'Continue Personalization':request.status==='queued'||request.status==='generating'?'View Account Request':'View Account Versions'):'Personalize for 3 Accounts';
      dialog.innerHTML='<h2 id="flz-handoff-title">What would you like to explore next?</h2><div class="flz-handoff-actions"><a href="/?session='+encodeURIComponent(sessionId)+'&amp;panel=analytics" data-choice="view-engagement">View Engagement Analytics</a><a href="/?session='+encodeURIComponent(sessionId)+'&amp;panel=personalize" data-choice="personalize-accounts">'+label+'</a></div><button class="flz-handoff-close" type="button" aria-label="Close next steps">×</button>';
      document.body.appendChild(dialog);
      dialog.querySelector('.flz-handoff-close').addEventListener('click',function(){dialog.close()});
      // The resumed builder records its own action. Do not count an owner control as buyer CTA intent.
      dialog.querySelectorAll('[data-choice]').forEach(function(link){link.addEventListener('click',saveActivity)});
      dialog.addEventListener('close',function(){dialog.remove();handoffPaused=false;synchronizeVisibility();if(previous&&previous.focus)previous.focus({preventScroll:true})},{once:true});
      handoffPaused=true;synchronizeVisibility();
      dialog.showModal();
    }
    function bottom(){
      var root=document.scrollingElement||document.documentElement;
      if(attempted||root.scrollTop<=0||root.scrollTop+window.innerHeight<root.scrollHeight-8)return;
      attempted=true;window.removeEventListener('scroll',bottom);
      fetch('/api/sessions/'+encodeURIComponent(sessionId)+'/resume',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(function(response){if(!response.ok)throw new Error('not-owner');return response.json()}).then(function(data){if(data.session&&data.session.id===sessionId)show(data.request)}).catch(function(){});
    }
    window.addEventListener('scroll',bottom,{passive:true});
  })();
  </script>`;
  return html.replace(/<\/body>/i, `${runtime}</body>`);
}
