import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {api,session} from './api';
import type {Offer} from './types';
import './styles.css';
function App() {
  const [offers,setOffers]=useState<Offer[]>([]);const [error,setError]=useState('');
  async function explore(){try{await session();await api('/api/demo-session','POST');await session();setOffers(await api<Offer[]>('/api/catalog'));}catch(e){setError(e instanceof Error?e.message:'Could not load catalog');}}
  return <main><p>SWARMPAY · FOUNDATION</p><h1>Give agents a budget.</h1><p>This phase provides authenticated catalog discovery and an isolated Java execution shell. Payment and planning workflows arrive in the next phases.</p><button onClick={()=>void explore()}>Explore the demo catalog</button>{error&&<p role="alert">{error}</p>}<ul>{offers.map(offer=><li key={offer.id}><strong>{offer.merchantName}</strong><p>{offer.title} · ${(offer.unitMinor/100).toFixed(2)}</p></li>)}</ul><p>Curated fixture prices. No payment or live model call is made here.</p></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
