import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AgGridReact} from 'ag-grid-react';
import {AllCommunityModule,ModuleRegistry,themeQuartz,type ColDef,type GridApi,type ICellRendererParams} from 'ag-grid-community';
import {ArrowDownToLine,LoaderCircle,Search} from 'lucide-react';
import {api} from './api';
import {boundaryLabel,datetime,money,operationLabels,requesterLabels} from './labels';
import type {LedgerEntry} from './types';

ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#11695b',fontFamily:"'DM Sans', sans-serif",fontSize:14,foregroundColor:'#1a3430',
  borderColor:'#e4eae7',headerBackgroundColor:'#f7f9f8',headerFontWeight:650,rowHoverColor:'#f3f8f5',wrapperBorderRadius:14,spacing:7});
const paid=(e:LedgerEntry)=>e.state==='SUCCEEDED'&&['CAPTURE_ORDER','CAPTURE_AUTHORIZATION'].includes(e.operation);
type Row=LedgerEntry|{total:true;amountMinor:number;count:number};
const tone=(state:string)=>state==='SUCCEEDED'?'good':['ESCALATE','HELD'].includes(state)?'waiting':['BLOCK','BLOCKED','NOT_EXECUTED','AUTHORITY_UNAVAILABLE'].includes(state)?'bad':'neutral';

function Decision({data}:ICellRendererParams<Row>) {
  if(!data||'total' in data)return null;
  return <span className={`chip chip-${tone(data.state)}`}>{boundaryLabel(data.state)}</span>;
}

/** Every payment across the organizer's plans, filterable, with what was actually paid totalled for the rows shown. */
export default function Ledger() {
  const [rows,setRows]=useState<LedgerEntry[]>();const [error,setError]=useState('');const [search,setSearch]=useState('');
  const [total,setTotal]=useState({amountMinor:0,count:0});const grid=useRef<GridApi<Row>>(null);
  useEffect(()=>{api<LedgerEntry[]>('/api/ledger').then(setRows).catch(e=>setError(e.message));},[]);
  const columns=useMemo<ColDef<Row>[]>(()=>[
    {headerName:'When',field:'at',sort:'desc',filter:'agDateColumnFilter',minWidth:150,valueFormatter:p=>p.data&&'total' in p.data?'Paid to merchants':p.value?datetime(p.value):'',
      filterParams:{comparator:(day:Date,value:string)=>{const d=new Date(value);d.setHours(0,0,0,0);return d<day?-1:d>day?1:0;}}},
    {headerName:'Plan',field:'venue',filter:true,minWidth:170},
    {headerName:'Merchant',field:'merchantName',filter:true,minWidth:160},
    {headerName:'Step',field:'operation',filter:true,minWidth:160,valueFormatter:p=>p.value?operationLabels[p.value]??p.value:''},
    {headerName:'Asked by',field:'requestedBy',filter:true,minWidth:150,valueFormatter:p=>p.value?requesterLabels[p.value]??p.value:''},
    {headerName:'Amount',field:'amountMinor',filter:'agNumberColumnFilter',type:'rightAligned',minWidth:120,
      valueFormatter:p=>p.value==null?'':p.data&&'total' in p.data?`${money(p.value)} · ${p.data.count} ${p.data.count===1?'payment':'payments'}`:money(p.value)},
    {headerName:'AgentSafe',field:'state',filter:true,minWidth:170,cellRenderer:Decision},
    {headerName:'PayPal reference',minWidth:190,filter:true,valueGetter:p=>p.data&&!('total' in p.data)?p.data.captureId??p.data.authorizationId??p.data.providerOrderId??'':''},
    {headerName:'Dossier',field:'dossierId',filter:true,minWidth:200},
    {headerName:'Details',field:'message',filter:true,minWidth:260,tooltipField:'message'},
  ],[]);
  // The pinned total follows the filter, so it always answers "how much was paid for what I'm looking at".
  const recount=useCallback(()=>{let amountMinor=0,count=0;grid.current?.forEachNodeAfterFilter(n=>{if(n.data&&!('total' in n.data)&&paid(n.data)){amountMinor+=n.data.amountMinor;count++;}});setTotal({amountMinor,count});},[]);
  if(error)return <div className="message error" role="alert">{error}</div>;
  if(!rows)return <div className="loading"><LoaderCircle className="spin"/>Loading your payments…</div>;
  return <section className="card ledger-card" aria-labelledby="ledger-title">
    <div className="ledger-tools">
      <label className="ledger-search"><Search size={16}/><input aria-label="Search payments" placeholder="Search merchant, plan, PayPal reference…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <button className="button button-white" disabled={!rows.length} onClick={()=>grid.current?.exportDataAsCsv({fileName:'swarmpay-payments.csv',skipPinnedBottom:true})}><ArrowDownToLine size={16}/>Export CSV</button>
    </div>
    <h2 id="ledger-title" className="visually-hidden">Payments</h2>
    {rows.length===0?<p className="quiet-note">No payments yet. Approve a plan and pay a merchant to see it here.</p>
      :<div className="ledger-grid"><AgGridReact<Row> theme={theme} rowData={rows} columnDefs={columns} quickFilterText={search}
        defaultColDef={{sortable:true,resizable:true,flex:1}} pinnedBottomRowData={[{total:true,...total}]} getRowId={p=>'total' in p.data?'total':p.data.id}
        onGridReady={e=>{grid.current=e.api;recount();}} onFilterChanged={recount} onRowDataUpdated={recount} tooltipShowDelay={300}
        rowClassRules={{'ledger-agent':p=>!!p.data&&!('total' in p.data)&&p.data.requestedBy==='AGENT'}}/></div>}
  </section>;
}
