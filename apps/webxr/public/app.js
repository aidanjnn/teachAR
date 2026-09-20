const $=id=>document.getElementById(id);
const names=['goose / A','fox / B','square / C'];
const colors=['#87e6cf','#ffd08a','#b8b1ff'];
let state={},referenceImage,boxes=[],corner=null,referenceRevision=0,checking=false,epoch=0,lastFrame=0,lastResultAt=0,dirty=true;
let aiState={},aiChecking=false;
async function api(path,body){
  const response=await fetch(path,{...(body?{method:'POST',headers:{'Content-Type':'application/json',...(path==='/api/ai/check'?{'X-Tester-Token':aiState.token||''}:{})},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(path==='/api/ai/check'?25000:8000)});
  const value=await response.json(); if(!response.ok)throw new Error(value.error||'Request failed'); return value;
}
function result(kind,message){$('result').dataset.verdict=kind;$('verdict').textContent=({pass:'Arrangement matches',fail:'Wrong placement detected',unknown:'Uncertain — inspect the view',error:'Could not check',idle:'Ready when you are'})[kind];$('message').textContent=message;}
function invalidate(message){$('result-engine').textContent='No check run yet';epoch++;lastResultAt=0;$('rows').replaceChildren();$('evidence').textContent='';$('inspection').hidden=true;result('idle',message);}
function draw(){
  const canvas=$('reference'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!referenceImage)return;ctx.drawImage(referenceImage,0,0);
  boxes.forEach((box,i)=>{ctx.strokeStyle=colors[i];ctx.lineWidth=4;ctx.strokeRect(...box);ctx.fillStyle=colors[i];ctx.font='bold 23px system-ui';ctx.fillText(names[i],box[0]+4,Math.max(25,box[1]-8));});
  if(!dirty){(state.label_boxes||[]).forEach((box,i)=>{ctx.strokeStyle=colors[i];ctx.lineWidth=3;ctx.setLineDash([10,8]);ctx.strokeRect(...box);ctx.setLineDash([]);ctx.font='20px system-ui';ctx.fillStyle=colors[i];ctx.fillText(`Tissue ${['A','B','C'][i]}`,box[0],box[1]+box[3]+22);});}
  if(corner){ctx.fillStyle=colors[boxes.length];ctx.beginPath();ctx.arc(...corner,7,0,Math.PI*2);ctx.fill();}
  $('mark-help').textContent=boxes.length<3?`Mark ${names[boxes.length]}: click ${corner?'the opposite':'the first'} corner.`:(dirty?'Three boxes marked. Click “Use these three boxes.”':'Reference ready. Dashed boxes should contain the stationary tissues.');
}
async function loadReference(){
  const image=new Image();image.src=`/api/reference.jpg?r=${state.revision}`;await image.decode();
  referenceImage=image;$('reference').width=image.naturalWidth;$('reference').height=image.naturalHeight;
  boxes=state.boxes?state.boxes.map(b=>[...b]):[];corner=null;referenceRevision=state.revision;dirty=!state.boxes;draw();
}
async function refresh(){
  try{
    state=await api('/api/state');
    $('source').value=state.selected_source;
    const fresh=state.age_ms!==null&&state.age_ms<3000;
    $('connection').textContent=fresh?`${state.source} · frame ${state.frame_id}`:`Waiting for ${state.selected_source} frames — keep its camera page visible`;
    if(state.shape&&state.frame_id!==lastFrame){lastFrame=state.frame_id;$('live').src=`/api/frame.jpg?f=${lastFrame}`;$('empty').hidden=true;$('empty').style.display='none';}
    if(!state.shape){$('live').removeAttribute('src');lastFrame=0;$('empty').hidden=false;$('empty').style.display='block';}
    if(!state.has_reference&&referenceImage){referenceImage=null;boxes=[];corner=null;dirty=true;referenceRevision=state.revision;draw();$('mark-help').textContent='Save a reference first.';}
    if(state.has_reference&&state.revision!==referenceRevision){epoch++;await loadReference();}
    $('check').disabled=!fresh||!state.boxes||checking||aiChecking||dirty;$('save').disabled=!fresh;
    $('ai-check').disabled=!fresh||!state.boxes||dirty||checking||aiChecking||!aiState.enabled||aiState.busy||aiState.cooldown_seconds>0;
    if(lastResultAt&&Date.now()-lastResultAt>3500){$('evidence').textContent+=' · Historical snapshot; check again for current state.';lastResultAt=0;}
  }catch(error){$('connection').textContent=`Server unavailable: ${error.message}`;}
}
$('reference').addEventListener('pointerdown',event=>{
  if(!referenceImage||boxes.length===3)return;
  const rect=$('reference').getBoundingClientRect();
  const point=[Math.max(0,Math.min(referenceImage.width,Math.round((event.clientX-rect.left)*referenceImage.width/rect.width))),Math.max(0,Math.min(referenceImage.height,Math.round((event.clientY-rect.top)*referenceImage.height/rect.height)))];
  if(!corner)corner=point;
  else {const box=[Math.min(corner[0],point[0]),Math.min(corner[1],point[1]),Math.abs(corner[0]-point[0]),Math.abs(corner[1]-point[1])];if(box[2]<30||box[3]<30)return;boxes.push(box);corner=null;}
  dirty=true;$('auto').checked=false;invalidate('Reference boxes edited. Save all three before checking.');draw();
});
$('undo').onclick=()=>{if(corner)corner=null;else boxes.pop();dirty=true;$('auto').checked=false;invalidate('Reference boxes edited. Save them before checking.');draw();};
$('save').onclick=async()=>{try{$('auto').checked=false;invalidate('Reference saved. Mark each plushie on the reference image.');await api('/api/reference',{});await refresh();}catch(e){result('error',e.message);}};
$('boxes').onclick=async()=>{try{await api('/api/boxes',{boxes,revision:referenceRevision});invalidate('Reference ready. Swap two plushies and check.');await refresh();}catch(e){result('error',e.message);}};
async function check(){
  if(checking||dirty||aiChecking)return; checking=true;const token=epoch;$('check').disabled=true;$('ai-check').disabled=true;
  $('result-engine').textContent='LOCAL CHECK · FREE · NOT OPENAI';
  try{const answer=await api('/api/check',{});if(token!==epoch)return;
    result(answer.verdict,answer.message+(answer.verdict==='unknown'?' This was the free local matcher. Try the separate “Check with AI · paid” button.':''));lastResultAt=Date.now();
    $('evidence').textContent=`Captured frame ${answer.frame_id} · ${answer.age_ms} ms old when checked · alignment: ${answer.alignment.method}. Feature counts are evidence, not accuracy percentages.`;
    const {snapshot,...diagnostics}=answer;
    $('inspection').src=`data:image/jpeg;base64,${snapshot}`;$('inspection').hidden=false;
    $('debug').textContent=JSON.stringify(diagnostics,null,2);
    $('rows').replaceChildren(...answer.slots.map(r=>{const div=document.createElement('div');div.className='slot';div.textContent=`${r.slot}: expected ${r.expected} · ${r.observed?`looks like ${r.observed}`:'uncertain'}`;return div;}));
  }catch(e){if(token===epoch)result('error',e.message);}finally{checking=false;}
}
$('check').onclick=check;
$('source').onchange=async()=>{try{$('auto').checked=false;invalidate('Camera source changed. Save a new reference from that camera.');await api('/api/source',{source_kind:$('source').value});await refresh();}catch(e){result('error',e.message);}};
$('upload').onchange=async event=>{
  try{const file=event.target.files[0];if(!file)return;const image=await createImageBitmap(file);const c=document.createElement('canvas'),scale=Math.min(1,960/image.width,960/image.height);c.width=Math.round(image.width*scale);c.height=Math.round(image.height*scale);c.getContext('2d').drawImage(image,0,0,c.width,c.height);image.close();await api('/api/frame',{image:c.toDataURL('image/jpeg',.9).split(',')[1],source:'upload'});await refresh();if(state.boxes)await check();}catch(e){result('error',e.message);}event.target.value='';
};
setInterval(refresh,800);setInterval(()=>{if($('auto').checked&&state.boxes&&state.age_ms<3000&&!document.hidden)check();},1500);refresh();

async function refreshAI(){
  try{aiState=await api('/api/ai/status');
    $('ai-status').textContent=!aiState.configured?'Server API key not configured':
      `${aiState.model} · ${aiState.calls}/${aiState.max_calls} attempts · $${aiState.reserved_usd.toFixed(2)}/$${aiState.budget_usd.toFixed(2)} allowance reserved · estimated usage $${aiState.estimated_billed_usd.toFixed(4)}${aiState.blocked?' · Paused: check API key/quota':aiState.cooldown_seconds>0?` · wait ${Math.ceil(aiState.cooldown_seconds)}s`:''}`;
  }catch(e){$('ai-status').textContent='AI status unavailable';}
}
$('ai-check').onclick=async()=>{
  if(aiChecking||checking||dirty)return;
  aiChecking=true;$('auto').checked=false;const token=++epoch;
  $('ai-check').disabled=true;$('check').disabled=true;$('result-engine').textContent='OPENAI CHECK · PAID SNAPSHOT';
  $('rows').replaceChildren();$('inspection').hidden=true;$('evidence').textContent='';lastResultAt=0;
  result('idle','OpenAI is inspecting this captured frame…');
  try{const answer=await api('/api/ai/check',{});if(token!==epoch)return;
    result(answer.verdict,answer.message);lastResultAt=Date.now();
    $('evidence').textContent=`AI snapshot · frame ${answer.frame_id} · ${answer.age_ms} ms old · estimated request $${answer.usage.estimated_usd.toFixed(4)} · ${answer.evidence} · Automatic step advancement OFF.`;
    const {snapshot,...diagnostics}=answer;
    $('inspection').src=`data:image/jpeg;base64,${snapshot}`;$('inspection').hidden=false;
    $('rows').replaceChildren(...answer.slots.map(r=>{const div=document.createElement('div');div.className='slot';div.textContent=`${r.slot}: expected ${r.expected} · observed ${r.observed||'uncertain'}`;return div;}));
    $('debug').textContent=JSON.stringify(diagnostics,null,2);
  }catch(e){if(token===epoch)result('error',e.message);}
  finally{aiChecking=false;await refreshAI();await refresh();}
};
setInterval(refreshAI,2000);refreshAI();
