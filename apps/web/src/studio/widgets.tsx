// SwarmPay's own AG Studio widgets. Each declares the fields it shows as a data mapping, which organizers can
// rewire in edit mode, and reads them through Studio's data engine, so page filters and cross-filters apply.
import {useEffect,useState} from 'react';
import {createWidgets} from 'ag-studio-react';
import type {AgWidgetField,AgWidgetFormParams,AgWidgetParams} from 'ag-studio';

const usd=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:n%1?2:0}).format(n);
type Mapped<K extends string>=Partial<Record<K,AgWidgetField[]>>;

/** The rows for the mapped fields, and a reader that takes a row and a mapping key. */
function useMapped<K extends string>(params:AgWidgetParams,keys:readonly K[]) {
  const mapping=params.dataMapping as unknown as Mapped<K>;
  const [rows,setRows]=useState<Record<string,unknown>[]>([]);
  useEffect(()=>{
    const fields=keys.flatMap(k=>mapping[k]??[]);
    if(!keys.every(k=>mapping[k]?.length)){params.widgetApi.setDisplayState('incompleteDataMapping');return;}
    let live=true;params.widgetApi.setDisplayState('loading');
    params.widgetApi.getData({kind:'flat',fields}).then(response=>{
      if(!live)return;const found=response.results.rows??[];setRows(found);params.widgetApi.setDisplayState(found.length?'displayed':'noData');
    }).catch(()=>{if(live)params.widgetApi.setDisplayState('noData');});
    return()=>{live=false;};
  // Studio hands the widget new params whenever its mapping or the page's filters change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[params]);
  const value=(row:Record<string,unknown>,key:K)=>{const field=mapping[key]?.[0];return field?row[field.key]:undefined;};
  return {rows,value};
}

const GUARDRAIL=['id','plan','budget','committed','paid','held'] as const;
/** Each plan's budget as one bar: paid, held until delivery, approved but unpaid, and what is left. */
function BudgetGuardrail(params:AgWidgetParams) {
  const {rows,value}=useMapped(params,GUARDRAIL);
  return <div className="studio-widget budget-guardrail">
    {rows.map((row,i)=>{
      const plan=String(value(row,'plan')??'Plan'),budget=Number(value(row,'budget')??0),committed=Number(value(row,'committed')??0);
      const paid=Math.max(0,Number(value(row,'paid')??0)),held=Number(value(row,'held')??0),rest=Math.max(0,committed-paid-held);
      const pct=(n:number)=>`${budget?Math.min(100,n/budget*100):0}%`;
      return <div className="guardrail-row" key={String(value(row,'id')??i)}>
        <div className="guardrail-head"><strong>{plan} <small>· {String(value(row,'id')??'').slice(0,8)}</small></strong><span>{usd(paid)} paid · {usd(held)} authorized · {usd(Math.max(0,budget-committed))} uncommitted</span></div>
        <div className="guardrail-bar" role="img" aria-label={`${plan}: ${usd(paid)} paid, ${usd(held)} held on delivery, of a ${usd(budget)} budget`}>
          <i className="paid" style={{width:pct(paid)}}/><i className="held" style={{width:pct(held)}}/><i className="committed" style={{width:pct(rest)}}/></div>
      </div>;})}
    <p className="guardrail-key"><i className="paid"/>Paid <i className="held"/>Held until delivery <i className="committed"/>Approved, not yet paid <i className="budget"/>Budget</p>
  </div>;
}

const DECISIONS=['id','when','plan','merchant','step','askedBy','decision','outcome','dossier'] as const;
/** Every request AgentSafe held or blocked, with its dossier: the record that agents asked and were stopped. */
function AgentSafeDecisions(params:AgWidgetParams) {
  const {rows,value}=useMapped(params,DECISIONS);
  const text=(row:Record<string,unknown>,key:typeof DECISIONS[number])=>{const v=value(row,key);return v instanceof Date?v.toLocaleDateString('en-US',{month:'short',day:'numeric'}):String(v??'');};
  const stopped=rows.filter(row=>['Held','Blocked'].includes(text(row,'outcome')));
  const allowed=rows.filter(row=>text(row,'outcome')==='Allowed').length;
  const other=rows.length-stopped.length-allowed;
  return <div className="studio-widget agentsafe-decisions">
    <p className="decision-summary"><strong>{stopped.length}</strong> {stopped.length===1?'request':'requests'} held or blocked · <strong>{allowed}</strong> allowed{other>0&&<> · <strong>{other}</strong> pending or not executed</>}</p>
    <ul>{stopped.slice(0,8).map((row,i)=><li key={i}>
      <span className="decision-chip">{text(row,'decision')}</span>
      <div><strong>{text(row,'askedBy')}: {text(row,'step').toLowerCase()} · {text(row,'merchant')}</strong>
        <small>{text(row,'plan')} · {text(row,'when')}{text(row,'dossier')?` · dossier ${text(row,'dossier')}`:''}</small></div></li>)}</ul>
    {!stopped.length&&<p className="quiet-note">Nothing has been held. Ask the agent to pay early from a plan to see AgentSafe stop it.</p>}
  </div>;
}

// Compose-panel icons as inline SVG: bars against a budget, and AgentSafe's shield.
const GUARDRAIL_ICON='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#11695b" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16" stroke="#d6e0db"/><path d="M4 7h9M4 12h13M4 17h6"/></svg>';
const AGENTSAFE_ICON='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#11695b" stroke-width="2" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4" stroke-linecap="round"/></svg>';
const one=(supportedRoles:('category'|'temporal'|'numeric')[])=>({type:'field' as const,supportedRoles,requires:{cardinality:'one' as const},required:true});
const mappingForm=(labels:Record<string,string>)=>(params:AgWidgetFormParams)=>params.createDefaults({dataMappingItems:Object.entries(labels).map(([key,label])=>({key,label})) as never});

export const swarmPayWidgets=createWidgets<any>({
  additionalTypes:[
    {id:'budget-guardrail',label:'Budget guardrail',icon:GUARDRAIL_ICON,
      dataMapping:{id:one(['category']),plan:one(['category']),budget:one(['numeric']),committed:one(['numeric']),paid:one(['numeric']),held:one(['numeric'])},
      form:mappingForm({id:'Plan ID',plan:'Plan',budget:'Budget',committed:'Committed',paid:'Paid',held:'Held until delivery'}),comp:BudgetGuardrail,
      defaultSize:{width:640,height:260},minSize:{width:280,height:160},
      ai:{description:'One bar per plan: paid to merchants, held until delivery, approved but unpaid, against the plan budget.',
        usage:'Use to show each plan against its budget. Map plans.id as identity, plans.plan as the label and the budget, committed, paid and held measures. Never group distinct plans only by venue.'}},
    {id:'agentsafe-decisions',label:'AgentSafe decisions',icon:AGENTSAFE_ICON,
      dataMapping:{id:one(['category']),when:one(['temporal','category']),plan:one(['category']),merchant:one(['category']),step:one(['category']),askedBy:one(['category']),decision:one(['category']),outcome:one(['category']),dossier:one(['category'])},
      form:mappingForm({id:'Request ID',when:'Date',plan:'Plan',merchant:'Merchant',step:'Step',askedBy:'Asked by',decision:'AgentSafe decision',outcome:'Decision group',dossier:'Dossier'}),comp:AgentSafeDecisions,
      defaultSize:{width:420,height:300},minSize:{width:260,height:180},
      ai:{description:'Lists every payment request AgentSafe held or blocked, with who asked, the merchant and the dossier ID.',
        usage:'Map the payments id, date, plan, merchant, step, asked-by, decision, outcome and dossier fields. Outcome Held/Blocked counts stopped requests; Pending and Not executed are separate.'}},
  ],
  menu:[{label:'SwarmPay',widgetIds:['budget-guardrail','agentsafe-decisions']}],
} as never);
