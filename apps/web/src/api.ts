import type {Session} from './types';
let csrf={token:'',header:'X-CSRF-TOKEN'};
export async function api<T>(path:string,method='GET',data?:unknown):Promise<T> {
  const form=data instanceof FormData;
  const headers:Record<string,string>={};
  if(method!=='GET') headers[csrf.header]=csrf.token;
  if(data && !form) headers['Content-Type']='application/json';
  const response=await fetch(path,{method,headers,credentials:'same-origin',body:data?(form?data:JSON.stringify(data)):undefined});
  if(!response.ok) {
    const body=await response.json().catch(()=>null);
    throw new Error(body?.message ?? (response.status===401?'Your session has ended. Refresh and sign in again.':response.status===403?'This action needs a valid organizer session. Refresh and try again.':`Request could not finish (${response.status}).`));
  }
  return response.status===204?undefined as T:response.json();
}
export async function session():Promise<Session> {
  const s=await api<Session>('/api/session'); csrf={token:s.csrfToken,header:s.csrfHeader}; return s;
}
export async function login(username:string,password:string):Promise<void> {
  const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',[csrf.header]:csrf.token},body:new URLSearchParams({username,password})});
  if(!r.ok) throw new Error('The organizer credentials were not accepted.');
}
export function download(filename:string,value:unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const link=document.createElement('a'); link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
