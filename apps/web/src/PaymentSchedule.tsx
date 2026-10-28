import {useEffect,useMemo,useState} from 'react';
import {BryntumScheduler} from '@bryntum/scheduler-react';
import '@bryntum/scheduler/scheduler.css';
import '@bryntum/scheduler/svalbard-light.css';
import {api} from './api';
import {money} from './labels';
import type {LedgerEntry,Order,Plan} from './types';

const hour=3600000;
// The venue can confirm delivery from two hours before the event until four hours after (ReceiptVerifier).
const deliveryOpens=2*hour,deliveryCloses=4*hour;
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const settled=(entries:LedgerEntry[],operation:string)=>entries.find(e=>e.operation===operation&&e.state==='SUCCEEDED');
type Bar={id:string;resourceId:string;name:string;startDate:Date;endDate:Date;eventColor:string;detail:string};

/** When each merchant is paid: tents at checkout, catering held until the venue can confirm delivery. Times are the recorded ones. */
export default function PaymentSchedule({plan,orders,refreshKey}:{plan:Plan;orders:Order[];refreshKey:number}) {
  const [entries,setEntries]=useState<LedgerEntry[]>([]);
  useEffect(()=>{api<LedgerEntry[]>(`/api/ledger?workflowId=${plan.id}`).then(setEntries).catch(()=>setEntries([]));},[plan.id,refreshKey]);
  const view=useMemo(()=>{
    const tents=orders.find(o=>o.category==='TENTS')!,catering=orders.find(o=>o.category==='CATERING')!;
    const created=new Date(plan.createdAt),expires=new Date(plan.expiresAt),event=new Date(plan.intent.eventAt),now=new Date();
    const resources=[
      {id:'tents',name:tents.merchantName,role:'Tents · paid at checkout'},
      {id:'catering',name:catering.merchantName,role:'Catering · paid on delivery'},
      {id:'event',name:'Your event',role:plan.intent.venue}];
    const bars:Bar[]=[{id:'quote',resourceId:'event',name:'Quote valid',startDate:created,endDate:expires,eventColor:'gray',detail:'Approve before the quote expires'},
      {id:'event',resourceId:'event',name:'Event starts',startDate:event,endDate:event,eventColor:'blue',detail:plan.intent.venue}];
    const tentsPaid=settled(entries,'CAPTURE_ORDER');
    if(tentsPaid)bars.push({id:'tents-paid',resourceId:'tents',name:`Paid ${money(tentsPaid.amountMinor)}`,startDate:new Date(tentsPaid.settledAt),endDate:new Date(tentsPaid.settledAt),eventColor:'green',detail:'Captured at checkout'});
    else bars.push({id:'tents-due',resourceId:'tents',name:`Pay ${money(tents.amountMinor)} at checkout`,startDate:created,endDate:expires,eventColor:'teal',detail:'After you approve the plan'});
    const authorized=settled(entries,'AUTHORIZE_ORDER'),cateringPaid=settled(entries,'CAPTURE_AUTHORIZATION');
    if(authorized){const from=new Date(authorized.settledAt);const to=cateringPaid?new Date(cateringPaid.settledAt):new Date(Math.max(event.getTime()+deliveryCloses,from.getTime()+hour/4));
      bars.push({id:'catering-held',resourceId:'catering',name:`${money(authorized.amountMinor)} authorized, held`,startDate:from,endDate:to,eventColor:'orange',detail:'Authorized, not taken, until a signed delivery receipt'});}
    if(cateringPaid)bars.push({id:'catering-paid',resourceId:'catering',name:`Paid ${money(cateringPaid.amountMinor)} after delivery`,startDate:new Date(cateringPaid.settledAt),endDate:new Date(cateringPaid.settledAt),eventColor:'green',detail:'Captured after the venue’s signed receipt'});
    for(const asked of entries.filter(e=>e.requestedBy==='AGENT'))
      bars.push({id:`agent-${asked.id}`,resourceId:'catering',name:'Agent asked early · held',startDate:new Date(asked.at),endDate:new Date(asked.at),eventColor:'red',detail:'AgentSafe held the request; no delivery receipt yet'});
    const times=[created,now,...bars.map(b=>b.startDate),new Date(event.getTime()+deliveryCloses)].map(t=>t.getTime());
    // Lead-in in proportion to the span, so a payment's label at the very start isn't clipped at any zoom.
    const first=Math.min(...times),last=Math.max(...times),pad=Math.max(hour/2,(last-first)*0.12);
    const startDate=new Date(first-pad),endDate=new Date(last+Math.max(hour/4,(last-first)*0.05));
    const span=(endDate.getTime()-startDate.getTime())/hour;
    return {resources,bars,startDate,endDate,viewPreset:span<=16?'hourAndDay':span<=24*5?'dayAndWeek':'weekAndDay',
      timeRanges:[{id:'delivery',name:'Venue can confirm delivery',startDate:new Date(event.getTime()-deliveryOpens),endDate:new Date(event.getTime()+deliveryCloses),cls:'delivery-window'}]};
  },[plan,orders,entries]);
  return <section className="card schedule-card" aria-labelledby="schedule-title">
    <div className="card-head"><h2 id="schedule-title">When each merchant is paid</h2><span>Recorded times · shaded: delivery window</span></div>
    <div className="schedule-frame">
      <BryntumScheduler readOnly forceFit autoHeight rowHeight={56} barMargin={12} milestoneLayoutMode="measure"
        startDate={view.startDate} endDate={view.endDate} viewPreset={view.viewPreset}
        columns={[{text:'',field:'name',width:window.innerWidth<600?124:190,renderer:({record}:{record:{getData:(f:string)=>string}})=>({children:[{tag:'strong',text:record.getData('name')},{tag:'small',text:record.getData('role')}]})}]}
        resources={view.resources} events={view.bars} timeRanges={view.timeRanges}
        timeRangesFeature={{showCurrentTimeLine:true,showHeaderElements:true}}
        eventTooltipFeature={{template:({eventRecord}:{eventRecord:{getData:(f:string)=>unknown}})=>`<strong>${escape(String(eventRecord.getData('name')))}</strong><br>${escape(String(eventRecord.getData('detail')??''))}`}}/>
    </div>
  </section>;
}
