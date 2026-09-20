// Optional capture resources never gate hand-only XR. The resource adapters own
// generation guards and stop late-acquired streams after their stop callback runs.
export class CaptureSetup {
 constructor({camera,microphone,stopCamera,stopMicrophone}){Object.assign(this,{camera,microphone,stopCamera,stopMicrophone});this.generation=0;this.pending=false;}
 cancel(){this.generation++;this.pending=false;this.stopCamera();this.stopMicrophone();}
 async enable(){
  const generation=++this.generation;this.pending=true;const result={camera:false,microphone:false,errors:[]};
  for(const [name,start]of [['camera',this.camera],['microphone',this.microphone]]){
   if(generation!==this.generation)return null;
   try{await start();if(generation!==this.generation)return null;result[name]=true;}
   catch(e){result.errors.push(`${name}: ${e.message}`);}
  }
  if(generation!==this.generation)return null;this.pending=false;return result;
 }
}
