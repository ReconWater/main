import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Lock } from 'lucide-react';
import AdminPanel from './AdminPanel.jsx';
import { configured, supabase } from './supabase.js';
import './styles.css';
import './admin-entry.css';

function AdminLogin({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (!data.session) throw new Error('Supabase did not return an authenticated session.');
      onSignedIn(data.session);
    } catch (err) {
      setError(err?.message || 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="admin-entry-page">
    <form className="admin-entry-card" onSubmit={submit}>
      <div className="admin-entry-icon"><Lock size={22}/></div>
      <span>RECON WATER</span>
      <h1>Operations Center</h1>
      <p>Sign in with an authorized administrator account.</p>
      <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      {error && <div className="admin-entry-error" role="alert">{error}</div>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Administrator sign in'}</button>
    </form>
  </main>;
}

function AdminEntry() {
  const [session, setSession] = useState(undefined);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!configured || !supabase) {
      setSession(null);
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession || null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const toast = (text, error = false) => {
    setNotice({ text, error });
    window.setTimeout(() => setNotice(null), 5000);
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
  };

  if (!configured) return <main className="admin-entry-page"><section className="admin-entry-card"><div className="admin-entry-icon"><Lock size={22}/></div><span>RECON WATER</span><h1>Supabase is not configured</h1><p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the deployment environment, then redeploy.</p></section></main>;
  if (session === undefined) return <main className="admin-entry-page"><section className="admin-entry-card"><p>Loading administrator session…</p></section></main>;
  if (!session) return <AdminLogin onSignedIn={setSession} />;

  return <>
    <AdminPanel
      session={session}
      openAuth={() => {}}
      toast={toast}
      onSignOut={signOut}
      reloadPublic={async () => {}}
    />
    {notice && <div className={`admin-entry-notice ${notice.error ? 'is-error' : ''}`} role="status">{notice.text}</div>}
  </>;
}

createRoot(document.getElementById('root')).render(<AdminEntry />);
