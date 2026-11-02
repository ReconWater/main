import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ChevronDown,Mail,MessageCircle,Send,X} from 'lucide-react';
import './support-widget.css';

const API='/api/support';
const TOKEN_KEY='rw_support_session';
const READ_KEY='rw_support_last_read';

function sessionToken(){
  let token=localStorage.getItem(TOKEN_KEY)||'';
  if(!/^[A-Za-z0-9_-]{30,120}$/.test(token)){
    token=(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`).replace(/-/g,'')+Math.random().toString(36).slice(2,12);
    localStorage.setItem(TOKEN_KEY,token);
  }
  return token;
}
async function request(mode,body){
  const response=await fetch(`${API}?mode=${encodeURIComponent(mode)}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Support is temporarily unavailable.');
  return data;
}
const time=value=>new Date(value).toLocaleTimeString('en-CA',{hour:'numeric',minute:'2-digit'});

function tone(kind='incoming'){
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;
    const ctx=new AudioCtx(),osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.frequency.value=kind==='incoming'?720:520;gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.055,ctx.currentTime+.015);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.13);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.14);setTimeout(()=>ctx.close(),220);
  }catch{}
}

function isUiBlocked(){
  const selectors=['.rw-mobile-menu.open','.cart-drawer.open','.store-checkout-overlay','.scrim','.clinical-lightbox','[aria-modal="true"]'];
  return selectors.some(selector=>[...document.querySelectorAll(selector)].some(el=>!el.closest('.rw-support-widget')));
}

export default function SupportWidget(){
  const token=useMemo(()=>sessionToken(),[]);
  const [open,setOpen]=useState(false),[online,setOnline]=useState(false),[thread,setThread]=useState(null),[messages,setMessages]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[detailsOpen,setDetailsOpen]=useState(false),[email,setEmail]=useState(''),[orderReference,setOrderReference]=useState(''),[blocked,setBlocked]=useState(false);
  const scrollRef=useRef(null),lastMessageId=useRef(0),openedOnce=useRef(false);
  const lastRead=Number(localStorage.getItem(READ_KEY)||0);
  const unread=messages.filter(m=>m.sender==='admin'&&Number(m.id)>lastRead).length;

  const load=useCallback(async({quiet=false}={})=>{
    try{
      const data=await request('messages',{session_token:token});
      setOnline(Boolean(data.presence?.online));
      setThread(data.thread||null);
      if(data.thread){setEmail(v=>v||data.thread.email||'');setOrderReference(v=>v||data.thread.order_reference||'')}
      const next=data.messages||[],newest=Number(next.at(-1)?.id||0);
      if(lastMessageId.current&&newest>lastMessageId.current&&next.some(m=>m.sender==='admin'&&Number(m.id)>lastMessageId.current))tone('incoming');
      lastMessageId.current=newest;
      setMessages(next);
      if(open&&newest){localStorage.setItem(READ_KEY,String(newest))}
      if(!quiet)setError('');
    }catch(e){if(!quiet)setError(e.message)}
  },[token,open]);

  useEffect(()=>{
    const presence=()=>request('presence').then(data=>setOnline(Boolean(data.online))).catch(()=>setOnline(false));
    presence();const id=setInterval(presence,30000);return()=>clearInterval(id);
  },[]);
  useEffect(()=>{
    const observer=new MutationObserver(()=>setBlocked(isUiBlocked()));observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','aria-hidden'],childList:true});setBlocked(isUiBlocked());return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(open){openedOnce.current=true;load();const id=setInterval(()=>load({quiet:true}),4000);return()=>clearInterval(id)}
    if(thread||openedOnce.current){const id=setInterval(()=>load({quiet:true}),12000);return()=>clearInterval(id)}
  },[open,thread?.id,load]);
  useEffect(()=>{if(open&&scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight},[messages.length,open]);
  useEffect(()=>{if(open&&messages.length)localStorage.setItem(READ_KEY,String(messages.at(-1)?.id||0))},[open,messages]);

  const send=async e=>{
    e.preventDefault();const text=message.trim();if(!text||busy)return;
    setBusy(true);setError('');
    try{
      const data=await request('send',{session_token:token,message:text,email:email.trim(),order_reference:orderReference.trim()});
      setMessage('');setThread(data.thread);setOnline(Boolean(data.presence?.online));tone('outgoing');await load({quiet:true});
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };
  const saveDetails=async()=>{
    setBusy(true);setError('');try{const data=await request('details',{session_token:token,email:email.trim(),order_reference:orderReference.trim()});setThread(data.thread);setDetailsOpen(false)}catch(e){setError(e.message)}finally{setBusy(false)}
  };
  const toggle=()=>{if(blocked)return;setOpen(v=>!v)};
  if(blocked&&!open)return null;
  return <aside className={`rw-support-widget ${open?'is-open':''} ${blocked?'is-suspended':''}`} aria-label="Recon Water support">
    {!open&&<button className="rw-support-launcher" type="button" onClick={toggle} aria-label="Open live support"><span className="rw-support-launcher-icon"><MessageCircle size={21}/>{unread>0&&<b>{Math.min(9,unread)}</b>}</span><span><strong>Live Support</strong><small><i className={online?'online':'offline'}/>{online?'Online now':'Leave a message'}</small></span></button>}
    {open&&<section className="rw-support-panel" role="dialog" aria-modal="false" aria-label="Support conversation">
      <header className="rw-support-head"><div><span>RECON WATER</span><strong>Support</strong><small><i className={online?'online':'offline'}/>{online?'Online now — send a message':'Offline — leave us a message'}</small></div><button type="button" onClick={()=>setOpen(false)} aria-label="Close support"><X size={20}/></button></header>
      <div className="rw-support-thread" ref={scrollRef}>
        {!messages.length&&<div className="rw-support-welcome"><MessageCircle size={24}/><strong>How can we help?</strong><p>Send us a message. No account or ticket form is required.</p></div>}
        {messages.map(item=><div className={`rw-support-bubble ${item.sender==='admin'?'from-support':'from-visitor'}`} key={item.id}><div>{item.body}</div><small>{item.sender==='admin'?'Recon Water':'You'} · {time(item.created_at)}</small></div>)}
      </div>
      <div className="rw-support-details">
        <button type="button" className="rw-support-details-toggle" onClick={()=>setDetailsOpen(v=>!v)} aria-expanded={detailsOpen}><span><Mail size={15}/> Email / order reference <small>optional</small></span><ChevronDown size={16}/></button>
        {detailsOpen&&<div className="rw-support-details-fields"><label><span>Email</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label><span>Order reference</span><input value={orderReference} onChange={e=>setOrderReference(e.target.value)} maxLength="80" placeholder="RW-…"/></label><button type="button" disabled={busy} onClick={saveDetails}>Save details</button></div>}
      </div>
      <form className="rw-support-composer" onSubmit={send}><textarea rows="1" maxLength="1500" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write a message…" aria-label="Support message"/><button type="submit" disabled={busy||!message.trim()} aria-label="Send message"><Send size={18}/></button></form>
      {error&&<div className="rw-support-error" role="alert">{error}</div>}
    </section>}
  </aside>;
}
