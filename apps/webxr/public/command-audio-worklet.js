class CommandAudio extends AudioWorkletProcessor {
 constructor(){super();this.block=new Float32Array(2048);this.used=0;}
 process(inputs){const input=inputs[0]?.[0];if(input)for(const value of input){this.block[this.used++]=value;if(this.used===this.block.length){this.port.postMessage(this.block,[this.block.buffer]);this.block=new Float32Array(2048);this.used=0;}}return true;}
}
registerProcessor('trail-command-audio',CommandAudio);
