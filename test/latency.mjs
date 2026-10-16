import assert from 'node:assert/strict';
import {runNative,closeNative} from '../lib/index.js';
const uri='http://127.0.0.1:19387/api/dsh-pintop';
const native=process.argv.includes('--native');
async function call(enabled) {
 const t=performance.now();let state;
 if(native)state=await runNative(enabled===undefined?'get':'set',enabled);
 else { const response=await fetch(uri,enabled===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled})});state=await response.json();assert.equal(response.ok,true,JSON.stringify(state)); }
 return {state,ms:Math.round(performance.now()-t)};
}
let cold;
try {
 cold=await call();console.log(native?'Native worker cold start ms:':'First HTTP read ms:',cold.ms);
 const times=[];for(let i=0;i<10;i++){const wanted=i%2===0;const r=await call(wanted);assert.equal(r.state.enabled,wanted);times.push(r.ms);}
 console.log('10 warm toggle roundtrips ms:',JSON.stringify(times));console.log('Mean ms:',Math.round(times.reduce((a,b)=>a+b,0)/times.length));
}finally{try{if(cold)await call(cold.state.enabled);}finally{closeNative();}}
