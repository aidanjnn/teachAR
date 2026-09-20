const $ = id => document.getElementById(id);
let stream, generation=0, timer, lastVideoTime=-1, sent=0;
function stop() {
  generation++; clearTimeout(timer);
  stream?.getTracks().forEach(track=>track.stop()); stream=null;
  $('video').srcObject=null;
  $('status').textContent='Camera stopped. The checker will reject stale frames.';
}
async function start() {
  stop(); const token=generation;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices) throw new Error('Camera needs a secure origin. Use Quest localhost through adb reverse, or trusted HTTPS.');
    $('status').textContent='Requesting camera permission…';
    const deviceId=$('devices').value;
    const video={width:{ideal:1280},height:{ideal:960},frameRate:{ideal:15}, ...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}})};
    const next=await navigator.mediaDevices.getUserMedia({video,audio:false});
    if(token!==generation){next.getTracks().forEach(t=>t.stop());return;}
    stream=next; $('video').srcObject=stream; await $('video').play();
    const cameras=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
    const active=stream.getVideoTracks()[0].getSettings().deviceId;
    $('devices').replaceChildren(...cameras.map((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||`Camera ${i+1}`;o.selected=d.deviceId===active;return o;}));
    $('status').textContent='Sending frames to the laptop. Confirm the preview shows your plushies.';
    lastVideoTime=-1; sent=0; pump(token);
  } catch(error) { if(token===generation){stop();$('status').textContent=`${error.name}: ${error.message}`;} }
}
async function pump(token) {
  if(token!==generation||!stream)return;
  try {
    const video=$('video');
    if(!document.hidden && video.readyState>=2 && video.videoWidth && video.currentTime!==lastVideoTime) {
      lastVideoTime=video.currentTime;
      const canvas=document.createElement('canvas');
      const scale=Math.min(1,960/video.videoWidth,960/video.videoHeight);
      canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
      canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
      const image=canvas.toDataURL('image/jpeg',.82).split(',')[1];
      const response=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,source:'camera'}),signal:AbortSignal.timeout(4000)});
      if(!response.ok)throw new Error((await response.json()).error);
      sent++;$('stats').textContent=`${canvas.width} × ${canvas.height} · ${sent} frames sent · ${stream.getVideoTracks()[0].label}`;
      $('status').textContent='Connected. Keep your hands clear during checks.';
    }
  }catch(error){$('status').textContent=`Frame upload failed: ${error.message}. Retrying…`;}
  if(token===generation)timer=setTimeout(()=>pump(token),600);
}
$('start').onclick=start;$('switch').onclick=start;$('stop').onclick=stop;
window.addEventListener('pagehide',stop);

// Release the camera when another Quest page becomes active.
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
