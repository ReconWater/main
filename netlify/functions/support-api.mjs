import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const nowIso=()=>new Date().toISOString();
const trim=(value,max=1500)=>String(value??'').trim().slice(0,max);
const validEmail=value=>!value||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
const visitorCode=hash=>`RW-${hash.slice(0,8).toUpperCase()}`;
const ONLINE_WINDOW_MS=75_000;
const emailCooldownMs=15*60*1000;

function dbClient(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw Object.assign(new Error('Support backend is not configured.'),{status:503});
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

async function bodyOf(request){
  const raw=await request.text();
  if(raw.length>12_000) throw Object.assign(new Error('Request too large.'),{status:413});
  if(!raw)return {};
  try{const value=JSON.parse(raw);if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value}
  catch{throw Object.assign(new Error('Invalid request data.'),{status:400})}
}

function requireSessionToken(body){
  const token=trim(body.session_token,120);
  if(!/^[A-Za-z0-9_-]{30,120}$/.test(token)) throw Object.assign(new Error('Support session is invalid.'),{status:400});
  return token;
}

async function requireAdmin(request,db){
  const auth=request.headers.get('authorization')||'';
  const token=auth.replace(/^Bearer\s+/i,'').trim();
  if(!token) throw Object.assign(new Error('Administrator authentication required.'),{status:401});
  const {data:{user},error}=await db.auth.getUser(token);
  if(error||!user?.id) throw Object.assign(new Error('Administrator session is invalid or expired.'),{status:401});
  const {data:admin,error:adminErr}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  if(adminErr) throw adminErr;
  if(!admin) throw Object.assign(new Error('Administrator access required.'),{status:403});
  return user;
}

async function presence(db){
  const {data,error}=await db.from('support_presence').select('is_available,last_seen_at').eq('id',1).maybeSingle();
  if(error)throw error;
  const last=data?.last_seen_at?new Date(data.last_seen_at).getTime():0;
  const online=Boolean(data?.is_available&&last&&(Date.now()-last)<ONLINE_WINDOW_MS);
  return {online,available:Boolean(data?.is_available),last_seen_at:data?.last_seen_at||null};
}

async function getThread(db,sessionToken,{create=false}={}){
  const hash=tokenHash(sessionToken);
  const {data,error}=await db.from('support_threads').select('*').eq('session_token_hash',hash).maybeSingle();
  if(error)throw error;
  if(data||!create)return data||null;
  const {data:created,error:createError}=await db.from('support_threads').insert({session_token_hash:hash,visitor_code:visitorCode(hash)}).select('*').single();
  if(createError)throw createError;
  return created;
}

async function readMessages(db,threadId,limit=200){
  const {data,error}=await db.from('support_messages').select('id,sender,body,created_at').eq('thread_id',threadId).order('id',{ascending:true}).limit(limit);
  if(error)throw error;
  return data||[];
}

const escapeHtml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
async function sendOfflineNotification(thread,message){
  const apiKey=trim(process.env.RESEND_API_KEY,300);
  const fromEmail=trim(process.env.RESEND_FROM_EMAIL,240);
  const to=trim(process.env.RESEND_SUPPORT_TO_EMAIL,240);
  if(!apiKey||!fromEmail||!to||!validEmail(to))return false;
  const fromName=trim(process.env.RESEND_FROM_NAME||'Recon Water',80)||'Recon Water';
  const from=fromEmail.includes('<')?fromEmail:`${fromName} Support <${fromEmail}>`;
  const subject=`New support message · ${thread.visitor_code}`;
  const details=[thread.email?`Email: ${thread.email}`:'',thread.order_reference?`Order: ${thread.order_reference}`:''].filter(Boolean).join('\n');
  const text=`Recon Water support\n\n${thread.visitor_code}${details?`\n${details}`:''}\n\n${message}\n\nOpen the Recon Water admin support panel to reply.`;
  const html=`<!doctype html><html><body style="margin:0;background:#eef4f6;font-family:Arial,sans-serif;color:#123746"><table width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #d7e3e7;border-radius:16px"><tr><td style="padding:28px 32px"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#5e8492">RECON WATER SUPPORT</div><h1 style="margin:8px 0 14px;font-size:24px;color:#0d3444">New customer message.</h1><p style="margin:0 0 15px;color:#55717c">${escapeHtml(thread.visitor_code)}${thread.email?` · ${escapeHtml(thread.email)}`:''}${thread.order_reference?` · ${escapeHtml(thread.order_reference)}`:''}</p><div style="padding:16px 18px;background:#eef5f6;border-radius:12px;line-height:1.6;color:#163e4d">${escapeHtml(message).replace(/\n/g,'<br>')}</div><p style="margin:18px 0 0;color:#6b8792;font-size:13px">Open the Recon Water admin support panel to reply.</p></td></tr></table></td></tr></table></body></html>`;
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject,text,html})});
  return response.ok;
}


async function sendVisitorReplyNotification(thread,message){
  const apiKey=trim(process.env.RESEND_API_KEY,300);
  const fromEmail=trim(process.env.RESEND_FROM_EMAIL,240);
  const to=trim(thread?.email,240);
  if(!apiKey||!fromEmail||!to||!validEmail(to))return false;
  const fromName=trim(process.env.RESEND_FROM_NAME||'Recon Water',80)||'Recon Water';
  const from=fromEmail.includes('<')?fromEmail:`${fromName} Support <${fromEmail}>`;
  const subject='Recon Water Support replied';
  const text=`Recon Water Support\n\n${message}\n\nReturn to https://reconwater.ca to continue the conversation. Your browser keeps the private support session on this device.`;
  const html=`<!doctype html><html><body style="margin:0;background:#eef4f6;font-family:Arial,sans-serif;color:#123746"><table width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #d7e3e7;border-radius:16px"><tr><td style="padding:28px 32px"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#5e8492">RECON WATER SUPPORT</div><h1 style="margin:8px 0 14px;font-size:24px;color:#0d3444">We replied to your message.</h1><div style="padding:16px 18px;background:#eef5f6;border-radius:12px;line-height:1.6;color:#163e4d">${escapeHtml(message).replace(/\n/g,'<br>')}</div><p style="margin:18px 0 0;color:#6b8792;font-size:13px;line-height:1.6">Return to <a href="https://reconwater.ca" style="color:#286b80">reconwater.ca</a> on the same browser/device to continue your private support conversation.</p></td></tr></table></td></tr></table></body></html>`;
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject,text,html})});
  return response.ok;
}

export default async request=>{
  const mode=new URL(request.url).searchParams.get('mode')||'';
  let db;
  try{
    db=dbClient();
    if(request.method==='GET'&&mode==='presence')return json(await presence(db));
    if(request.method!=='POST')return json({error:'Method not allowed.'},405);
    const body=await bodyOf(request);

    if(mode==='messages'){
      const token=requireSessionToken(body);
      const thread=await getThread(db,token);
      if(!thread)return json({thread:null,messages:[],presence:await presence(db)});
      const messages=await readMessages(db,thread.id);
      const last=messages.at(-1)?.created_at||thread.last_message_at;
      await db.from('support_threads').update({customer_last_read_at:nowIso(),updated_at:nowIso()}).eq('id',thread.id);
      return json({thread:{id:thread.id,visitor_code:thread.visitor_code,status:thread.status,email:thread.email,order_reference:thread.order_reference,last_message_at:last},messages,presence:await presence(db)});
    }

    if(mode==='send'){
      const token=requireSessionToken(body);
      const message=trim(body.message,1500);
      if(!message)throw Object.assign(new Error('Enter a message first.'),{status:400});
      const email=trim(body.email,240).toLowerCase();
      const orderReference=trim(body.order_reference,80);
      if(!validEmail(email))throw Object.assign(new Error('Email address is invalid.'),{status:400});
      let thread=await getThread(db,token,{create:true});
      const oneMinuteAgo=new Date(Date.now()-60_000).toISOString();
      const {count,error:countErr}=await db.from('support_messages').select('id',{count:'exact',head:true}).eq('thread_id',thread.id).eq('sender','visitor').gte('created_at',oneMinuteAgo);
      if(countErr)throw countErr;
      if(Number(count||0)>=8)throw Object.assign(new Error('Too many messages sent. Please wait a moment.'),{status:429});
      const timestamp=nowIso();
      const patch={last_message_at:timestamp,updated_at:timestamp,status:'open'};
      if(email)patch.email=email;
      if(orderReference)patch.order_reference=orderReference;
      const {data:updated,error:updateErr}=await db.from('support_threads').update(patch).eq('id',thread.id).select('*').single();
      if(updateErr)throw updateErr;
      thread=updated;
      const {data:created,error:messageErr}=await db.from('support_messages').insert({thread_id:thread.id,sender:'visitor',body:message}).select('id,sender,body,created_at').single();
      if(messageErr)throw messageErr;
      const currentPresence=await presence(db);
      const lastNotice=thread.last_notification_at?new Date(thread.last_notification_at).getTime():0;
      if(!currentPresence.online&&Date.now()-lastNotice>emailCooldownMs){
        try{if(await sendOfflineNotification(thread,message))await db.from('support_threads').update({last_notification_at:nowIso()}).eq('id',thread.id)}catch(e){console.error('Support notification failed',e?.message||e)}
      }
      return json({message:created,thread:{id:thread.id,visitor_code:thread.visitor_code,status:thread.status,email:thread.email,order_reference:thread.order_reference},presence:currentPresence},201);
    }

    if(mode==='details'){
      const token=requireSessionToken(body);
      const email=trim(body.email,240).toLowerCase();
      const orderReference=trim(body.order_reference,80);
      if(!validEmail(email))throw Object.assign(new Error('Email address is invalid.'),{status:400});
      const thread=await getThread(db,token,{create:true});
      const {data,error}=await db.from('support_threads').update({email:email||null,order_reference:orderReference||null,updated_at:nowIso()}).eq('id',thread.id).select('id,visitor_code,status,email,order_reference').single();
      if(error)throw error;
      return json({thread:data});
    }

    const admin=await requireAdmin(request,db);

    if(mode==='admin-heartbeat'){
      const timestamp=nowIso();
      const {data,error}=await db.from('support_presence').upsert({id:1,admin_user_id:admin.id,last_seen_at:timestamp,updated_at:timestamp},{onConflict:'id'}).select('is_available,last_seen_at').single();
      if(error)throw error;
      return json({online:Boolean(data.is_available),available:Boolean(data.is_available),last_seen_at:data.last_seen_at});
    }

    if(mode==='admin-availability'){
      const available=Boolean(body.available);
      const timestamp=nowIso();
      const {data,error}=await db.from('support_presence').upsert({id:1,admin_user_id:admin.id,is_available:available,last_seen_at:timestamp,updated_at:timestamp},{onConflict:'id'}).select('is_available,last_seen_at').single();
      if(error)throw error;
      return json({available:Boolean(data.is_available),last_seen_at:data.last_seen_at});
    }

    if(mode==='admin-list'){
      const {data:threads,error}=await db.from('support_threads').select('id,visitor_code,email,order_reference,status,admin_last_read_at,last_message_at,created_at,updated_at').order('last_message_at',{ascending:false}).limit(100);
      if(error)throw error;
      const ids=(threads||[]).map(t=>t.id);
      let visitorMessages=[];
      if(ids.length){
        const r=await db.from('support_messages').select('id,thread_id,body,created_at').in('thread_id',ids).eq('sender','visitor').order('id',{ascending:false}).limit(1000);
        if(r.error)throw r.error;visitorMessages=r.data||[];
      }
      const mapped=(threads||[]).map(thread=>{
        const related=visitorMessages.filter(m=>m.thread_id===thread.id);
        const unread=related.filter(m=>!thread.admin_last_read_at||new Date(m.created_at)>new Date(thread.admin_last_read_at)).length;
        return {...thread,unread_count:unread,last_visitor_message:related[0]?.body||''};
      });
      return json({threads:mapped,presence:await presence(db)});
    }

    if(mode==='admin-thread'){
      const id=trim(body.thread_id,80);
      const {data:thread,error}=await db.from('support_threads').select('*').eq('id',id).maybeSingle();
      if(error)throw error;
      if(!thread)return json({error:'Conversation not found.'},404);
      const messages=await readMessages(db,id,300);
      await db.from('support_threads').update({admin_last_read_at:nowIso(),updated_at:nowIso()}).eq('id',id);
      return json({thread,messages});
    }

    if(mode==='admin-reply'){
      const id=trim(body.thread_id,80),message=trim(body.message,1500);
      if(!message)throw Object.assign(new Error('Enter a reply first.'),{status:400});
      const {data:thread,error:threadErr}=await db.from('support_threads').select('id,status,email,visitor_code,customer_last_read_at').eq('id',id).maybeSingle();
      if(threadErr)throw threadErr;
      if(!thread)throw Object.assign(new Error('Conversation not found.'),{status:404});
      const timestamp=nowIso();
      const {data:created,error}=await db.from('support_messages').insert({thread_id:id,sender:'admin',body:message,admin_user_id:admin.id}).select('id,sender,body,created_at').single();
      if(error)throw error;
      const {error:updateErr}=await db.from('support_threads').update({status:'open',last_message_at:timestamp,admin_last_read_at:timestamp,updated_at:timestamp}).eq('id',id);
      if(updateErr)throw updateErr;
      const recentlyRead=thread.customer_last_read_at&&(Date.now()-new Date(thread.customer_last_read_at).getTime())<60_000;
      if(thread.email&&!recentlyRead){try{await sendVisitorReplyNotification(thread,message)}catch(e){console.error('Support customer notification failed',e?.message||e)}}
      return json({message:created});
    }

    if(mode==='admin-status'){
      const id=trim(body.thread_id,80),status=body.status==='closed'?'closed':'open';
      const {data,error}=await db.from('support_threads').update({status,updated_at:nowIso()}).eq('id',id).select('id,status').single();
      if(error)throw error;
      return json({thread:data});
    }

    return json({error:'Unknown support action.'},404);
  }catch(e){
    console.error('Recon support API',mode,e?.message||e);
    return json({error:e?.message||'Support request failed.'},Number(e?.status)||500);
  }
};
