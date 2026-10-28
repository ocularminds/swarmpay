/** Money, times and payment steps in the words the organizer sees, shared by every view. */
export const money=(c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:c%100?2:0}).format(c/100);
export const datetime=(value:string,timeZone?:string)=>new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone}).format(new Date(value));
/** How the payment boundary answered a request. */
export const boundaryLabel=(state:string)=>state==='SUCCEEDED'?'Allowed':['ESCALATE','HELD'].includes(state)?'Held by AgentSafe':['BLOCK','BLOCKED'].includes(state)?'Blocked by AgentSafe':state.replaceAll('_',' ').toLowerCase();
export const operationLabels:Record<string,string>={CREATE_ORDER:'Open checkout',CAPTURE_ORDER:'Take payment',AUTHORIZE_ORDER:'Authorize payment',CAPTURE_AUTHORIZATION:'Pay after delivery',VOID_AUTHORIZATION:'Cancel authorization'};
export const requesterLabels:Record<string,string>={ORGANIZER:'You',AGENT:'Agent',SWARMPAY:'SwarmPay, after delivery'};
