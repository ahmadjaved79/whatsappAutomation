import React, { useState } from 'react';
import api from '../api';
import toast from 'react-hot-toast';

const S = {
  page: {
    minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#1a2540 50%,#0f172a 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    fontFamily: 'DM Sans, sans-serif'
  },
  box: {
    background: '#fff', borderRadius: 24, padding: '44px 40px', width: '100%', maxWidth: 420,
    boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
  },
  logo: {
    width: 56, height: 56, borderRadius: 16,
    background: 'linear-gradient(135deg,#c8102e,#ff5c7a)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 28, margin: '0 auto 20px', boxShadow: '0 6px 20px rgba(200,16,46,0.35)',
  },
  title: { fontSize: 24, fontWeight: 800, color: '#0f172a', textAlign: 'center', marginBottom: 6 },
  sub:   { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 32 },
  label: { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 },
  input: { width: '100%', padding: '13px 16px', border: '1.5px solid #e2e8f0', borderRadius: 11, fontSize: 14, outline: 'none', fontFamily: 'inherit', background: '#fafafa', boxSizing: 'border-box', transition: 'all .2s' },
  btn:   { width: '100%', padding: '14px', background: 'linear-gradient(135deg,#c8102e,#e8304a)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer', marginTop: 8, transition: 'all .25s' },
  group: { marginBottom: 20 },
};

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPwd,  setShowPwd]  = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Enter email and password'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      if (data.success) {
        localStorage.setItem('admin_token', data.token);
        toast.success('Login successful! Welcome back, Mahesh! 👋');
        window.location.href = '/dashboard';
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid email or password');
    }
    setLoading(false);
  };

  return (
    <div style={S.page}>
      <div style={S.box}>
        <div style={S.logo}>🥩</div>
        <h1 style={S.title}>FreshMeat Admin</h1>
        <p style={S.sub}>Sign in to your shop dashboard</p>

        <form onSubmit={handleLogin}>
          <div style={S.group}>
            <label style={S.label}>Email</label>
            <input
              style={S.input} type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. 23hp1a0548@gmail.com" autoFocus
              onFocus={e => e.target.style.borderColor='#c8102e'}
              onBlur={e => e.target.style.borderColor='#e2e8f0'}
            />
          </div>
          <div style={S.group}>
            <label style={S.label}>Password</label>
            <div style={{ position:'relative' }}>
              <input
                style={{ ...S.input, paddingRight: 48 }}
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                onFocus={e => e.target.style.borderColor='#c8102e'}
                onBlur={e => e.target.style.borderColor='#e2e8f0'}
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)}
                style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#94a3b8' }}>
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <button type="submit" style={{ ...S.btn, opacity: loading ? .7 : 1 }} disabled={loading}>
            {loading ? '⏳ Logging in…' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  );
}