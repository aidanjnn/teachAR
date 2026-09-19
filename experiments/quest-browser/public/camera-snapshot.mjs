// A presented video frame is not a hardware sensor timestamp. No wall-clock freshness math.
export function nextVideoSnapshot({video,valid,draw,now=()=>performance.now(),timeoutMs=2500,setTimer=setTimeout,clearTimer=clearTimeout}){
  return new Promise((resolve,reject)=>{
    if(!valid()||video.readyState<2||!video.videoWidth||typeof video.requestVideoFrameCallback!=='function'){
      reject(Error('No fresh camera frame available. Enable the camera before AR.'));return;
    }
    const requested=now(),baseline=video.currentTime;let callback=null,settled=false,timer;
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimer(timer);
      if(callback!==null)video.cancelVideoFrameCallback?.(callback);
      error?reject(error):resolve(value);
    };
    timer=setTimer(()=>finish(Error('Camera did not deliver a fresh frame. No photo was saved.')),timeoutMs);
    function received(_,metadata){
      callback=null;
      if(!valid())return finish(Error('Camera or session changed. No photo was saved.'));
      const elapsed=now()-requested;
      if(!Number.isFinite(elapsed)||elapsed<0||elapsed>timeoutMs)return finish(Error('Camera frame arrived too late.'));
      if(!Number.isFinite(metadata.mediaTime)||metadata.mediaTime<=baseline){callback=video.requestVideoFrameCallback(received);return;}
      try{finish(null,{...draw(),capture:{clock:'browser-video',media_time_s:metadata.mediaTime,request_age_ms:elapsed}});}catch(e){finish(e);}
    }
    callback=video.requestVideoFrameCallback(received);
  });
}
