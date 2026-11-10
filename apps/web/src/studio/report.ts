// The spend dashboard's opening report: what was paid, what is held until delivery, what AgentSafe stopped,
// and each plan against its budget. Field ids refer to the sources in ./data.ts; layout is in 24 tracks.
import type {AgReportState,AgWidgetLayoutState} from 'ag-studio';

const at=(xTrack:number,yTrack:number,xSpan:number,ySpan:number):AgWidgetLayoutState=>({xTrack,yTrack,xSpan,ySpan});
const title=(text:string)=>({title:{enabled:true,text}});
const sum=(id:string)=>({id,aggregation:'sum' as const});
const kpi=(text:string,id:string)=>({type:'value' as const,dataMapping:{value:[sum(id)]},format:{...title(text)}});

export const spendReport:AgReportState<any>={
  selectedPageId:'overview',
  // The dashboard opens to its widgets; the filters panel stays one click away.
  panels:{filters:{collapsed:true},edit:{collapsed:true},data:{collapsed:true},ai:{width:420}},
  pages:[{
    id:'overview',
    widgets:{
      paid:kpi('Paid to merchants','plans.paid'),
      held:kpi('Held until delivery','plans.held'),
      refunded:kpi('Refunded','plans.refunded'),
      stopped:kpi('Agent requests stopped','payments.heldRequest'),
      guardrail:{type:'budget-guardrail',dataMapping:{id:[{id:'plans.id'}],plan:[{id:'plans.plan'}],budget:[sum('plans.budget')],committed:[sum('plans.committed')],paid:[sum('plans.paid')],held:[sum('plans.held')]},
        format:{...title('Each plan against its budget')}},
      byMerchant:{type:'donut-chart',dataMapping:{categoryKey:[{id:'payments.merchant'}],valueKey:[sum('payments.paid')]},
        format:{...title('Paid by merchant'),style:{custom:{pieDataLabel:{enabled:true},totalLabel:{enabled:true}}}}},
      decisions:{type:'agentsafe-decisions',dataMapping:{id:[{id:'payments.id'}],when:[{id:'payments.when'}],plan:[{id:'payments.plan'}],merchant:[{id:'payments.merchant'}],step:[{id:'payments.step'}],
        askedBy:[{id:'payments.askedBy'}],decision:[{id:'payments.decision'}],outcome:[{id:'payments.outcome'}],dossier:[{id:'payments.dossier'}]},format:{...title('What AgentSafe stopped')}},
      byDay:{type:'column-chart-stacked',dataMapping:{categoryKey:[{id:'payments.when'}],valueKey:[sum('payments.paid')],legendKey:[{id:'payments.merchant'}]},
        format:{...title('Paid by day and merchant'),style:{theme:{common:{legend:{enabled:true}}}}}},
      payments:{type:'grid',dataMapping:{cols:[{id:'payments.when'},{id:'payments.plan'},{id:'payments.merchant'},{id:'payments.step'},{id:'payments.askedBy'},
        {id:'payments.decision'},{id:'payments.amount'},sum('payments.paid'),{id:'payments.reference'}]},sort:[{field:{id:'payments.when'},direction:'desc'}],format:{...title('Every payment step')}},
    },
    widgetLayout:{
      paid:at(0,0,6,6),held:at(6,0,6,6),refunded:at(12,0,6,6),stopped:at(18,0,6,6),
      guardrail:at(0,6,15,14),byMerchant:at(15,6,9,14),
      decisions:at(0,20,10,16),byDay:at(10,20,14,16),
      payments:at(0,36,24,18),
    },
  }],
} as never;

/** Reflow real widgets vertically on a phone while preserving their data, filters and configuration. */
export function compactReport(report:AgReportState<any>):AgReportState<any> {
  return {...report,panels:{...report.panels,ai:{...report.panels?.ai,width:300}},pages:report.pages?.map(page=>{
    let row=0;
    const ids=Object.keys(page.widgets??{}).sort((a,b)=>{
      const left=page.widgetLayout?.[a],right=page.widgetLayout?.[b];
      return (left?.yTrack??0)-(right?.yTrack??0)||(left?.xTrack??0)-(right?.xTrack??0);
    });
    const widgetLayout=Object.fromEntries(ids.map(id=>{
      const widget=page.widgets?.[id],type=widget&&'type' in widget?widget.type:undefined;
      const height=type==='value'?7:type==='grid'?24:type==='agentsafe-decisions'?22:20;
      const position=at(0,row,24,height);row+=height;return [id,position];
    }));
    return {...page,layout:{...page.layout,minWidth:0,pagePadding:8,rowHeight:16},widgetLayout};
  })};
}

/** Restore only geometry; keep edits and newly added widgets from the current report. */
export function restoreWideReport(current:AgReportState<any>,wide:AgReportState<any>):AgReportState<any> {
  return {...current,panels:{...current.panels,ai:{...current.panels?.ai,width:420}},pages:current.pages?.map(page=>{
    const previous=wide.pages?.find(p=>p.id===page.id);
    return {...page,layout:previous?.layout??{minWidth:0},widgetLayout:Object.fromEntries(Object.keys(page.widgets??{}).map(id=>
      [id,previous?.widgetLayout?.[id]??page.widgetLayout?.[id]]))};
  })};
}
