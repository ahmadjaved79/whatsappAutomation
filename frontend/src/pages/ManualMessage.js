import React, { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { Send, Search, MessageCircle } from 'lucide-react';

const S = {
  page:  { animation: 'fadeIn .35s ease' },
  card:  { background: '#fff', borderRadius: 14, padding: '22px 24px', boxShadow: '0 2px 12px rgba(0,0,0,.07)', border: '1px solid #F0F0F0', marginBottom: 16 },
  input: { padding: '9px 13px', border: '1px solid #E0E0E0', borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'inherit', transition: 'border .2s' },
  btn:   { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none', transition: 'all .18s' },
};

const segBadge = { vip: { bg: '#F5F3FF', c: '#7c3aed' }, regular: { bg: '#E3F2FD', c: '#1565C0' }, new: { bg: '#E8F5E9', c: '#1A7A4A' } };

const QUICK_REPLIES = [
  { label: 'Order ready',   text: '✅ Your order is ready and will be delivered soon! 🥩' },
  { label: 'Out of stock',  text: '😔 Sorry, the item you requested is out of stock today. Please try tomorrow!' },
  { label: 'Delay notice',  text: '⏳ We apologise for the delay. Your order will arrive in the next 15–20 minutes. Thank you for your patience!' },
  { label: 'Fresh stock',   text: '🥩 Fresh mutton & chicken just arrived! Reply *ORDER* to place your order now.' },
  { label: 'Payment done',  text: '✅ Payment received! Thank you. Your order is being prepared. 🙏' },
  { label: 'Special offer', text: '🎉 Special offer today! Mutton Boneless at ₹750/kg (usually ₹800). Limited stock — reply *ORDER* now!' },
];

export default function ManualMessage() {
  const [contacts, setContacts]     = useState([]);
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(null);
  const [customPhone, setCustomPhone] = useState('');
  const [message, setMessage]       = useState('');
  const [sending, setSending]       = useState(false);
  const [log, setLog]               = useState([]);

  useEffect(() => { fetchContacts(); }, []);

  const fetchContacts = async () => {
    const { data } = await api.get('/api/contacts');
    if (data.success) setContacts(data.contacts.filter(c => !c.optedOut));
  };

  const filtered = contacts.filter(c =>
    c.phone.includes(search) || (c.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const recipient = selected?.phone || customPhone.replace(/\D/g, '').slice(-10);

  const send = async () => {
    if (!message.trim() || !recipient) { toast.error('Select a contact and type a message'); return; }
    setSending(true);
    try {
      const { data } = await api.post('/api/contacts/send-message', { phone: recipient, message });
      const entry = { id: Date.now(), phone: recipient, name: selected?.name || customPhone, message, time: new Date().toLocaleTimeString('en-IN'), success: data.success };
      setLog(prev => [entry, ...prev].slice(0, 20));
      if (data.success) { toast.success('Message sent!'); setMessage(''); }
      else toast.error('Failed to send');
    } catch { toast.error('Failed to send'); }
    setSending(false);
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', fontFamily: 'inherit' }}>

      {/* Left contact list */}
      <div style={{ width: 280, borderRight: '1px solid #F0F0F0', display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#fff' }}>
        <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: '#1a1a1a' }}>Select Contact</div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
            <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, paddingLeft: 30, fontSize: 12, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>Or enter phone manually</div>
          <input placeholder="e.g. 9876543210" value={customPhone} onChange={e => { setCustomPhone(e.target.value); setSelected(null); }}
            style={{ ...S.input, fontSize: 12, width: '100%', boxSizing: 'border-box' }} />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.map(c => (
            <div key={c._id} onClick={() => { setSelected(c); setCustomPhone(''); }} style={{
              padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F9F9F9',
              background: selected?._id === c._id ? '#FFF0F2' : '#fff',
              borderLeft: selected?._id === c._id ? '3px solid #C8102E' : '3px solid transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{c.name || c.phone}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, ...(segBadge[c.segment] || segBadge.new) }}>{c.segment}</span>
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{c.phone}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right compose */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#FAFAFA' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F0F0F0', background: '#fff' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 2 }}>Send WhatsApp Message</div>
          <div style={{ fontSize: 13, color: '#888' }}>
            {recipient ? <>Sending to: <strong>+91 {recipient}</strong>{selected?.name ? ` (${selected.name})` : ''}</> : 'Select a contact or enter a number'}
          </div>
        </div>

        <div style={{ padding: '20px 22px', flex: 1 }}>
          {/* Quick replies */}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .4 }}>Quick Replies</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {QUICK_REPLIES.map((q, i) => (
              <button key={i} onClick={() => setMessage(q.text)} style={{
                padding: '5px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
                border: '1px solid #E0E0E0', background: message === q.text ? '#FFF0F2' : '#fff',
                color: '#333', fontWeight: message === q.text ? 700 : 400,
              }}>{q.label}</button>
            ))}
          </div>

          {/* Compose */}
          <textarea value={message} onChange={e => setMessage(e.target.value)}
            placeholder={"Type your WhatsApp message here…\nSupports *bold*, _italic_, ~strikethrough~"}
            rows={6} style={{ ...S.input, width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6, fontSize: 14 }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 12, color: '#aaa' }}>{message.length} chars</span>
            <button onClick={send} disabled={sending || !message.trim() || !recipient} style={{
              ...S.btn, background: !message.trim() || !recipient ? '#E0E0E0' : '#25D366', color: '#fff', fontWeight: 700,
            }}>
              <Send size={14} />{sending ? 'Sending…' : '📤 Send'}
            </button>
          </div>

          {/* Log */}
          {log.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 10, textTransform: 'uppercase', letterSpacing: .4 }}>Send History</div>
              {log.map(entry => (
                <div key={entry.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #F0F0F0' }}>
                  <span style={{ fontSize: 16 }}>{entry.success ? '✅' : '❌'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>+91 {entry.phone}{entry.name && entry.name !== entry.phone ? ` (${entry.name})` : ''}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{entry.message.slice(0, 80)}{entry.message.length > 80 ? '…' : ''}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>{entry.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}