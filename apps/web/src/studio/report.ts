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
  panels:{filters:{collapsed:true}},
  pages:[{
    id:'overview',
    widgets:{
      paid:kpi('Paid to merchants','payments.paid'),
      held:kpi('Held until delivery','plans.held'),
      refunded:kpi('Refunded','payments.refunded'),
      stopped:kpi('Agent requests stopped','payments.heldRequest'),
      guardrail:{type:'budget-guardrail',dataMapping:{plan:[{id:'plans.plan'}],budget:[sum('plans.budget')],committed:[sum('plans.committed')],paid:[sum('plans.paid')],held:[sum('plans.held')]},
        format:{...title('Each plan against its budget')}},
      byMerchant:{type:'donut-chart',dataMapping:{categoryKey:[{id:'payments.merchant'}],valueKey:[sum('payments.paid')]},
        format:{...title('Paid by merchant'),style:{custom:{pieDataLabel:{enabled:true},totalLabel:{enabled:true}}}}},
      decisions:{type:'agentsafe-decisions',dataMapping:{when:[{id:'payments.when'}],plan:[{id:'payments.plan'}],merchant:[{id:'payments.merchant'}],step:[{id:'payments.step'}],
        askedBy:[{id:'payments.askedBy'}],decision:[{id:'payments.decision'}],dossier:[{id:'payments.dossier'}]},format:{...title('What AgentSafe stopped')}},
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
