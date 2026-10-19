import {useEffect,useRef} from 'react';
/** On open, moves focus into a dialog; Escape closes; Tab stays inside; restores focus. */
export function useDialogFocus(open,onClose){
 const dialogRef=useRef(null);
 const closer=useRef(onClose);closer.current=onClose;
 useEffect(()=>{
  if(!open)return;
  const before=document.activeElement,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const dialog=dialogRef.current;
  const selector='button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
  (dialog?.querySelector(selector)||dialog)?.focus?.();
  const key=e=>{
   if(e.key==='Escape'){e.preventDefault();closer.current?.();return;}
   if(e.key!=='Tab'||!dialog)return;
   const focusables=[...dialog.querySelectorAll(selector)].filter(el=>el.getClientRects().length);
   if(!focusables.length){e.preventDefault();dialog.focus();return;}
   const first=focusables[0],last=focusables.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;before?.focus?.();};
 },[open]);
 return dialogRef;
}
