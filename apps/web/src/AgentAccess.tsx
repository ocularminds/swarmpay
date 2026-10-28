import {useEffect,useRef,useState} from 'react';
import {AlertCircle,Check,Copy,KeyRound,LoaderCircle,X} from 'lucide-react';
import {api} from './api';
import type {Plan} from './types';

type Grant={id:string;label:string;hint:string;createdAt:string;lastUsedAt:string|null};
const when=(value:string)=>new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));

function CopyButton({value,label}:{value:string;label:string}) {
  const [done,setDone]=useState(false);
  return <button className="copy-button" aria-label={`Copy ${label}`} onClick={()=>{void navigator.clipboard?.writeText(value).then(()=>{setDone(true);setTimeout(()=>setDone(false),1500);});}}>{done?<Check size={15}/>:<Copy size={15}/>}{done?'Copied':'Copy'}</button>;
}

/** The organizer grants their own agent, or Postman, access to their plans: never approval, and every payment it asks for meets AgentSafe. */
export function AgentAccess({plans,onClose}:{plans:Plan[];onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [grants,setGrants]=useState<Grant[]>();const [label,setLabel]=useState('Postman');
  const [issued,setIssued]=useState<{token:string;label:string}>();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const endpoint=`${window.location.origin}/mcp`;
  async function work(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:'That didn’t work. Try again.');}finally{setBusy(false);}}
  const load=()=>api<Grant[]>('/api/agent-tokens').then(setGrants);
  useEffect(()=>{if(!dialog.current?.open)dialog.current?.showModal();void work(load);},[]);
  return <dialog ref={dialog} className="signin-dialog agent-dialog" aria-labelledby="agent-title" onClose={onClose}>
    <div className="signin-body">
      <button className="dialog-close" aria-label="Close agent access" onClick={()=>dialog.current?.close()}><X size={20}/></button>
      <h2 id="agent-title">Connect an agent</h2>
      <p>Your agent, or Postman, can search offers, prepare plans and ask to pay a milestone on your plans. It can never approve a plan, and every payment it asks for goes through AgentSafe.</p>
      {error&&<div className="message error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="agent-field"><span>MCP endpoint</span><code>{endpoint}</code><CopyButton value={endpoint} label="MCP endpoint"/></div>
      {issued
        ?<div className="agent-issued" role="status"><strong>{issued.label} can now connect. Copy its token now; it won’t be shown again.</strong>
          <div className="agent-field"><span>Bearer token</span><code>{issued.token}</code><CopyButton value={issued.token} label="agent token"/></div></div>
        :<form className="agent-create" onSubmit={e=>{e.preventDefault();void work(async()=>{const r=await api<{grant:Grant;token:string}>('/api/agent-tokens','POST',{label});setIssued({token:r.token,label:r.grant.label});await load();});}}>
          <label>Agent name<input value={label} maxLength={60} onChange={e=>setLabel(e.target.value)}/></label>
          <button className="button button-primary" disabled={busy||!label.trim()}>{busy?<LoaderCircle className="spin" size={16}/>:<KeyRound size={16}/>}Create agent token</button>
        </form>}
      <h3>Active agents</h3>
      {!grants?<p className="quiet-note">Loading…</p>:grants.length===0?<p className="quiet-note">No agent has access yet.</p>
        :<ul className="agent-list">{grants.map(g=><li key={g.id}><div><strong>{g.label}</strong><small>…{g.hint} · {g.lastUsedAt?`last used ${when(g.lastUsedAt)}`:'not used yet'}</small></div>
          <button className="text-link" disabled={busy} onClick={()=>void work(async()=>{await api(`/api/agent-tokens/${g.id}`,'DELETE');if(issued)setIssued(undefined);await load();})}>Revoke</button></li>)}</ul>}
      {plans.length>0&&<><h3>Plan IDs your agent can use</h3><ul className="agent-list">{plans.slice(0,5).map(p=><li key={p.id}><div><strong>{p.intent.venue}</strong><small><code>{p.id}</code></small></div><CopyButton value={p.id} label={`plan ID for ${p.intent.venue}`}/></li>)}</ul></>}
      <p className="quiet-note">Try it with the SwarmPay Postman collection in the repository’s <code>postman</code> folder.</p>
    </div>
  </dialog>;
}
