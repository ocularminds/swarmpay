import {StrictMode,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AlertCircle,ArrowDownToLine,ArrowRight,CalendarDays,Check,CheckCheck,CloudRain,FileJson,FileUp,LoaderCircle,LockKeyhole,LogOut,MapPin,PauseCircle,Plus,ShieldAlert,ShieldCheck,Sparkles,Tent,Users,UtensilsCrossed,X} from 'lucide-react';
import {api,download,login,session} from './api';
import {PayPalCheckout} from './PayPalCheckout';
import {Brand,Landing,ModePill,SiteFooter,exampleRequest,signInOutcomes,takePendingRequest} from './Landing';
import type {Command,Config,GateResult,Intent,Offer,Order,Plan,Session,Workflow} from './types';
import './styles.css';

const money=(c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:c%100?2:0}).format(c/100);
const datetime=(value:string,timeZone?:string)=>new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone}).format(new Date(value));
function localInput(date:Date) { return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16); }
/** How the payment boundary answered a request, in the words the organizer sees. */
const boundaryLabel=(state:string)=>state==='SUCCEEDED'?'Allowed':['ESCALATE','HELD'].includes(state)?'Held by AgentSafe':['BLOCK','BLOCKED'].includes(state)?'Blocked by AgentSafe':state.replaceAll('_',' ').toLowerCase();
const operationLabels:Record<string,string>={CREATE_ORDER:'Open checkout',CAPTURE_ORDER:'Take payment',AUTHORIZE_ORDER:'Authorize payment',CAPTURE_AUTHORIZATION:'Pay after delivery',VOID_AUTHORIZATION:'Cancel authorization'};
const sourceLabels:Record<string,string>={HUMAN:'You',APPLICATION:'SwarmPay',AGENTSAFE:'AgentSafe',PHOTO:'Photo','demo-venue-fixture':'Venue (simulated)'};
const statusLabels:Record<string,string>={APPROVAL_REQUIRED:'Waiting for PayPal approval',AUTHORIZED:'Authorized · pays on delivery',CAPTURED:'Paid',VOIDED:'Cancelled',PENDING:'Confirming with PayPal',DECLINED:'Declined',EXPIRED:'Expired'};
const retryable=['NOT_EXECUTED','AUTHORITY_UNAVAILABLE'],unsettled=['QUEUED','DISPATCHING','INDETERMINATE','EXECUTION_INDETERMINATE'];
const steps=['Describe','Approve','Pay merchants','Confirm delivery'];
function Status({value,approved}:{value:string;approved:boolean}) {
  const label=value==='NEW'?(approved?'Ready to pay':'Pay after you approve'):statusLabels[value]??value.replaceAll('_',' ').toLowerCase();
  const tone=value==='CAPTURED'?'good':value==='AUTHORIZED'?'waiting':['DECLINED','EXPIRED','VOIDED'].includes(value)?'bad':'neutral';
  return <span className={`chip chip-${tone}`}>{value==='CAPTURED'?<CheckCheck size={13}/>:value==='AUTHORIZED'?<LockKeyhole size={12}/>:null}{label}</span>;
}
function Stepper({step}:{step:number}) {
  return <ol className="stepper" aria-label="Progress">{steps.map((s,i)=><li key={s} className={i<step?'done':i===step?'current':''} aria-current={i===step?'step':undefined}><span>{i<step?<Check size={13}/>:i+1}</span>{s}</li>)}</ol>;
}
function App(){
  const [config,setConfig]=useState<Config>();const [user,setUser]=useState<Session>();
  const [offers,setOffers]=useState<Offer[]>([]);const [plans,setPlans]=useState<Plan[]>([]);
  const [flow,setFlow]=useState<Workflow>();const [commands,setCommands]=useState<Command[]>([]);
  const [activeId,setActiveId]=useState<string>();const activeRef=useRef(activeId);activeRef.current=activeId;
  // Back from PayPal: say how sign-in went once, then drop it from the address.
  const [error,setError]=useState(()=>{const outcome=new URLSearchParams(window.location.search).get('signin');if(outcome)window.history.replaceState(null,'','/');return signInOutcomes[outcome??'']??'';});
  const [notice,setNotice]=useState('');const [busy,setBusy]=useState('');
  const [request,setRequest]=useState(takePendingRequest);const [guests,setGuests]=useState(30);const [tents,setTents]=useState(5);const [budget,setBudget]=useState('1500');
  const [date,setDate]=useState(()=>localInput(new Date(Date.now()+3600000)));const [venue,setVenue]=useState('');
  const [weather,setWeather]=useState('');const [tentMode,setTentMode]=useState<''|'RENT'|'BUY'>('');
  const [tentOffer,setTentOffer]=useState('');const [foodOffer,setFoodOffer]=useState('');
  const [details,setDetails]=useState<''|'read'|'manual'>('');const [clarifications,setClarifications]=useState<string[]>([]);
  const [consent,setConsent]=useState(false);const [dialog,setDialog]=useState<Order>();
  const [proof,setProof]=useState<Record<string,unknown>>();const [allEvents,setAllEvents]=useState(false);
  const busyRef=useRef(busy);busyRef.current=busy;
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[activeId,user?.authenticated]);
  useEffect(()=>{
    if(!dialog)return;
    const previouslyFocused=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'&&!busyRef.current){setDialog(undefined);return;}
      if(e.key!=='Tab')return;
      const items=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] button:not(:disabled),[role="dialog"] input:not(:disabled)'));
      const first=items[0],last=items.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previouslyFocused?.focus();};
  },[dialog?.id]);
  async function run(label:string,work:()=>Promise<unknown>) { setBusy(label);setError('');setNotice('');try{await work();}catch(e){setError(e instanceof Error?e.message:'This action could not finish.');}finally{setBusy('');} }
  useEffect(()=>{Promise.all([api<Config>('/api/config'),session()]).then(([c,s])=>{setConfig(c);setUser(s);}).catch(e=>setError(e.message));},[]);
  // A description typed on the landing comes along through sign-in and is read as soon as the organizer is in.
  useEffect(()=>{if(user?.authenticated) void run(request.trim()?'Reading your request':'Loading your plans',async()=>{const [o,p]=await Promise.all([api<Offer[]>('/api/catalog'),api<Plan[]>('/api/plans')]);setOffers(o);setPlans(p);if(request.trim())await readRequest();});},[user?.authenticated]);
  async function refresh(id=activeRef.current) {if(!id)return; const [next,cs]=await Promise.all([api<Workflow>(`/api/plans/${id}`),api<Command[]>(`/api/plans/${id}/commands`)]);if(activeRef.current===id){setFlow(next);setCommands(cs);} }
  useEffect(()=>{if(!activeId)return;void refresh(activeId).catch(e=>setError(e.message));const timer=setInterval(()=>{void refresh(activeId).catch(()=>{});},4000);return()=>clearInterval(timer);},[activeId]);

  const plan=flow?.plan;const approved=plan?.status==='APPROVED';const frozen=!!flow?.paymentFrozen;
  const paid=flow?.capturedMinor??0;const allPaid=!!plan&&paid===plan.totalMinor;const remaining=plan?plan.intent.budgetMinor-plan.totalMinor:0;
  const orders=flow?[...flow.orders].sort((a,b)=>a.category===b.category?0:a.category==='TENTS'?-1:1):[];
  const catering=orders.find(o=>o.category==='CATERING');const cateringAuthorized=catering?.status==='AUTHORIZED';
  const step=!plan?0:!approved?1:!orders.every(o=>['AUTHORIZED','CAPTURED','VOIDED'].includes(o.status))?2:allPaid?4:3;
  const lastCommand=(orderId:string)=>commands.filter(c=>c.command.orderId===orderId).at(-1);

  async function readRequest(){
    const s=await api<{attendees:number|null;tents:number|null;budgetMinor:number|null;weather:string|null;venue:string|null;eventDate:string|null;clarifications:string[]}>('/api/intent','POST',{request,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
    if(s.attendees)setGuests(s.attendees);if(s.tents)setTents(s.tents);if(s.budgetMinor)setBudget(String(s.budgetMinor/100));
    // Only what the description says: a venue or weather it doesn't name stays blank for the organizer to add.
    setWeather(s.weather??'');setVenue(s.venue??'');if(s.eventDate)setDate(localInput(new Date(s.eventDate)));
    setClarifications(s.clarifications);setDetails('read');
  }
  async function createPlan(){
    if(!request.trim())throw new Error('Describe your event in a sentence or two first.');
    if(!venue.trim())throw new Error('Add the venue so the merchants know where to deliver.');
    if(tentMode!=='RENT')throw new Error('This catalog rents tents. Choose Rent tents to continue.');
    if(!tentOffer!==!foodOffer)throw new Error('Choose both offers, or let the Sourcing Agent choose both.');
    const amount=Number(budget);if(!/^\d+(?:\.\d{1,2})?$/.test(budget)||!Number.isFinite(amount)||amount<=0)throw new Error('Enter a positive budget with at most two decimal places.');
    const intent:Intent={request,attendees:guests,tents,budgetMinor:Math.round(amount*100),eventAt:new Date(date).toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,venue,weather,tentMode:'RENT'};
    // With no offers chosen, the Sourcing Agent proposes them and the server checks its choice.
    const p=await api<Plan>('/api/plans','POST',tentOffer?{intent,tentOfferId:tentOffer,cateringOfferId:foodOffer}:{intent});
    setActiveId(p.id);setConsent(false);setPlans(prev=>[p,...prev]);
  }
  function openPlan(id:string){setFlow(undefined);setCommands([]);setActiveId(id);setConsent(false);setProof(undefined);setAllEvents(false);setError('');setNotice('');}
  function newPlan(){setActiveId(undefined);setFlow(undefined);setCommands([]);setProof(undefined);setConsent(false);setAllEvents(false);setDetails('');setTentMode('');setClarifications([]);setError('');setNotice('');}
  async function approve(){await api(`/api/plans/${plan!.id}/approve`,'POST',{version:plan!.version});await refresh();setNotice(`Plan approved. Your ${money(plan!.totalMinor)} is reserved.`);}
  async function startDemoCheckout(order:Order){const result=await api<GateResult>(`/api/plans/${plan!.id}/orders/${order.id}/checkout`,'POST');await refresh();if(result.state!=='SUCCEEDED')throw new Error(result.message);setDialog({...order,providerOrderId:result.result!.providerOrderId});}
  async function confirmDemo(){const result=await api<GateResult>(`/api/plans/${plan!.id}/orders/${dialog!.id}/buyer-approved`,'POST',{providerOrderId:dialog!.providerOrderId});setDialog(undefined);await refresh();if(result.state!=='SUCCEEDED')throw new Error(result.message);setNotice(result.message);}
  // The try row and the timeline show AgentSafe's answer; a banner would only repeat it.
  async function agentRequest(){await api<GateResult>(`/api/plans/${plan!.id}/agent-milestone`,'POST');await refresh();}
  async function confirmDelivery(){await api('/venue/deliveries','POST',{workflowId:plan!.id});await refresh();setNotice('The venue confirmed delivery. Its signed receipt was verified and the caterer was paid.');}
  async function uploadReceipt(file:File){if(file.size>32000)throw new Error('Use a signed receipt smaller than 32 KB.');const body=JSON.parse(await file.text());await api(`/api/plans/${plan!.id}/receipt`,'POST',body);await refresh();setNotice('Venue receipt verified. The catering payment was requested.');}
  async function uploadPhoto(file:File){const form=new FormData();form.set('file',file);await api(`/api/plans/${plan!.id}/photo`,'POST',form);await refresh();setNotice('Photo saved. A photo supports a delivery, but the caterer is paid only after a signed venue receipt.');}
  async function post(path:string){await api(path,'POST');await refresh();}
  async function voidAuthorization(){const r=await api<GateResult>(`/api/plans/${plan!.id}/void`,'POST');await refresh();if(r.state!=='SUCCEEDED')throw new Error(r.message);}
  async function downloadEvidence(){const result=await api<Record<string,unknown>>(`/api/plans/${plan!.id}/evidence`);setProof(result);download(`swarm-pay-evidence-${plan!.id}.json`,result);}
  async function signOut(){await api('/api/logout','POST');newPlan();setRequest('');setPlans([]);setOffers([]);setUser(await session());}

  // Signed out, the page is the landing alone: no workspace menu until the organizer is in.
  if(!config||!user) return <div className="landing-loading">{error?<div className="message error" role="alert"><AlertCircle size={19}/><span>{error}</span></div>:<><LoaderCircle className="spin"/>Opening SwarmPay…</>}</div>;
  if(!user.authenticated) return <Landing config={config} busy={busy} error={error} request={request} onRequest={setRequest} onDismiss={()=>setError('')}
    onDemo={()=>void run('Opening your workspace',async()=>{await api('/api/demo-session','POST');setUser(await session());})}
    onSignIn={(username,password)=>void run('Signing in',async()=>{await login(username,password);setUser(await session());})}/>;

  const fileInput=(label:string,accept:string,work:(file:File)=>Promise<void>,progress:string)=>
    <input aria-label={label} type="file" accept={accept} disabled={!!busy||frozen} onChange={e=>{const file=e.target.files?.[0];if(file)void run(progress,()=>work(file));e.target.value='';}}/>;
  const actions=(...buttons:React.ReactNode[])=><div className="card-actions">{buttons}</div>;

  /** The describe step: the request first, then the details the agents found. */
  function describe(){
    const [title,subtitle]=details==='read'?['Here’s what we understood.','Check the details, change anything that isn’t right, then prepare your plan.']
      :['Tell us about your event.',details==='manual'?'Fill in the details, then prepare your plan.':'We’ll find tents and catering within your budget.'];
    return <>
      <div className="page-title"><h1>{title}</h1><p>{subtitle}</p></div>
      <Stepper step={0}/>
      <section className="card describe-card">
        <label className="field-label" htmlFor="request">Your event</label>
        <textarea id="request" className="request-input" value={request} placeholder={exampleRequest} onChange={e=>setRequest(e.target.value)} maxLength={4000}/>
        {!details?<div className="card-actions">
          <button className="button button-primary next-action" disabled={!!busy||!request.trim()} onClick={()=>void run('Reading your request',readRequest)}>Plan with AI<Sparkles size={17}/></button>
          <button className="text-link" onClick={()=>setDetails('manual')}>Fill in the details yourself</button>
        </div>:<button className="text-link" disabled={!!busy||!request.trim()} onClick={()=>void run('Reading your request',readRequest)}><Sparkles size={15}/>{details==='read'?'Read my request again':'Read my request'}</button>}
        <p className="quiet-note">{config!.aiProvider==='demo'?'Simulated agents read your request.':`${config!.model} reads your request.`} Nothing is paid until you approve a plan.</p>
        {details&&<div className="details">
          <h2>Event details</h2>
          {clarifications.length>0&&<ul className="questions">{clarifications.map(q=><li key={q}><AlertCircle size={15}/>{q}</li>)}</ul>}
          <div className="field-grid">
            <label className="span-2">Venue<input value={venue} onChange={e=>setVenue(e.target.value)} maxLength={300} required placeholder="Where should tents and catering be delivered?"/></label>
            <label>Date and time<input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/><small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small></label>
            <label>Total budget (USD)<input aria-label="Total budget in USD" type="number" min="1" step="0.01" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
            <label>Guests<input type="number" min="1" max="200" value={guests} onChange={e=>setGuests(Number(e.target.value))}/></label>
            <label>Tents<input type="number" min="1" max="20" value={tents} onChange={e=>setTents(Number(e.target.value))}/></label>
            <label className="span-2">Weather and context<input value={weather} onChange={e=>setWeather(e.target.value)} maxLength={200}/></label>
          </div>
          <fieldset className="choice"><legend>Tents</legend>
            <label><input type="radio" name="tent-mode" checked={tentMode==='RENT'} onChange={()=>setTentMode('RENT')}/>Rent tents</label>
            <label><input type="radio" name="tent-mode" checked={tentMode==='BUY'} onChange={()=>setTentMode('BUY')}/>Buy tents</label>
          </fieldset>
          {tentMode==='BUY'&&<p className="field-warning"><AlertCircle size={15}/>This catalog only rents tents. Choose Rent tents to continue.</p>}
          <details className="disclosure"><summary>Choose offers yourself</summary><p className="section-note">By default the Sourcing Agent chooses the offers that fit your budget.</p><div className="field-grid">
            <label>Tent preference<select value={tentOffer} onChange={e=>setTentOffer(e.target.value)}><option value="">Sourcing Agent chooses</option>{offers.filter(o=>o.category==='TENTS').map(o=><option key={o.id} value={o.id}>{o.title} · {money(o.unitMinor)} each</option>)}</select></label>
            <label>Menu preference<select value={foodOffer} onChange={e=>setFoodOffer(e.target.value)}><option value="">Sourcing Agent chooses</option>{offers.filter(o=>o.category==='CATERING').map(o=><option key={o.id} value={o.id}>{o.title} · {money(o.unitMinor)} per guest</option>)}</select></label>
          </div></details>
          <button className="button button-primary next-action full" disabled={!!busy||tentMode!=='RENT'} onClick={()=>void run('Finding offers and checking terms',createPlan)}>Prepare my plan<ArrowRight size={17}/></button>
        </div>}
      </section>
    </>;
  }

  /** The one action that moves this plan forward, with nothing competing with it. */
  function nextStep(){
    const p=plan!;
    const card=(eyebrow:string,title:string,text:string,body:React.ReactNode)=><section className="card next-card" aria-labelledby="next-title"><span className="eyebrow">{eyebrow}</span><h2 id="next-title">{title}</h2><p>{text}</p>{body}</section>;
    if(frozen) return card('Paused','Payments are paused for review','No further automatic payments will be sent. Payments already made need follow-up with the merchant.',
      cateringAuthorized&&actions(<button key="void" className="button button-primary next-action" disabled={!!busy} onClick={()=>void run('Cancelling the catering authorization',voidAuthorization)}>Cancel catering authorization</button>));
    if(!approved) return remaining<0
      ?card('Can’t approve',`Over budget by ${money(-remaining)}`,'SwarmPay never approves a plan above your budget. Start a new plan with a higher budget, or fewer guests or tents.',
        actions(<button key="new" className="button button-primary next-action" onClick={newPlan}>Start a new plan<ArrowRight size={17}/></button>))
      :card('Next step',`Approve ${money(p.totalMinor)} for 2 merchants`,'Tents are paid at checkout. Catering is authorized now and paid only after a signed delivery receipt.',<>
        <label className="consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I approve these merchants and amounts, and paying catering after a matching delivery receipt.</span></label>
        {actions(<button key="approve" className="button button-primary next-action" disabled={!consent||!!busy} onClick={()=>void run('Reserving your budget',approve)}>Approve {money(p.totalMinor)}<ArrowRight size={17}/></button>,<small key="expiry">Quote valid until {datetime(p.expiresAt)}.</small>)}
      </>);
    if(allPaid) return card('Done','Both merchants are paid',`${money(paid)} of ${money(p.intent.budgetMinor)}. Tents were paid at checkout and catering after the venue confirmed delivery.`,
      actions(<button key="evidence" className="button button-primary next-action" onClick={()=>void run('Preparing your evidence',downloadEvidence)}><ArrowDownToLine size={17}/>Download evidence</button>,<button key="new" className="button button-white" onClick={newPlan}>Start a new plan</button>));
    const pending=orders.find(o=>!['CAPTURED','AUTHORIZED','VOIDED'].includes(o.status));
    if(pending) {
      const last=lastCommand(pending.id),position=`Next step · ${orders.indexOf(pending)+1} of 2`;
      const check=last&&<button key="check" className="button button-white" disabled={!!busy} onClick={()=>void run('Checking with PayPal',()=>post(`/api/commands/${last.command.id}/reconcile`))}>Check status</button>;
      if(last&&retryable.includes(last.state)) return card(position,'The payment didn’t start',last.result?.message??'No payment was taken.',
        actions(<button key="retry" className="button button-primary next-action" disabled={!!busy} onClick={()=>void run('Requesting a fresh authority decision',()=>post(`/api/commands/${last.command.id}/retry`))}>Try again<ArrowRight size={17}/></button>));
      if(last&&unsettled.includes(last.state)||pending.status==='PENDING') return card(position,'Checking with PayPal','We’re confirming whether this payment went through. Nothing new will be sent meanwhile.',check&&actions(check));
      if(last&&['ESCALATE','HELD','BLOCK','BLOCKED'].includes(last.state)) return card(position,'AgentSafe is holding this payment',last.result?.message??'No payment was sent.',null);
      if(['DECLINED','EXPIRED'].includes(pending.status)) return card(position,'This checkout can’t continue',`PayPal reports the payment as ${pending.status.toLowerCase()}. Start a new plan to try again.`,
        actions(<button key="new" className="button button-primary next-action" onClick={newPlan}>Start a new plan</button>));
      const tentsOrder=pending.category==='TENTS',verb=tentsOrder?'Pay':'Authorize';
      return card(position,`${verb} ${pending.merchantName}`,tentsOrder?`${money(pending.amountMinor)} for ${pending.quantity} tent rentals, paid now.`:`${money(pending.amountMinor)} for ${pending.quantity} meals. Authorized now and paid only after delivery is confirmed.`,
        config!.mode==='demo'
          ?actions(<button key="pay" className="button button-primary next-action" disabled={!!busy} onClick={()=>void run('Opening checkout',()=>startDemoCheckout(pending))}>{verb} {money(pending.amountMinor)}<ArrowRight size={17}/></button>,<small key="note">Simulated PayPal checkout</small>)
          :<PayPalCheckout planId={p.id} order={pending} clientId={config!.clientIds[pending.merchantId]} onDone={()=>void refresh()} onError={setError}/>);
    }
    if(catering?.status==='VOIDED') return card('Cancelled','The catering authorization was cancelled','No catering payment will be taken.',actions(<button key="new" className="button button-primary next-action" onClick={newPlan}>Start a new plan</button>));
    if(flow!.receiptVerified) {
      const last=catering&&lastCommand(catering.id);
      return card('Next step','Delivery confirmed. Paying the caterer','The venue’s signed receipt was verified, and the catering payment is on its way.',
        last&&actions(<button key="check" className="button button-white" disabled={!!busy} onClick={()=>void run('Checking with PayPal',()=>post(`/api/commands/${last.command.id}/reconcile`))}>Check status</button>));
    }
    const asked=flow!.agentRequests.at(-1);
    return card('Next step','Confirm the catering delivery',`${catering?.merchantName??'Catering'}’s ${money(catering?.amountMinor??0)} is authorized, not taken. It’s paid when the venue confirms delivery.`,<>
      {actions(<button key="venue" className="button button-primary next-action" disabled={!!busy} onClick={()=>void run('Asking the venue to confirm delivery',confirmDelivery)}>Confirm delivery as the venue<ArrowRight size={17}/></button>,<small key="note">Simulated venue · signs with its own key</small>)}
      <div className="try-row"><span className="try-icon"><ShieldAlert size={17}/></span><div><strong>Try it: let the agent ask to pay early</strong><p>{asked?`${boundaryLabel(asked.result.state)}. ${asked.result.message}`:'There’s no delivery receipt yet, so AgentSafe should hold the request.'}</p></div>
        <button className="button button-white" disabled={!!busy} onClick={()=>void run('The agent is asking to pay',agentRequest)}>Let the agent ask</button></div>
      <details className="disclosure"><summary>Other ways to confirm</summary><div className="upload-row">
        <label className="upload-option"><FileJson size={19}/><span><strong>Upload a venue receipt</strong>Signed JSON, issued within 15 minutes</span>{fileInput('Upload venue receipt','.json,application/json',uploadReceipt,'Verifying the venue receipt')}</label>
        <label className="upload-option"><FileUp size={19}/><span><strong>Add a delivery photo</strong>Supporting evidence only. PNG or JPEG, up to 2 MB</span>{fileInput('Add a delivery photo','image/png,image/jpeg',uploadPhoto,'Saving the photo')}</label>
      </div></details>
    </>);
  }

  function planPage(){
    const p=plan!;const sourcing=p.assessments.find(a=>a.role==='Sourcing');
    const [title,subtitle]=frozen?['Payments are paused.','No further automatic payments will be sent while you review.']
      :!approved?(remaining<0?['This plan is over budget.',`It is ${money(-remaining)} above your ${money(p.intent.budgetMinor)} budget.`]:['Review your plan.','Approve once. Each merchant is then paid on its own terms.'])
      :allPaid?['Your event is booked and paid.',`${money(p.totalMinor)} of ${money(p.intent.budgetMinor)}. Every payment followed your plan.`]
      :step===2?['Pay each merchant.','Tents are paid now. Catering is only authorized until delivery.']
      :['Catering is paid when delivery is confirmed.','Its funds are authorized, not taken, until the venue confirms.'];
    return <>
      <div className="page-title"><h1>{title}</h1><p>{subtitle}</p>
        <div className="event-facts"><span><MapPin size={15}/>{p.intent.venue}</span><span><CalendarDays size={15}/>{datetime(p.intent.eventAt,p.intent.timezone)}</span><span><Users size={15}/>{p.intent.attendees} guests</span>{p.intent.weather&&<span><CloudRain size={15}/>{p.intent.weather}</span>}</div></div>
      <Stepper step={step}/>
      {nextStep()}
      <section className="card plan-card" aria-labelledby="plan-title">
        <div className="card-head"><h2 id="plan-title">Your plan</h2><span>Delivery and taxes included</span></div>
        <div className="budget"><div className="budget-figures"><strong>{money(p.totalMinor)}</strong><span>of {money(p.intent.budgetMinor)}</span></div>
          <span className="budget-bar"><span className={remaining<0?'over':''} style={{width:`${Math.min(100,p.totalMinor/p.intent.budgetMinor*100)}%`}}/></span>
          <div className="budget-meta"><span className={remaining<0?'over':''}>{remaining<0?`${money(-remaining)} over budget`:`${money(remaining)} to spare`}</span><span>{money(paid)} paid</span></div></div>
        <ul className="merchant-list">{p.lines.map(line=>{const order=orders.find(o=>o.id===line.id)!;return <li key={line.id}>
          <span className="merchant-icon">{line.category==='TENTS'?<Tent size={19}/>:<UtensilsCrossed size={18}/>}</span>
          <div><h3>{line.merchantName}</h3><p>{line.quantity} {line.category==='TENTS'?'tent rentals':'catered meals'} × {money(line.unitMinor)} · {line.category==='TENTS'?'paid at checkout':'paid after delivery'}</p></div>
          <strong>{money(line.totalMinor)}</strong><Status value={order.status} approved={approved}/></li>;})}</ul>
        {sourcing&&<p className="agent-note"><Sparkles size={16}/><span>{sourcing.summary} <small>Sourcing Agent · {sourcing.source==='DEMO_RULES'?'simulated':sourcing.source}</small></span></p>}
        <details className="disclosure"><summary>Why this plan</summary><div className="assessments">{p.assessments.map(a=><div key={a.role}><h3>{a.role==='Sourcing'?'Sourcing Agent':'Risk and milestone review'}<small>{a.source==='DEMO_RULES'?'Simulated agent':a.source}</small></h3><p>{a.summary}</p><ul>{a.facts.map(f=><li key={f}>{f}</li>)}</ul></div>)}</div></details>
        {approved&&!allPaid&&!frozen&&<details className="disclosure"><summary>Pause or cancel</summary><p className="section-note">A delivery dispute pauses further automatic payments. The catering authorization can be cancelled before it’s paid.</p>
          {actions(<button key="pause" className="button button-white" disabled={!!busy} onClick={()=>void run('Pausing payments',()=>post(`/api/plans/${p.id}/freeze`))}><PauseCircle size={16}/>Pause payments for review</button>,
            <button key="void" className="button button-white" disabled={!!busy||!cateringAuthorized} onClick={()=>void run('Cancelling the catering authorization',voidAuthorization)}>Cancel catering authorization</button>)}</details>}
      </section>
      {timeline()}
      <div className="budget-strip" aria-hidden="true"><span><strong>{money(p.totalMinor)}</strong> of {money(p.intent.budgetMinor)}</span><span>{money(paid)} paid</span></div>
    </>;
  }

  /** One plain-language history; the authority records sit underneath for anyone who wants them. */
  function timeline(){
    const p=plan!;const events=[...flow!.events].reverse();const shown=allEvents?events:events.slice(0,6);const records=flow!.agentRequests.length+commands.length;
    const operation=(name:string)=>(operationLabels[name]??name).toLowerCase();
    return <section className="card timeline-card" aria-labelledby="timeline-title">
      <div className="card-head"><h2 id="timeline-title">What happened</h2><span>{events.length} {events.length===1?'event':'events'}</span></div>
      <ol className="timeline">{shown.map(e=><li key={e.sequence}><span className={`timeline-dot ${e.source==='AGENTSAFE'?'authority':''}`}/><div><p>{e.message}</p><small>{datetime(e.at)} · {sourceLabels[e.source]??e.source.toLowerCase()}</small></div></li>)}</ol>
      {events.length>6&&<button className="text-link" onClick={()=>setAllEvents(!allEvents)}>{allEvents?'Show fewer':`Show all ${events.length} events`}</button>}
      {records>0&&<details className="disclosure records"><summary>Payment records and authority decisions ({records})</summary>
        {flow!.agentRequests.map(a=><div className="record refused" key={a.command.id}><ShieldAlert size={16}/><div><strong>Agent request · {a.command.merchantId} · {operation(a.command.operation)}</strong><p>{a.result.message}</p>{a.result.dossierId&&<code>Dossier {a.result.dossierId}</code>}</div><span className="outcome refused">{boundaryLabel(a.result.state)}</span></div>)}
        {commands.map(c=><div className="record" key={c.command.id}><ShieldCheck size={16}/><div><strong>{c.command.merchantId} · {operation(c.command.operation)}</strong><p>{c.result?.message??'Queued for processing.'}</p>{c.result?.dossierId&&<code>Dossier {c.result.dossierId}</code>}
          {c.state!=='SUCCEEDED'&&<span className="record-actions"><button className="text-link" disabled={!!busy} onClick={()=>void run('Checking with PayPal',()=>post(`/api/commands/${c.command.id}/reconcile`))}>Check status</button>
            {retryable.includes(c.state)&&<button className="text-link" disabled={!!busy} onClick={()=>void run('Requesting a fresh authority decision',()=>post(`/api/commands/${c.command.id}/retry`))}>Try again</button>}</span>}</div>
          <span className={`outcome ${c.state==='SUCCEEDED'?'good':''}`}>{boundaryLabel(c.state)}</span></div>)}
      </details>}
      <div className="timeline-actions">{!allPaid&&<button className="text-link" onClick={()=>void run('Preparing your evidence',downloadEvidence)}><ArrowDownToLine size={16}/>Download evidence</button>}
        <button className="text-link" onClick={()=>download(`swarm-pay-workflow-${p.id}.json`,flow)}><ArrowDownToLine size={16}/>Export workflow</button></div>
      {proof&&<p className="proof-scope"><Check size={14}/>{proof.applicationChainVerified?'The record chain verifies: nothing was altered.':'The record chain did not verify.'} Hosted signature verification is separate.</p>}
    </section>;
  }

  return <div className="app">
    <header className="app-header"><div className="app-header-inner"><Brand/>
      {plans.length>0&&<select className="plan-switcher" aria-label="Your plans" value={activeId??''} onChange={e=>e.target.value?openPlan(e.target.value):newPlan()}>
        <option value="">New plan</option>{plans.map(p=><option key={p.id} value={p.id}>{p.intent.venue} · {money(p.totalMinor)} · {datetime(p.createdAt)}</option>)}</select>}
      <div className="app-header-actions"><ModePill config={config}/>{user.name&&<span className="account-name" title="Signed in">{user.name}</span>}
        {activeId&&<button className="button button-white header-button" aria-label="New plan" onClick={newPlan}><Plus size={16}/><span>New plan</span></button>}
        <button className="button button-white header-button" aria-label="Sign out" title="Sign out" disabled={!!busy} onClick={()=>void run('Signing out',signOut)}><LogOut size={16}/></button></div>
    </div></header>
    <main className="app-main">
      {error&&<div className="message error" role="alert"><AlertCircle size={19}/><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={17}/></button></div>}
      {notice&&<div className="message notice" role="status"><Check size={18}/><span>{notice}</span><button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={17}/></button></div>}
      {busy&&<div className="working" role="status"><LoaderCircle className="spin" size={15}/>{busy}…</div>}
      {!activeId?describe():flow&&plan?planPage():<div className="loading"><LoaderCircle className="spin"/>Loading your plan…</div>}
    </main>
    <SiteFooter config={config} className="app-footer"/>
    {dialog&&<div className="modal-backdrop"><section className="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><button className="dialog-close" aria-label="Close checkout" onClick={()=>setDialog(undefined)}><X size={20}/></button>
      <span className="tiny-label">SIMULATED PAYPAL CHECKOUT</span><div className="dialog-icon">{dialog.category==='TENTS'?<Tent size={32}/>:<UtensilsCrossed size={29}/>}</div>
      <h2 id="checkout-title">{dialog.merchantName}</h2><p>{dialog.category==='TENTS'?'Pay for the tent rentals now.':'Authorize catering now. It’s paid after delivery is confirmed.'}</p>
      <div className="checkout-amount">{money(dialog.amountMinor)}<small>USD · delivery and taxes included</small></div>
      <div className="dialog-note"><AlertCircle size={16}/>This simulates the PayPal approval. No PayPal transaction or real charge occurs.</div>
      <button className="button button-primary full" autoFocus disabled={!!busy} onClick={()=>void run(dialog.category==='TENTS'?'Paying':'Authorizing',confirmDemo)}>{dialog.category==='TENTS'?'Pay':'Authorize'} {money(dialog.amountMinor)}<ArrowRight size={16}/></button>
      <button className="text-button centered" disabled={!!busy} onClick={()=>setDialog(undefined)}>Cancel</button></section></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
