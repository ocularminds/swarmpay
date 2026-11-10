import {Ban,CheckCheck,Clock3,LockKeyhole,ShieldAlert,Undo2} from 'lucide-react';
import {boundaryLabel,boundaryTone} from './labels';

export type StatusTone='good'|'waiting'|'bad'|'pending'|'neutral'|'cancelled';
/** A label and a shape accompany every state; color is never the only signal. */
export function StatusBadge({label,tone='neutral',refunded=false}:{label:string;tone?:StatusTone;refunded?:boolean}) {
  const Icon=refunded?Undo2:tone==='good'?CheckCheck:tone==='waiting'?LockKeyhole:tone==='bad'?ShieldAlert:tone==='cancelled'?Ban:Clock3;
  return <span className={`chip chip-${tone}`}><Icon size={14} aria-hidden="true"/>{label}</span>;
}
export function BoundaryBadge({state}:{state:string}) {
  return <StatusBadge label={boundaryLabel(state)} tone={boundaryTone(state)}/>;
}
