import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {BryntumScheduler} from '@bryntum/scheduler-react';
import {DateHelper} from '@bryntum/scheduler';
import '@bryntum/scheduler/scheduler.css';
import '@bryntum/scheduler/svalbard-light.css';
import {api} from './api';
import {money} from './labels';
import type {LedgerEntry,Order,Plan} from './types';

const hour=3600000,day=24*hour;
// The venue can confirm delivery from two hours before the event until four hours after (ReceiptVerifier).
const deliveryOpens=2*hour,deliveryCloses=4*hour;
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// PayPal guarantees an authorization's funds for its first 3 days and keeps it for 29.
const honorPeriod=3*day,authorizationLife=29*day;
const settled=(entries:LedgerEntry[],operation:string)=>entries.find(e=>e.operation===operation&&e.state==='SUCCEEDED');
/** What the tooltip says about a recorded payment: who decided it and the PayPal reference. */
const proof=(e:LedgerEntry)=>[e.dossierId?`AgentSafe allowed it · dossier ${e.dossierId}`:'',e.refundId??e.captureId??e.authorizationId??e.providerOrderId?`PayPal ${e.refundId??e.captureId??e.authorizationId??e.providerOrderId}`:''].filter(Boolean);
type Bar={id:string;resourceId:string;name:string;startDate:Date;endDate:Date;eventColor:string;detail:string[];cls?:string};
type Range={id:string;resourceId:string;startDate:Date;endDate:Date;cls:string};

/** When each merchant is paid: tents at checkout, catering held until the venue can confirm delivery. Times are the recorded ones. */
export default function PaymentSchedule({plan,orders,refreshKey}:{plan:Plan;orders:Order[];refreshKey:number}) {
  const [entries,setEntries]=useState<LedgerEntry[]>([]);
  useEffect(()=>{api<LedgerEntry[]>(`/api/ledger?workflowId=${plan.id}`).then(setEntries).catch(()=>setEntries([]));},[plan.id,refreshKey]);
  // The frame's width and font size, so ticks and labels are sized to what is actually on screen.
  const frame=useRef<HTMLDivElement>(null);const [fit,setFit]=useState({width:0,em:16});const nameWidth=window.innerWidth<600?132:190;
  useLayoutEffect(()=>{const el=frame.current!;const measure=()=>{const width=el.clientWidth,em=parseFloat(getComputedStyle(el).fontSize);setFit(f=>f.width===width&&f.em===em?f:{width,em});};
    measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[]);
  const view=useMemo(()=>{
    const tents=orders.find(o=>o.category==='TENTS')!,catering=orders.find(o=>o.category==='CATERING')!;
    const created=new Date(plan.createdAt),expires=new Date(plan.expiresAt),event=new Date(plan.intent.eventAt),now=new Date();
    const resources=[
      {id:'tents',name:tents.merchantName,role:'Tents · paid at checkout'},
      {id:'catering',name:catering.merchantName,role:'Catering · paid on delivery'},
      {id:'event',name:'Your event',role:plan.intent.venue}];
    const bars:Bar[]=[{id:'quote',resourceId:'event',name:'Quote valid',startDate:created,endDate:expires,eventColor:'gray',detail:['Approve before the quote expires']},
      {id:'event',resourceId:'event',name:'Event starts',startDate:event,endDate:event,eventColor:'blue',detail:[plan.intent.venue]}];
    const ranges:Range[]=[];
    const tentsPaid=settled(entries,'CAPTURE_ORDER'),refunded=settled(entries,'REFUND_CAPTURE');
    if(tentsPaid)bars.push({id:'tents-paid',resourceId:'tents',name:`Paid ${money(tentsPaid.amountMinor)}`,startDate:new Date(tentsPaid.settledAt),endDate:new Date(tentsPaid.settledAt),eventColor:'green',detail:['Captured at checkout',...proof(tentsPaid)]});
    else bars.push({id:'tents-due',resourceId:'tents',name:`Pay ${money(tents.amountMinor)} at checkout`,startDate:created,endDate:expires,eventColor:'teal',detail:['After you approve the plan']});
    if(refunded)bars.push({id:'tents-refunded',resourceId:'tents',name:`Refunded ${money(refunded.amountMinor)}`,startDate:new Date(refunded.settledAt),endDate:new Date(refunded.settledAt),eventColor:'purple',detail:['You cancelled the event; PayPal returned the payment',...proof(refunded)]});
    const authorized=settled(entries,'AUTHORIZE_ORDER'),cateringPaid=settled(entries,'CAPTURE_AUTHORIZATION');
    const renewed=settled(entries,'REAUTHORIZE_AUTHORIZATION'),voided=settled(entries,'VOID_AUTHORIZATION');
    if(authorized){
      const from=new Date(authorized.settledAt),ended=cateringPaid??voided;
      const to=ended?new Date(ended.settledAt):new Date(Math.max(event.getTime()+deliveryCloses,from.getTime()+hour/4));
      bars.push({id:'catering-held',resourceId:'catering',name:`${money(authorized.amountMinor)} authorized, held`,startDate:from,endDate:to,eventColor:'orange',
        detail:['Authorized, not taken, until a signed delivery receipt',`PayPal guarantees the funds until ${DateHelper.format(new Date(from.getTime()+honorPeriod),'ddd MM/DD HH:mm')} (shaded) and keeps the authorization until ${DateHelper.format(new Date(from.getTime()+authorizationLife),'ddd MM/DD')}`,...proof(authorized)]});
      // The honor periods shade the row without stretching the axis: funds are guaranteed only inside them.
      ranges.push({id:'honor-1',resourceId:'catering',startDate:from,endDate:new Date(from.getTime()+honorPeriod),cls:'honor-period'});
      if(renewed) {
        const at=new Date(renewed.settledAt);
        bars.push({id:'catering-renewed',resourceId:'catering',name:'Hold renewed',startDate:at,endDate:at,eventColor:'indigo',detail:['SwarmPay reauthorized the hold: a new authorization with a fresh 3-day honor period covers the delivery. No money moved.',`Funds guaranteed until ${DateHelper.format(new Date(at.getTime()+honorPeriod),'ddd MM/DD HH:mm')} (shaded)`,...proof(renewed)]});
        ranges.push({id:'honor-2',resourceId:'catering',startDate:at,endDate:new Date(at.getTime()+honorPeriod),cls:'honor-period'});
      } else if(!ended&&event.getTime()-from.getTime()>honorPeriod) {
        // The delivery falls after the honor period, so SwarmPay will renew the hold once it is over and the event is within 3 days.
        const at=new Date(Math.max(from.getTime()+honorPeriod,event.getTime()-honorPeriod));
        bars.push({id:'catering-renewal',resourceId:'catering',name:'Renews the hold',startDate:at,endDate:at,eventColor:'gray',cls:'planned',detail:['Planned: the delivery is after PayPal’s 3-day honor period, so SwarmPay reauthorizes the hold here, then pays the caterer from the fresh authorization']});
      }
      if(voided)bars.push({id:'catering-voided',resourceId:'catering',name:'Hold released',startDate:new Date(voided.settledAt),endDate:new Date(voided.settledAt),eventColor:'purple',detail:['The authorization was voided; no catering payment was taken',...proof(voided)]});
    }
    if(cateringPaid)bars.push({id:'catering-paid',resourceId:'catering',name:`Paid ${money(cateringPaid.amountMinor)} after delivery`,startDate:new Date(cateringPaid.settledAt),endDate:new Date(cateringPaid.settledAt),eventColor:'green',detail:['Captured after the venue’s signed receipt',...proof(cateringPaid)]});
    for(const asked of entries.filter(e=>e.requestedBy==='AGENT'))
      bars.push({id:`agent-${asked.id}`,resourceId:'catering',name:'Agent asked early · held',startDate:new Date(asked.at),endDate:new Date(asked.at),eventColor:'red',detail:['AgentSafe held the request; no delivery receipt yet',...(asked.dossierId?[`Dossier ${asked.dossierId}`]:[])]});
    const times=[created,now,...bars.map(b=>b.startDate),new Date(event.getTime()+deliveryCloses)].map(t=>t.getTime());
    // Lead-in in proportion to the span, so the first payment sits clear of the names; labels run to the right of their time.
    const first=Math.min(...times),last=Math.max(...times),pad=Math.max(hour/2,(last-first)*0.12);
    // Room after the last time for its label, which runs to the right: about 9em at the scale the frame allows.
    const perPx=(last-first+pad)/Math.max(1,fit.width-nameWidth-9*fit.em);
    const startDate=new Date(first-pad),endDate=new Date(last+Math.max(hour/4,(last-first)*0.05,9*fit.em*perPx));
    const span=(endDate.getTime()-startDate.getTime())/hour;
    // Hour ticks just wide enough for their labels, so a phone counts every few hours instead of running them together,
    // and a day that only begins at the edge of the axis goes unnamed rather than cut off.
    const px=fit.width-nameWidth,step=[1,2,3,4,6,12].find(n=>n*px/span>=3.5*fit.em)??12;
    const dayLabel=(start:Date,end:Date,_:unknown,__:number,axis:{startDate:Date;endDate:Date})=>
      (Math.min(+end,+axis.endDate)-Math.max(+start,+axis.startDate))/(+axis.endDate-+axis.startDate)*px<6*fit.em?'':DateHelper.format(start,'ddd MM/DD');
    const hours={base:'hourAndDay',headers:[{unit:'day',renderer:dayLabel},{unit:'hour',increment:step,dateFormat:'LST'}]};
    // Longer plans, now that catering can be booked weeks ahead: a day per tick, or every few days, so labels never collide.
    const daySpan=span/24,dayStep=[1,2,3,7].find(n=>n*px/daySpan>=4.5*fit.em)??7;
    const days={base:'dayAndWeek',headers:[{unit:'month',dateFormat:'MMM YYYY'},{unit:'day',increment:dayStep,dateFormat:'ddd D'}]};
    return {resources,bars,startDate,endDate,viewPreset:span<=16?hours:days,
      ranges,timeRanges:[{id:'delivery',name:'Venue can confirm delivery',startDate:new Date(event.getTime()-deliveryOpens),endDate:new Date(event.getTime()+deliveryCloses),cls:'delivery-window'}]};
  },[plan,orders,entries,fit.width,fit.em,nameWidth]);
  return <section className="card schedule-card" aria-labelledby="schedule-title">
    <div className="card-head"><h2 id="schedule-title">When each merchant is paid</h2><span>Recorded times · shaded: delivery window and PayPal’s honor period · line: now</span></div>
    <div className="schedule-frame" ref={frame}>
      {fit.width>0&&<BryntumScheduler readOnly forceFit autoHeight rowHeight={56} barMargin={12} milestoneLayoutMode="measure" milestoneAlign="start"
        startDate={view.startDate} endDate={view.endDate} viewPreset={view.viewPreset}
        columns={[{text:'',field:'name',width:nameWidth,renderer:({record}:{record:{getData:(f:string)=>string}})=>({children:[{tag:'strong',text:record.getData('name')},{tag:'small',text:record.getData('role')}]})}]}
        resources={view.resources} events={view.bars} timeRanges={view.timeRanges} resourceTimeRanges={view.ranges}
        resourceTimeRangesFeature
        // A bar too short for its label shows none rather than a clipped letter; its tooltip still names it.
        eventRenderer={({eventRecord,renderData}:{eventRecord:{name:string;isMilestone:boolean};renderData:{width:number}})=>({text:eventRecord.isMilestone||renderData.width>=(eventRecord.name.length/2+1)*fit.em?eventRecord.name:''})}
        // The axis labels stay readable: ranges shade the header without a label of their own, and name themselves on hover.
        timeRangesFeature={{showCurrentTimeLine:true,showHeaderElements:true,headerRenderer:()=>'',tooltipTemplate:({timeRange}:{timeRange:{name:string}})=>escape(timeRange.name)}}
        eventTooltipFeature={{template:({eventRecord}:{eventRecord:{getData:(f:string)=>unknown}})=>`<strong>${escape(String(eventRecord.getData('name')))}</strong>${((eventRecord.getData('detail') as string[]|undefined)??[]).map(line=>`<br>${escape(line)}`).join('')}`}}/>}
    </div>
  </section>;
}
