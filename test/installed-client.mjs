import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const endpoint='http://127.0.0.1:19387/api/dsh-pintop';
const initial=await (await fetch(endpoint)).json();
assert.equal(typeof initial.enabled,'boolean');
let module,component,cursor=0,cells=[],effects=[],pending=[],tree;
const React={
 useState(init){const i=cursor++;if(!(i in cells))cells[i]=typeof init==='function'?init():init;return [cells[i],v=>{cells[i]=typeof v==='function'?v(cells[i]):v;}];},
 useRef(init){const i=cursor++;return cells[i]??(cells[i]={current:init});},
 useCallback(fn){cursor++;return fn;},
 useEffect(fn){const i=cursor++;if(!(i in cells)){cells[i]=true;effects.push(fn);}},
 createElement(type,props,...children){return {type,props,children};}
};
const calls=[];
const clientFetch=(url,opts)=>{calls.push(opts.method);return fetch(new URL(url,'http://127.0.0.1:19387/'),opts);};
vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:x=>{module=x;}},addEventListener(){},removeEventListener(){}},fetch:clientFetch,AbortController,setTimeout,clearTimeout});
const plugin=module.factory(id=>{assert.equal(id,'react');return React;});
plugin.apply({effect:fn=>fn(),locale:{register:()=>()=>{}},slots:{inject(slot,fn){assert.equal(slot,'sidebar.footer.action');fn();},register(meta,fn){assert.equal(meta.id,'dsh-pintop');component=fn;}}});
function render(wide=true){cursor=0;tree=component({wide});return tree.children[0];}
async function settle(){for(let i=0;i<1000;i++){await new Promise(r=>setTimeout(r,100));if(cells[1]===false)return render();}throw Error('Client request did not settle');}
try{
 let button=render();assert.equal(button.props.disabled,true);
 const cleanup=effects.map(fn=>fn());
 button=await settle();assert.equal(button.props.disabled,false);assert.equal(button.props['aria-pressed'],initial.enabled);
 button.props.onClick();assert.equal(render().props.disabled,false);button=await settle();assert.equal(button.props['aria-pressed'],!initial.enabled);assert.equal(button.props.disabled,false);
 assert.equal((await(await fetch(endpoint)).json()).enabled,!initial.enabled);
 button.props.onClick();assert.equal(render().props.disabled,false);button=await settle();assert.equal(button.props['aria-pressed'],initial.enabled);
 assert.equal((await(await fetch(endpoint)).json()).enabled,initial.enabled);
 const rail=render(false);assert.equal(rail.children[0],'📌');assert.equal(typeof rail.props['aria-label'],'string');
 cleanup.forEach(fn=>fn?.());assert.deepEqual(calls,['GET','POST','POST']);
 console.log('PASS installed client: sidebar registration, loading gate, native state read, pin click, independent Windows state verification, unpin click, rail aria label, cleanup. Original state restored.');
}finally{await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:initial.enabled})});}
