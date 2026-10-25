import {useEffect,useRef,useState} from 'react';
import {api} from './api';
import type {GateResult,Order} from './types';
type PayPal={Buttons:(options:Record<string,unknown>)=>{render:(el:HTMLElement)=>Promise<void>;close:()=>Promise<void>}};
const pending=new Map<string,Promise<PayPal>>();
function load(clientId:string,intent:string,merchant:string):Promise<PayPal> {
  const key=clientId+intent;
  if(pending.has(key)) return pending.get(key)!;
  const namespace=`paypal_${merchant}_${intent}`;
  const promise=new Promise<PayPal>((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=${intent}&components=buttons`;
    script.setAttribute('data-namespace',namespace);
    script.onload=()=>resolve((window as unknown as Record<string,PayPal>)[namespace]);
    script.onerror=()=>{pending.delete(key);reject(new Error('PayPal checkout could not load.'));};
    document.head.appendChild(script);
  }); pending.set(key,promise); return promise;
}
export function PayPalCheckout({planId,order,clientId,onDone,onError}:{planId:string;order:Order;clientId:string;onDone:()=>void;onError:(s:string)=>void}) {
  const target=useRef<HTMLDivElement>(null); const [loading,setLoading]=useState(true);
  const done=useRef(onDone);done.current=onDone;const error=useRef(onError);error.current=onError;
  useEffect(()=>{
    let active=true;let buttons:ReturnType<PayPal['Buttons']>|undefined;
    load(clientId,order.paymentIntent.toLowerCase(),order.merchantId).then(paypal=>{
      if(!active || !target.current) return;
      buttons=paypal.Buttons({style:{layout:'vertical',color:'gold',shape:'rect',label:'paypal',height:42},
        createOrder:async()=>{
          const result=await api<GateResult>(`/api/plans/${planId}/orders/${order.id}/checkout`,'POST');
          if(!result.result?.providerOrderId || result.execution!=='FORWARDED') throw new Error(result.message);
          return result.result.providerOrderId;
        },
        onApprove:async(data:{orderID:string})=>{
          const result=await api<GateResult>(`/api/plans/${planId}/orders/${order.id}/buyer-approved`,'POST',{providerOrderId:data.orderID});
          done.current(); if(result.state!=='SUCCEEDED') error.current(result.message);
        },
        onCancel:()=>error.current('PayPal approval was cancelled. No new payment is confirmed.'),
        onError:()=>{error.current('PayPal checkout did not finish. Check the payment status before trying again.');done.current();},
      });return buttons.render(target.current);
    }).then(()=>{if(active)setLoading(false);}).catch(e=>{if(active){setLoading(false);error.current(e.message);}});
    return()=>{active=false;void buttons?.close();};
  },[planId,order.id,order.merchantId,order.paymentIntent,clientId]);
  return <div className="paypal-container">{loading&&<small>Loading PayPal secure checkout…</small>}<div ref={target}/></div>;
}
