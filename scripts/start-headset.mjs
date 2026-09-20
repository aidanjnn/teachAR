// One origin for the Quest tutor, pairing, voice interpretation and spoken replies.
import {readFile} from 'node:fs/promises';
import {loadEnvironment} from '../apps/server/dist/config.js';
loadEnvironment();
process.env.PORT ||= '4345';
process.env.HOST ||= '127.0.0.1';
process.env.ALLOW_USB_LOOPBACK ||= 'true';
process.env.PAIRING_ORIGINS ||= `http://localhost:${process.env.PORT},http://127.0.0.1:${process.env.PORT}`;
if(process.env.OPENAI_API_KEY_FILE&&!process.env.OPENAI_API_KEY)process.env.OPENAI_API_KEY=(await readFile(process.env.OPENAI_API_KEY_FILE,'utf8')).trim();
console.log(`TeachAR headset: http://localhost:${process.env.PORT}/tutorial (USB reverse or local browser)`);
console.log('Voice is optional. Configure AI_PROVIDER=openai and a private key to enable it. Pair using the private data/pairing.json code.');
await import('../apps/server/dist/main.js');
