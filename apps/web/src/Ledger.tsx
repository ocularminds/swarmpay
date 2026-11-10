import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AgGridReact} from 'ag-grid-react';
import {AllCommunityModule,ModuleRegistry,themeQuartz,type ColDef,type GridApi,type ICellRendererParams} from 'ag-grid-community';
import {ArrowDownToLine,LoaderCircle,Search} from 'lucide-react';
import {api} from './api';
import {datetime,money,operationLabels,requesterLabels} from './labels';
import {BoundaryBadge} from './StatusBadge';
import {paidSign} from './payment-state';
import tokens from './brand-tokens.json';
import type {LedgerEntry} from './types';

ModuleRegistry.registerModules([AllCommunityModule]);
const colors=tokens.colors;
const theme=themeQuartz.withParams({accentColor:colors.evergreen,fontFamily:"'DM Sans', sans-serif",fontSize:14,foregroundColor:colors.ink,
  borderColor:colors.line,headerBackgroundColor:colors.cloud,headerFontWeight:700,rowHoverColor:colors.successBg,wrapperBorderRadius:tokens.radii.control,spacing:8,rowHeight:52});
// A completed capture counts once; a refund takes its payment back out.
type Total={total:true;amountMinor:number;count:number};
type Row=LedgerEntry|Total;
const isTotal=(row?:Row):row is Total=>!!row&&'total' in row;

function Decision({data}:ICellRendererParams<Row>) {
  if(!data||isTotal(data))return null;
  return <BoundaryBadge state={data.state}/>;
}

/** Every payment across the organizer's plans, filterable, with what was actually paid totalled for the rows shown. */
export default function Ledger() {
  const [rows,setRows]=useState<LedgerEntry[]>();const [error,setError]=useState('');const [search,setSearch]=useState('');
  const [total,setTotal]=useState({amountMinor:0,count:0});const grid=useRef<GridApi<Row>>(null);
  useEffect(()=>{api<LedgerEntry[]>('/api/ledger').then(setRows).catch(e=>setError(e.message));},[]);
  // On the total row the label spans into Plan and the total into Amount, cells that are empty there, so neither is cut short.
  const columns=useMemo<ColDef<Row>[]>(()=>[
    {headerName:'When',field:'at',sort:'desc',filter:'agDateColumnFilter',minWidth:150,colSpan:p=>isTotal(p.data)?2:1,valueFormatter:p=>isTotal(p.data)?'Paid to merchants':p.value?datetime(p.value):'',
      filterParams:{comparator:(day:Date,value:string)=>{const d=new Date(value);d.setHours(0,0,0,0);return d<day?-1:d>day?1:0;}}},
    {headerName:'Plan',field:'venue',filter:true,minWidth:170},
    {headerName:'Merchant',field:'merchantName',filter:true,minWidth:160},
    {headerName:'Step',field:'operation',filter:true,minWidth:160,valueFormatter:p=>p.value?operationLabels[p.value]??p.value:''},
    {headerName:'Asked by',field:'requestedBy',filter:true,minWidth:150,colSpan:p=>isTotal(p.data)?2:1,cellClassRules:{'ag-right-aligned-cell':p=>isTotal(p.data)},
      valueFormatter:p=>isTotal(p.data)?`${money(p.data.amountMinor)} · ${p.data.count} ${p.data.count===1?'payment':'payments'}`:p.value?requesterLabels[p.value]??p.value:''},
    {headerName:'Amount',field:'amountMinor',filter:'agNumberColumnFilter',type:'rightAligned',minWidth:120,valueFormatter:p=>p.value==null?'':money(p.value)},
    {headerName:'AgentSafe',field:'state',filter:true,minWidth:170,cellRenderer:Decision,cellClass:'ledger-decision'},
    {headerName:'Provider outcome',field:'providerStatus',filter:true,minWidth:175,valueFormatter:p=>p.value?p.value.toLowerCase().replaceAll('_',' '):'Not recorded'},
    {headerName:'PayPal reference',minWidth:190,filter:true,valueGetter:p=>p.data&&!isTotal(p.data)?p.data.refundId??p.data.captureId??p.data.authorizationId??p.data.providerOrderId??'':''},
    {headerName:'Dossier',field:'dossierId',filter:true,minWidth:200},
    {headerName:'Details',field:'message',filter:true,minWidth:260,tooltipField:'message'},
  ],[]);
  // The pinned total follows the filter, so it always answers "how much was paid for what I'm looking at".
  const recount=useCallback(()=>{let amountMinor=0,count=0;grid.current?.forEachNodeAfterFilter(n=>{if(n.data&&!isTotal(n.data)){const sign=paidSign(n.data);amountMinor+=sign*n.data.amountMinor;count+=sign;}});setTotal({amountMinor,count});},[]);
  if(error)return <div className="message error" role="alert">{error}</div>;
  if(!rows)return <div className="loading"><LoaderCircle className="spin"/>Loading your payments…</div>;
  return <section className="card ledger-card" aria-labelledby="ledger-title">
    <div className="ledger-tools">
      <label className="ledger-search"><Search size={16}/><input aria-label="Search payments" placeholder="Search merchant, plan, PayPal reference…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <button className="button button-white" disabled={!rows.length} onClick={()=>grid.current?.exportDataAsCsv({fileName:'swarmpay-payments.csv',skipPinnedBottom:true})}><ArrowDownToLine size={16}/>Export CSV</button>
    </div>
    <h2 id="ledger-title" className="visually-hidden">Payments</h2>
    <p className="quiet-note ledger-scope">Recent 500 payment commands and 500 agent requests. The total follows the rows shown; Overview balances include every approved plan.</p>
    {rows.length===0?<p className="quiet-note">No payments yet. Approve a plan and pay a merchant to see it here.</p>
      :<div className="ledger-grid"><AgGridReact<Row> theme={theme} rowData={rows} columnDefs={columns} quickFilterText={search}
        defaultColDef={{sortable:true,resizable:true,flex:1}} pinnedBottomRowData={[{total:true,...total}]} getRowId={p=>isTotal(p.data)?'total':p.data.id}
        onGridReady={e=>{grid.current=e.api;recount();}} onFilterChanged={recount} onRowDataUpdated={recount} tooltipShowDelay={300}
        rowClassRules={{'ledger-agent':p=>!!p.data&&!isTotal(p.data)&&p.data.requestedBy==='AGENT'}}/></div>}
  </section>;
}
