import {useState} from 'react';
import {AlertCircle,ArrowRight,Check,CheckCheck,LoaderCircle,LockKeyhole,ShieldAlert,ShieldCheck,Tent,UtensilsCrossed,Wallet,X} from 'lucide-react';
import type {Config} from './types';

/** The signed-out page: one promise, one action, no workspace menu. */
export function Landing({config,busy,error,onDismiss,onDemo,onSignIn}:{config:Config;busy:string;error:string;onDismiss:()=>void;onDemo:()=>void;onSignIn:(username:string,password:string)=>void}) {
  const [username,setUsername]=useState('organizer');const [password,setPassword]=useState('');
  return <div className="landing">
    <header className="landing-header"><Brand/><ModePill config={config}/></header>
    <main className="landing-main">
      <section className="landing-pitch">
        <h1>Book your event.<br/>Pay only on your terms.</h1>
        <p className="landing-lede">Describe your event and AI agents source tents and catering within your budget. Approve the plan once. Each merchant is paid through PayPal on the terms you agreed, and catering only after the venue confirms delivery.</p>
        {error&&<div className="message error" role="alert"><AlertCircle size={18}/><span>{error}</span><button aria-label="Dismiss error" onClick={onDismiss}><X size={16}/></button></div>}
        {config.demoSessionEnabled
          ?<div className="landing-action"><button className="button button-primary landing-cta" disabled={!!busy} onClick={onDemo}>{busy?<LoaderCircle className="spin" size={18}/>:null}Plan my event<ArrowRight size={18}/></button><span>About two minutes. No account needed.</span></div>
          :<form className="landing-signin" onSubmit={e=>{e.preventDefault();onSignIn(username,password);setPassword('');}}>
            <label>Organizer<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
            <button className="button button-primary landing-cta" disabled={!!busy}>{busy?<LoaderCircle className="spin" size={18}/>:null}Sign in<ArrowRight size={18}/></button>
            <span>Sign in with your organizer account to start planning.</span>
          </form>}
        <ul className="landing-outcomes">
          <li><span><Wallet size={17}/></span><div><strong>Stay on budget</strong>Nothing is paid beyond the plan you approve.</div></li>
          <li><span><LockKeyhole size={17}/></span><div><strong>Pay on delivery</strong>Catering is charged only after a signed delivery receipt.</div></li>
          <li><span><ShieldCheck size={17}/></span><div><strong>Agents can’t overspend</strong>Every payment request is checked before any money moves.</div></li>
        </ul>
      </section>
      <ExamplePlan/>
    </main>
    <SiteFooter config={config} className="landing-footer"/>
  </div>;
}

/** What is real and what is simulated, said once at the foot of every page. */
export function SiteFooter({config,className}:{config:Config;className:string}) {
  return <footer className={className}><div><p>{config.mode==='sandbox'?'Payments run in the PayPal sandbox. The catalog and venue are simulated.':'Payments, catalog and venue are simulated in this demo.'} {config.aiProvider==='demo'?'Agent responses are simulated.':`Planning uses ${config.model}.`} {config.authority==='AgentSafe · local test authority'?'AgentSafe checks payments with a local test authority.':`${config.authority} decides every payment.`}</p><span>Built for the PayPal AI Hackathon</span></div></footer>;
}
/** The mode pill shared by the landing and the workspace. */
export function ModePill({config}:{config:Config}) {
  return <span className="landing-mode"><i/><span>{config.mode==='sandbox'?'PayPal sandbox':<>Demo<em> · no real money moves</em></>}</span></span>;
}
export function Brand(){return <div className="brand"><span className="brand-symbol"><span/><span/><span/><span/></span>SwarmPay<span className="brand-dot">.</span></div>;}

/** An illustration of the outcome, labeled as an example rather than live data. */
function ExamplePlan() {
  return <figure className="landing-example" aria-label="Example plan">
    <figcaption><span>Example plan</span><strong>Riverside meetup</strong><small>30 guests · rain expected</small></figcaption>
    <div className="example-row"><span className="example-icon"><Tent size={18}/></span><div><strong>5 tent rentals</strong><small>Canopy Collective · $500</small></div><em className="paid"><CheckCheck size={13}/>Paid at checkout</em></div>
    <div className="example-row"><span className="example-icon"><UtensilsCrossed size={17}/></span><div><strong>30 catered meals</strong><small>Gather Kitchen · $900</small></div><em className="waiting"><LockKeyhole size={12}/>Pays on delivery</em></div>
    <div className="example-row agent"><span className="example-icon"><ShieldAlert size={17}/></span><div><strong>Agent asks to pay catering now</strong><small>No delivery receipt yet</small></div><em className="held">Held</em></div>
    <div className="example-budget"><div><span>Committed</span><strong>$1,400 <small>of $1,500</small></strong></div><span className="example-bar"><span/></span><small><Check size={13}/>Within budget</small></div>
  </figure>;
}
