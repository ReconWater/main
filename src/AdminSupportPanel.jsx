import React,{useCallback,useEffect,useRef,useState} from 'react';
import {CheckCircle2,Mail,MessageCircle,RefreshCw,Search,Send,ToggleLeft,ToggleRight} from 'lucide-react';
import './admin-support.css';

const API='/api/support';
const stamp=value=>value?new Date(value).toLocaleString('en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}):'—';
const clock=value=>value?new Date(value).toLocaleTimeString('en-CA',{hour:'numeric',minute:'2-digit'}):'';

async function callSupport(mode,session,body={}){
  const response=await fetch(`${API}?mode=${encodeURIComponent(mode)}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Support request failed.');
  return data;
}

export default function AdminSupportPanel({active,session,toast,onUnreadChange}){
  const [threads,setThreads]=useState([]),[selectedId,setSelectedId]=useState(null),[thread,setThread]=useState(null),[messages,setMessages]=useState([]),[reply,setReply]=useState(''),[available,setAvailable]=useState(true),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[search,setSearch]=useState('');
  const listBusy=useRef(false),threadBusy=useRef(false),messagesRef=useRef(null),lastAdminMessage=useRef(0);

  const loadList=useCallback(async({quiet=false}={})=>{
    if(!session||listBusy.current)return;listBusy.current=true;if(!quiet)setLoading(true);
    try{
      const data=await callSupport('admin-list',session);
      setThreads(data.threads||[]);setAvailable(Boolean(data.presence?.available));
      const unread=(data.threads||[]).reduce((n,t)=>n+Number(t.unread_count||0),0);onUnreadChange?.(unread);
      if(!selectedId&&active&&data.threads?.[0])setSelectedId(data.threads[0].id);
    }catch(e){if(!quiet)toast?.(e.message,true)}finally{listBusy.current=false;if(!quiet)setLoading(false)}
  },[session?.access_token,selectedId,active,available,onUnreadChange,toast]);

  const loadThread=useCallback(async(id,{quiet=false}={})=>{
    if(!id||!session||threadBusy.current)return;threadBusy.current=true;
    try{
      const data=await callSupport('admin-thread',session,{thread_id:id});
      setThread(data.thread);setMessages(data.messages||[]);
      const newest=(data.messages||[]).at(-1);if(newest?.sender==='visitor'&&Number(newest.id)>lastAdminMessage.current&&lastAdminMessage.current){}
      lastAdminMessage.current=Number(newest?.id||0);
      onUnreadChange?.(Math.max(0,threads.reduce((n,t)=>n+Number(t.unread_count||0),0)-Number(threads.find(t=>t.id===id)?.unread_count||0)));
      if(!quiet)await loadList({quiet:true});
    }catch(e){if(!quiet)toast?.(e.message,true)}finally{threadBusy.current=false}
  },[session?.access_token,threads,onUnreadChange,toast,loadList]);

  useEffect(()=>{
    if(!session)return;
    const beat=()=>callSupport('admin-heartbeat',session).then(data=>setAvailable(Boolean(data.available))).catch(()=>{});
    beat();const id=setInterval(beat,20000);return()=>clearInterval(id);
  },[session?.access_token]);
  useEffect(()=>{
    if(!session)return;loadList({quiet:!active});const id=setInterval(()=>loadList({quiet:true}),active?4000:12000);return()=>clearInterval(id);
  },[session?.access_token,active,loadList]);
  useEffect(()=>{if(active&&selectedId){loadThread(selectedId);const id=setInterval(()=>loadThread(selectedId,{quiet:true}),3500);return()=>clearInterval(id)}},[active,selectedId,loadThread]);
  useEffect(()=>{if(messagesRef.current)messagesRef.current.scrollTop=messagesRef.current.scrollHeight},[messages.length,selectedId]);

  const changeAvailability=async()=>{
    if(busy)return;setBusy(true);try{const data=await callSupport('admin-availability',session,{available:!available});setAvailable(Boolean(data.available));toast?.(data.available?'Support marked online':'Support marked offline')}catch(e){toast?.(e.message,true)}finally{setBusy(false)}
  };
  const send=async e=>{
    e.preventDefault();const text=reply.trim();if(!text||!selectedId||busy)return;setBusy(true);
    try{await callSupport('admin-reply',session,{thread_id:selectedId,message:text});setReply('');await loadThread(selectedId);toast?.('Support reply sent')}catch(err){toast?.(err.message,true)}finally{setBusy(false)}
  };
  const toggleStatus=async()=>{
    if(!thread||busy)return;const status=thread.status==='closed'?'open':'closed';setBusy(true);try{await callSupport('admin-status',session,{thread_id:thread.id,status});await Promise.all([loadThread(thread.id),loadList({quiet:true})]);toast?.(status==='closed'?'Conversation closed':'Conversation reopened')}catch(e){toast?.(e.message,true)}finally{setBusy(false)}
  };
  if(!active)return null;
  const filtered=threads.filter(t=>[t.visitor_code,t.email,t.order_reference,t.last_visitor_message].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()));
  return <div className="support-admin-page">
    <div className="admin-heading-row support-admin-heading"><div className="admin-heading"><div><div className="section-eyebrow">08 / SUPPORT</div><h1>Customer support.</h1><p>Anonymous storefront conversations, order context and live availability in one queue.</p></div></div><button className={`support-availability ${available?'is-online':'is-offline'}`} onClick={changeAvailability} disabled={busy}>{available?<ToggleRight size={20}/>:<ToggleLeft size={20}/>} {available?'Online':'Offline'}</button></div>
    <section className="support-admin-shell">
      <aside className="support-admin-list">
        <header><div><strong>Conversations</strong><small>{threads.reduce((n,t)=>n+Number(t.unread_count||0),0)} unread</small></div><button onClick={()=>loadList()} disabled={loading}><RefreshCw size={15} className={loading?'spinning':''}/></button></header>
        <label className="support-admin-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search visitor, email, order"/></label>
        <div className="support-thread-list">{filtered.map(item=><button type="button" key={item.id} onClick={()=>setSelectedId(item.id)} className={selectedId===item.id?'selected':''}><span className={`support-thread-dot ${item.status}`}/><div><strong>{item.visitor_code}</strong><small>{item.email||item.order_reference||'Anonymous visitor'}</small><p>{item.last_visitor_message||'No customer message preview'}</p></div><div><time>{stamp(item.last_message_at)}</time>{item.unread_count>0&&<b>{item.unread_count}</b>}</div></button>)}{!filtered.length&&<div className="support-admin-empty"><MessageCircle size={23}/><strong>No conversations</strong><span>New customer messages will appear here.</span></div>}</div>
      </aside>
      <section className="support-admin-conversation">
        {!thread?<div className="support-admin-empty is-main"><MessageCircle size={30}/><strong>Select a conversation</strong><span>Customer messages and context will appear here.</span></div>:<>
          <header className="support-conversation-head"><div><strong>{thread.visitor_code}</strong><span>{thread.status==='closed'?'Closed conversation':'Open conversation'} · started {stamp(thread.created_at)}</span></div><button onClick={toggleStatus} disabled={busy}>{thread.status==='closed'?'Reopen':'Close conversation'}</button></header>
          {(thread.email||thread.order_reference)&&<div className="support-context">{thread.email&&<span><Mail size={14}/>{thread.email}</span>}{thread.order_reference&&<span><CheckCircle2 size={14}/>Order {thread.order_reference}</span>}</div>}
          <div className="support-admin-messages" ref={messagesRef}>{messages.map(item=><div className={`support-admin-bubble ${item.sender==='admin'?'is-admin':'is-visitor'}`} key={item.id}><div>{item.body}</div><small>{item.sender==='admin'?'You':'Customer'} · {clock(item.created_at)}</small></div>)}{!messages.length&&<div className="support-admin-empty"><span>No messages in this conversation yet.</span></div>}</div>
          <form className="support-admin-composer" onSubmit={send}><textarea rows="2" maxLength="1500" value={reply} onChange={e=>setReply(e.target.value)} placeholder={thread.status==='closed'?'Replying will reopen this conversation…':'Write a reply…'}/><button className="primary-button" disabled={busy||!reply.trim()}>{busy?'Sending…':<>Send reply <Send size={16}/></>}</button></form>
        </>}
      </section>
    </section>
  </div>;
}
