import {useEffect,useMemo,useRef,useState} from 'react';
import {AgStudioAiModule,type AgStudioApi} from 'ag-studio';
import {AgStudio,AgStudioProvider} from 'ag-studio-react';
import {api,csrfHeaders} from './api';
import {buildAi} from './studio/ai';
import {dashboardRows,studioData} from './studio/data';
import {compactReport,restoreWideReport,spendReport} from './studio/report';
import {swarmPayStudioTheme} from './studio/theme';
import {swarmPayWidgets} from './studio/widgets';
import type {Config,LedgerEntry,PlanBalance} from './types';

/**
 * The organizer's spend dashboard, on AG Studio: what was paid, what is held until delivery, what AgentSafe
 * stopped, and each plan against its budget. Organizers can rearrange it, and with Azure OpenAI configured,
 * ask Studio's agents and SwarmPay's AgentSafe analyst about it.
 */
export default function SpendDashboard({config}:{config:Config}) {
  const [entries,setEntries]=useState<LedgerEntry[]>();const [mode,setMode]=useState<'view'|'edit'>('view');const [plans,setPlans]=useState<PlanBalance[]>([]);const [error,setError]=useState('');
  const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:740px)').matches);
  const compactRef=useRef(compact),studio=useRef<AgStudioApi<any>>(undefined),wideReport=useRef(spendReport);
  useEffect(()=>{
    const media=window.matchMedia('(max-width:740px)');
    const resize=()=>{
      if(media.matches===compactRef.current)return;
      if(studio.current) {
        const current=studio.current.getState();
        if(media.matches){wideReport.current=current;studio.current.setState(compactReport(current));}
        else studio.current.setState(restoreWideReport(current,wideReport.current));
      }
      compactRef.current=media.matches;setCompact(media.matches);
    };
    media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);
  },[]);
  useEffect(()=>{Promise.all([api<LedgerEntry[]>('/api/ledger'),api<PlanBalance[]>('/api/balances')]).then(([l,p])=>{setEntries(l);setPlans(p);}).catch(e=>setError(e.message));},[]);
  const latest=useRef<LedgerEntry[]>([]);latest.current=entries??[];
  const data=useMemo(()=>entries&&studioData(dashboardRows(entries,plans)),[entries,plans]);
  // Built once: Studio reads its AI setup when it is created, and the analyst reads the ledger as it is now.
  const ai=useMemo(()=>config.dashboardAgent?buildAi(csrfHeaders,()=>latest.current):undefined,[config.dashboardAgent]);
  if(error)return <p className="message error" role="alert">{error}</p>;
  if(!data)return <p className="quiet-note" role="status">Loading your dashboard…</p>;
  if(!entries!.length&&!plans.length)return <p className="quiet-note">Your dashboard fills in once you approve a plan.</p>;
  // Studio's chat panel lives in edit mode, beside the panels for rearranging widgets and their data.
  return <><div className="dashboard-bar"><p>{mode==='view'?'Paid, held and stopped at a glance. Filters apply to every widget.':config.dashboardAgent?'Ask the agents in the AI panel, or rearrange widgets. Changes last for this visit.':'Rearrange widgets and their data. Changes last for this visit.'}</p>
    <button className="button button-white" aria-pressed={mode==='edit'} onClick={()=>setMode(mode==='view'?'edit':'view')}>{mode==='edit'?'Done':config.dashboardAgent?'Ask the agents':'Customize'}</button></div>
  <div className={`spend-dashboard${compact?' spend-dashboard-compact':''}${mode==='edit'?' spend-dashboard-edit':''}`} aria-label="Spend dashboard">
    <AgStudioProvider licenseKey={config.agStudioLicenseKey||undefined} modules={ai?[AgStudioAiModule]:undefined}>
      <AgStudio style={{height:'100%',width:'100%'}} theme={swarmPayStudioTheme} widgets={swarmPayWidgets as never} data={data} ai={ai}
        initialState={compact?compactReport(spendReport):spendReport} mode={mode} layout={{widgetBorderEnabled:true,minWidth:0}}
        onApiReady={event=>{studio.current=event.api;}} onStudioPreDestroyed={()=>{studio.current=undefined;}}/>
    </AgStudioProvider>
  </div>
  <p className="quiet-note">Balances cover every approved plan. Decision counts, charts and payment rows cover the recent 500 commands and 500 agent requests.</p>
  {!config.dashboardAgent&&<p className="quiet-note">The dashboard’s agents answer when Azure OpenAI is configured; this demo uses simulated agents.</p>}</>;
}
