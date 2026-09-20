// Polling this monitor never starts a paid check; only the server scheduler does.
const el=id=>document.getElementById(id);
let aiToken='',updating=false,polling=false;
async function monitor(){
  if(polling||document.hidden)return;
  polling=true;
  try{
    const r=await fetch('/api/ai/status',{signal:AbortSignal.timeout(4000)});
    if(!r.ok)throw new Error('Server unavailable');
    const s=await r.json();aiToken=s.token;
    const auto=s.automatic;
    if(!updating)el('ai-auto-toggle').checked=auto.enabled;
    el('ai-auto-toggle').disabled=updating||(!auto.enabled&&(!s.enabled||!s.ready));
    el('ai-countdown').textContent=auto.busy||s.busy?'Checking…':auto.enabled?(s.ready?`Next check: ${auto.countdown_seconds}s`:'Waiting for camera…'):'Auto AI off';
    el('ai-auto-note').textContent=auto.message;
    el('ai-count').textContent=`${s.calls??0} / ${s.max_calls??100} paid attempts · $${(s.reserved_usd||0).toFixed(2)} / $${(s.budget_usd||2).toFixed(2)} allowance reserved`;
    const latest=s.latest;
    if(latest){
      const age=Math.max(0,Math.floor((Date.now()-latest.captured_at_unix_ms)/1000));
      el('quest-ai-result').dataset.verdict=age>12?'unknown':latest.verdict;
      el('quest-ai-verdict').textContent=`${({pass:'Arrangement matches',fail:'Wrong placement',unknown:'Uncertain',error:'Check error'})[latest.verdict]} · ${age}s ago${age>12?' · historical':''}`;
      el('quest-ai-message').textContent=latest.message;
    }else{
      el('quest-ai-result').dataset.verdict='idle';
      el('quest-ai-verdict').textContent='No AI result for this reference yet';
      el('quest-ai-message').textContent='Look at all three toys and their labels. The result appears here after a check.';
    }
  }catch(e){
    el('ai-countdown').textContent='Disconnected';
    el('ai-auto-note').textContent='Reconnect to the laptop. Auto AI stops after 30 seconds without usable camera frames.';
    el('ai-auto-toggle').disabled=true;
    el('quest-ai-result').dataset.verdict='unknown';
    el('quest-ai-verdict').textContent='Connection lost — previous result is historical';
  }finally{polling=false;}
}
el('ai-auto-toggle').addEventListener('change',async()=>{
  updating=true;el('ai-auto-toggle').disabled=true;
  try{
    const r=await fetch('/api/ai/auto',{method:'POST',headers:{'Content-Type':'application/json','X-Tester-Token':aiToken},
      body:JSON.stringify({enabled:el('ai-auto-toggle').checked}),signal:AbortSignal.timeout(4000)});
    const answer=await r.json();if(!r.ok)throw new Error(answer.error);
  }catch(e){el('ai-auto-note').textContent=e.message;}
  finally{updating=false;await monitor();}
});
setInterval(monitor,1000);monitor();
