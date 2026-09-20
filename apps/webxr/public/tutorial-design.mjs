// Shared appearance for the DOM shell and the actual XR canvas, not a second state machine.
export const THEMES={
 charcoal:{ground:'#1b1d19',surface:'#242522',raised:'#2d3029',ink:'#e5e6dc',muted:'#b6b8ad',line:'#56584f',action:'#d7d8cc',actionInk:'#20231f',success:'#a5dbb5',warning:'#e4bd7c',ghost:'#7cdadd'},
 light:{ground:'#eeede5',surface:'#d8d7ce',raised:'#e4e3d9',ink:'#262922',muted:'#505448',line:'#838777',action:'#272d26',actionInk:'#e5e6dc',success:'#356146',warning:'#775523',ghost:'#7cdadd'}
};
export function preferences(storage){
 try{storage??=globalThis.localStorage;const v=JSON.parse(storage.getItem('trail:appearance')||'{}');return {theme:v.theme==='light'?'light':'charcoal',sound:v.sound!==false};}catch{return {theme:'charcoal',sound:true};}
}
export function applyAppearance(value){
 const p=THEMES[value.theme]||THEMES.charcoal;
 if(typeof document!=='undefined'){for(const [key,v]of Object.entries(p))document.documentElement.style.setProperty(`--trail-${key}`,v);document.documentElement.dataset.theme=value.theme;}
 try{localStorage.setItem('trail:appearance',JSON.stringify({theme:value.theme,sound:value.sound}));}catch{/* A denied preference write must not block a tutorial. */}
}
export function drawIcon(ctx,name,x,y,size,color){
 ctx.save();ctx.translate(x,y);ctx.scale(size/24,size/24);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
 if(name==='plus'){ctx.moveTo(12,5);ctx.lineTo(12,19);ctx.moveTo(5,12);ctx.lineTo(19,12);}
 else if(name==='library'){for(const a of [5,10,15]){ctx.moveTo(a,5);ctx.lineTo(a,19);}ctx.moveTo(18,5);ctx.lineTo(22,18);}
 else if(name==='check'){ctx.moveTo(5,12);ctx.lineTo(10,17);ctx.lineTo(20,6);}
 else if(name==='pause'){ctx.moveTo(8,5);ctx.lineTo(8,19);ctx.moveTo(16,5);ctx.lineTo(16,19);}
 else if(name==='repeat'){ctx.arc(12,12,7,-Math.PI*.75,Math.PI*.9);ctx.moveTo(3,3);ctx.lineTo(3,9);ctx.lineTo(9,9);}
 else {for(const a of [5,12,19]){ctx.moveTo(a,12);ctx.lineTo(a+.1,12);}}
 ctx.stroke();ctx.restore();
}
