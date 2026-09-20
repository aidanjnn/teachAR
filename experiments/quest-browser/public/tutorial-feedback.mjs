// Event feedback never determines progression. Storage success is emitted by the awaited write.
export class TutorialFeedback {
 constructor(){this.current=null;this.sequence=0;this.last=new Map();}
 emit(kind,text,now){
  if(!Number.isFinite(now))return null;
  if(now-(this.last.get(kind)??-Infinity)<1000)return null;
  this.last.set(kind,now);this.current={kind,text,at:now,until:now+(kind==='error'?7000:1800),sequence:++this.sequence};return this.current;
 }
 visible(now){return this.current&&now<this.current.until?this.current:null;}
 clear(){this.current=null;}
}
export class FeedbackAudio {
 constructor(){this.context=null;this.enabled=true;}
 async unlock(){if(!this.enabled)return;try{const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(C){this.context??=new C();await this.context.resume();}}catch{/* Visual feedback remains authoritative. */}}
 play(event){
  if(!this.enabled||this.context?.state!=='running'||event.kind==='tracking')return;
  const c=this.context,start=c.currentTime;
  const frequencies=event.kind==='saved'?[660,880]:event.kind==='error'?[220]:event.kind==='checkpoint'?[660]:[440];
  frequencies.forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=f;o.type='sine';g.gain.setValueAtTime(0,start+i*.1);g.gain.linearRampToValueAtTime(.035,start+i*.1+.015);g.gain.exponentialRampToValueAtTime(.0001,start+i*.1+.13);o.connect(g);g.connect(c.destination);o.start(start+i*.1);o.stop(start+i*.1+.14);o.onended=()=>{o.disconnect();g.disconnect();};});
 }
 close(){void this.context?.close().catch(()=>{});this.context=null;}
}
