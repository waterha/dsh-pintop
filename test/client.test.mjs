import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
async function harness() {
 let loaded, Component, cursor=0; const cells=[], effects=[], requests=[], listeners={};
 const react={useState(v){const i=cursor++;if(!(i in cells))cells[i]=v;return[cells[i],v=>{cells[i]=v;}];},useRef(v){const i=cursor++;return cells[i]??(cells[i]={current:v});},useCallback(fn){cursor++;return fn;},useEffect(fn){cursor++;effects.push(fn);},createElement(type,props,...children){return{type,props,children};}};
 const fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
 vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:v=>{loaded=v;}},addEventListener:(n,f)=>{listeners[n]=f;},removeEventListener:n=>{delete listeners[n];}},fetch,AbortController,setTimeout,clearTimeout,Date});
 loaded.factory(()=>react).apply({slots:{inject:(_,fn)=>fn(),register:(_,fn)=>{Component=fn;}}});
 const render=()=>{cursor=0;return Component({wide:true});};
 const respond=async(i,enabled,ok=true)=>{requests[i].resolve({ok,status:503,json:async()=>ok?{enabled}:{error:'native failed'}});for(let j=0;j<8;j++)await Promise.resolve();};
 render();const cleanup=effects[0]();await respond(0,false);
 return {render,requests,respond,listeners,cleanup};
}
test('rapid clicks remain enabled; stale response does not erase latest intent',async()=>{
 const h=await harness();try{
 let b=h.render().children[0];assert.equal(b.props.disabled,false);assert.equal(b.props.title,undefined);
 b.props.onClick();b=h.render().children[0];assert.equal(b.props.disabled,false);assert.equal(b.props['aria-pressed'],true);
 b.props.onClick();b=h.render().children[0];assert.equal(b.props['aria-pressed'],false);assert.equal(h.requests.length,2);
 await h.respond(1,true);b=h.render().children[0];assert.equal(b.props['aria-pressed'],false);assert.equal(h.requests.length,3);
 assert.equal(JSON.parse(h.requests[2].options.body).enabled,false);
 await h.respond(2,false);assert.equal(h.render().children[0].props['aria-busy'],false);
 }finally{h.cleanup();}
});
test('toggle error restores confirmed state and allows retry',async()=>{
 const h=await harness();try{h.render().children[0].props.onClick();await h.respond(1,null,false);const tree=h.render();assert.equal(tree.children[0].props['aria-pressed'],false);assert.equal(tree.children[0].props.disabled,false);assert.equal(tree.children[1].props.role,'alert');}finally{h.cleanup();}
});
test('focus immediately after initial read does not start repeated native work',async()=>{const h=await harness();try{h.listeners.focus();h.listeners.focus();assert.equal(h.requests.length,1);const b=h.render().children[0];assert.equal(b.props.onMouseEnter,undefined);assert.equal(b.props.onMouseOver,undefined);}finally{h.cleanup();}});
