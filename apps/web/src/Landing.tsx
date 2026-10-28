import {useEffect,useRef,useState} from 'react';
import {AlertCircle,ArrowRight,Check,CheckCheck,LoaderCircle,LockKeyhole,ShieldAlert,ShieldCheck,Sparkles,Tent,UtensilsCrossed,Wallet,X} from 'lucide-react';
import type {Config} from './types';

const pendingKey='swarm.pendingRequest';
/** Sign-in with PayPal leaves the page; the description waits in this tab until the organizer is back. */
export function takePendingRequest(){try{const text=sessionStorage.getItem(pendingKey)??'';sessionStorage.removeItem(pendingKey);return text;}catch{return '';}}
function continueWithPayPal(request:string){try{if(request.trim())sessionStorage.setItem(pendingKey,request);}catch{/* The description is retyped. */}window.location.assign('/api/paypal/start');}
export const signInOutcomes:Record<string,string>={'paypal-cancelled':'PayPal sign-in was cancelled. Try again whenever you’re ready.','paypal-failed':'PayPal couldn’t confirm the sign-in. Try again.'};

export const exampleRequest="I'm hosting an outdoor tech meetup for 30 people at Riverside Pavilion. Rain is forecast. Find catering and 5 pop-up tents within a total budget of $1,500.";

/** The signed-out page: one promise and one place to describe the event. Sign-in sits top right. */
export function Landing({config,busy,error,request,onRequest,onDismiss,onDemo,onSignIn}:{config:Config;busy:string;error:string;request:string;onRequest:(text:string)=>void;onDismiss:()=>void;onDemo:()=>void;onSignIn:(username:string,password:string)=>void}) {
  const [signingIn,setSigningIn]=useState(false);const input=useRef<HTMLTextAreaElement>(null);
  const described=!!request.trim();
  function openSignIn(){onDismiss();setSigningIn(true);}
  // Locally the description opens a demo workspace; hosted, the organizer signs in first. Either way it's read next.
  function plan(){if(!described||busy)return;if(config.demoSessionEnabled)onDemo();else openSignIn();}
  return <div className="landing">
    <header className="landing-header"><Brand/><div className="landing-header-actions"><ModePill config={config}/><button className="landing-signin-link" onClick={openSignIn}>Sign in</button></div></header>
    <main className="landing-main">
      <section className="landing-pitch">
        <h1>Book your event.<br/>Pay only on your terms.</h1>
        <p className="landing-lede">Describe your event and AI agents source tents and catering within your budget. Approve the plan once. Each merchant is paid through PayPal on the terms you agreed, and catering only after the venue confirms delivery.</p>
        {error&&!signingIn&&<div className="message error" role="alert"><AlertCircle size={18}/><span>{error}</span><button aria-label="Dismiss error" onClick={onDismiss}><X size={16}/></button></div>}
        <form className="composer" onSubmit={e=>{e.preventDefault();plan();}}>
          <textarea ref={input} aria-label="Describe your event" rows={3} maxLength={4000} value={request} onChange={e=>onRequest(e.target.value)}
            placeholder="An outdoor meetup for 30 people next Saturday. Rain is likely. We need 5 tents and catering, $1,500 in total."
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();plan();}}}/>
          <div className="composer-bar">
            {!described&&<button type="button" className="composer-example" onClick={()=>{onRequest(exampleRequest);input.current?.focus();}}><Sparkles size={14}/>Use an example</button>}
            <button className="button button-primary composer-send" disabled={!!busy||!described}>{busy&&!signingIn?<LoaderCircle className="spin" size={18}/>:null}Plan my event<ArrowRight size={18}/></button>
          </div>
        </form>
        <p className="composer-note">{config.demoSessionEnabled?'No account needed.':config.paypalSignIn?'Next, continue with PayPal to create your account or sign in.':'You’ll sign in with your organizer account next.'} Nothing is paid until you approve a plan.</p>
        <ul className="landing-outcomes">
          <li><span><Wallet size={17}/></span><div><strong>Stay on budget</strong>Nothing is paid beyond the plan you approve.</div></li>
          <li><span><LockKeyhole size={17}/></span><div><strong>Pay on delivery</strong>Catering is charged only after a signed delivery receipt.</div></li>
          <li><span><ShieldCheck size={17}/></span><div><strong>Agents can’t overspend</strong>Every payment request is checked before any money moves.</div></li>
        </ul>
      </section>
      <ExamplePlan/>
    </main>
    <SiteFooter config={config} className="landing-footer"/>
    {signingIn&&<SignInDialog paypal={config.paypalSignIn} request={request} busy={busy} error={error} onDismiss={onDismiss} onClose={()=>{setSigningIn(false);onDismiss();}} onSignIn={onSignIn}/>}
  </div>;
}

/** Organizer sign-in over the landing: PayPal first when configured, which also creates the account. A typed description is kept and read once the organizer is in. */
function SignInDialog({paypal,request,busy,error,onDismiss,onClose,onSignIn}:{paypal:boolean;request:string;busy:string;error:string;onDismiss:()=>void;onClose:()=>void;onSignIn:(username:string,password:string)=>void}) {
  const [leaving,setLeaving]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);const secret=useRef<HTMLInputElement>(null);const payPal=useRef<HTMLButtonElement>(null);
  const [username,setUsername]=useState('organizer');const [password,setPassword]=useState('');
  useEffect(()=>{
    if(!dialog.current?.open)dialog.current?.showModal();(paypal?payPal:secret).current?.focus();
    // Back from PayPal, the browser may restore this page as it was left: offer PayPal again.
    const restored=(e:PageTransitionEvent)=>{if(e.persisted)setLeaving(false);};
    window.addEventListener('pageshow',restored);return()=>window.removeEventListener('pageshow',restored);
  },[]);
  const described=!!request.trim();
  return <dialog ref={dialog} className="signin-dialog" aria-labelledby="signin-title" onClose={onClose}>
    <div className="signin-body">
      <button className="dialog-close" aria-label="Close sign-in" onClick={()=>dialog.current?.close()}><X size={20}/></button>
      <h2 id="signin-title">{described?'Sign in to plan your event':'Sign in'}</h2>
      <p>{paypal?'New to SwarmPay? Continuing with PayPal creates your account from your PayPal name and email.':'Use your organizer account to plan and pay for your events.'}{described?' We’ll read your description as soon as you’re in.':''}</p>
      {described&&<blockquote className="signin-request"><span>{request}</span></blockquote>}
      {error&&<div className="message error" role="alert"><AlertCircle size={18}/><span>{error}</span><button aria-label="Dismiss error" onClick={onDismiss}><X size={16}/></button></div>}
      {paypal&&<><button ref={payPal} className="button paypal-button landing-cta" disabled={!!busy||leaving} onClick={()=>{setLeaving(true);continueWithPayPal(request);}}>{leaving?<LoaderCircle className="spin" size={18}/>:null}Continue with PayPal</button>
        <p className="signin-or"><span>or use the organizer password</span></p></>}
      <form className="landing-signin" onSubmit={e=>{e.preventDefault();onSignIn(username,password);setPassword('');}}>
        <label>Organizer<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label>
        <label>Password<input ref={secret} type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <button className="button button-primary landing-cta" disabled={!!busy}>{busy?<LoaderCircle className="spin" size={18}/>:null}Sign in<ArrowRight size={18}/></button>
      </form>
    </div>
  </dialog>;
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
