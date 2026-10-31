import {useEffect,useMemo,useRef,useState} from 'react';
import {AgStudioAiModule} from 'ag-studio';
import {AgStudio,AgStudioProvider} from 'ag-studio-react';
import {api,csrfHeaders} from './api';
import {buildAi} from './studio/ai';
import {dashboardRows,studioData} from './studio/data';
import {spendReport} from './studio/report';
import {swarmPayStudioTheme} from './studio/theme';
import {swarmPayWidgets} from './studio/widgets';
import type {Config,LedgerEntry,Plan} from './types';

/**
 * The organizer's spend dashboard, on AG Studio: what was paid, what is held until delivery, what AgentSafe
 * stopped, and each plan against its budget. Organizers can rearrange it, and with Azure OpenAI configured,
 * ask Studio's agents and SwarmPay's AgentSafe analyst about it.
 */
export default function SpendDashboard({config}:{config:Config}) {
  const [entries,setEntries]=useState<LedgerEntry[]>();const [mode,setMode]=useState<'view'|'edit'>('view');const [plans,setPlans]=useState<Plan[]>([]);const [error,setError]=useState('');
  useEffect(()=>{Promise.all([api<LedgerEntry[]>('/api/ledger'),api<Plan[]>('/api/plans')]).then(([l,p])=>{setEntries(l);setPlans(p);}).catch(e=>setError(e.message));},[]);
  const latest=useRef<LedgerEntry[]>([]);latest.current=entries??[];
  const data=useMemo(()=>entries&&studioData(dashboardRows(entries,plans)),[entries,plans]);
  // Built once: Studio reads its AI setup when it is created, and the analyst reads the ledger as it is now.
  const ai=useMemo(()=>config.dashboardAgent?buildAi(csrfHeaders,()=>latest.current):undefined,[config.dashboardAgent]);
  if(error)return <p className="message error">{error}</p>;
  if(!data)return <p className="quiet-note">Loading your dashboard…</p>;
  if(!entries!.length)return <p className="quiet-note">Your dashboard fills in once you pay a merchant.</p>;
  // Studio's chat panel lives in edit mode, beside the panels for rearranging widgets and their data.
  return <><div className="dashboard-bar"><p>{mode==='view'?'Paid, held and stopped at a glance. Filters apply to every widget.':config.dashboardAgent?'Ask the agents in the AI panel, or rearrange widgets. Changes last for this visit.':'Rearrange widgets and their data. Changes last for this visit.'}</p>
    <button className="button button-white" aria-pressed={mode==='edit'} onClick={()=>setMode(mode==='view'?'edit':'view')}>{mode==='edit'?'Done':config.dashboardAgent?'Ask the agents':'Customize'}</button></div>
  <div className="spend-dashboard" aria-label="Spend dashboard">
    <AgStudioProvider licenseKey={config.agStudioLicenseKey||undefined} modules={ai?[AgStudioAiModule]:undefined}>
      <AgStudio style={{height:'100%',width:'100%'}} theme={swarmPayStudioTheme} widgets={swarmPayWidgets as never} data={data} ai={ai}
        initialState={spendReport} mode={mode} layout={{widgetBorderEnabled:true}}/>
    </AgStudioProvider>
  </div>
  {!config.dashboardAgent&&<p className="quiet-note">The dashboard’s agents answer when Azure OpenAI is configured; this demo uses simulated agents.</p>}</>;
}
