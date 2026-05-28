import React, { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { User, Phone, ShoppingBag, Send, UserX, UserCheck, Search } from 'lucide-react';

const S = {
  page:  { animation: 'fadeIn .35s ease', display: 'flex', height: 'calc(100vh - 56px)', gap: 0 },
  card:  { background: '#fff', borderRadius: 14, padding: '22px 24px', boxShadow: '0 2px 12px rgba(0,0,0,.07)', border: '1px solid #F0F0F0', marginBottom: 16 },
  btn:   { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none', transition: 'all .18s' },
  input: { padding: '9px 13px', border: '1px solid #E0E0E0', borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
};

const segBadge = { vip: { bg: '#F5F3FF', c: '#7c3aed' }, regular: { bg: '#E3F2FD', c: '#1565C0' }, new: { bg: '#E8F5E9', c: '#1A7A4A' } };
const statBadge = { confirmed: { bg: '#E8F5E9', c: '#1A7A4A' }, preparing: { bg: '#FFF3E0', c: '#E05C00' }, out_for_delivery: { bg: '#E3F2FD', c: '#1565C0' }, delivered: { bg: '#F1F8E9', c: '#558B2F' }, cancelled: { bg: '#FFEBEE', c: '#C62828' } };

export default function CustomerProfiles() {
  const [contacts, setContacts]   = useState([]);
  const [selected, setSelected]   = useState(null);
  const [orders, setOrders]       = useState([]);
  const [search, setSearch]       = useState('');
  const [segFilter, setSegFilter] = useState('all');
  const [detailLoading, setDetailLoading] = useState(false);
  const [msgText, setMsgText]     = useState('');
  const [msgStatus, setMsgStatus] = useState('');
  const [isMobile, setIsMobile]   = useState(window.innerWidth < 768);

  useEffect(() => { fetchContacts(); }, [segFilter]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchContacts = async () => {
    const q = segFilter !== 'all' ? `?segment=${segFilter}` : '';
    const { data } = await api.get(`/api/contacts${q}`);
    if (data.success) setContacts(data.contacts);
  };

  const openProfile = async (contact) => {
    setSelected(contact); setOrders([]); setMsgText(''); setMsgStatus('');
    setDetailLoading(true);
    const { data } = await api.get(`/api/analytics/customer/${contact.phone}`);
    if (data.success) setOrders(data.orders || []);
    setDetailLoading(false);
  };

  const sendMsg = async () => {
    if (!msgText.trim() || !selected) return;
    setMsgStatus('sending');
    try {
      const { data } = await api.post('/api/contacts/send-message', { phone: selected.phone, message: msgText });
      setMsgStatus(data.success ? 'sent' : 'error');
      if (data.success) { toast.success('Message sent!'); setMsgText(''); }
      else toast.error('Failed to send');
    } catch { setMsgStatus('error'); toast.error('Failed to send'); }
  };

  const toggleOptOut = async (contact) => {
    const ep = contact.optedOut ? 'opt-in' : 'opt-out';
    await api.put(`/api/contacts/${contact._id}/${ep}`);
    toast.success(contact.optedOut ? 'Re-subscribed!' : 'Opted out');
    fetchContacts();
    if (selected?._id === contact._id) setSelected({ ...contact, optedOut: !contact.optedOut });
  };

  const filtered = contacts.filter(c =>
    c.phone.includes(search) || (c.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: isMobile ? 'auto' : 'calc(100vh - 80px)', fontFamily: 'inherit', gap: 0 }}>

      {/* Left list */}
      <div style={{ width: isMobile ? '100%' : 300, borderRight: isMobile ? 'none' : '1px solid #F0F0F0', borderBottom: isMobile ? '1px solid #F0F0F0' : 'none', display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#fff', height: isMobile ? '320px' : 'auto' }}>
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: '#1a1a1a' }}>Customers</div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
            <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, paddingLeft: 30, fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {['all','vip','regular','new'].map(s => (
              <button key={s} onClick={() => setSegFilter(s)} style={{ ...S.btn, padding: '4px 10px', fontSize: 11, background: segFilter === s ? '#C8102E' : '#F5F5F5', color: segFilter === s ? '#fff' : '#555' }}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.map(c => (
            <div key={c._id} onClick={() => openProfile(c)} style={{
              padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #F9F9F9',
              background: selected?._id === c._id ? '#FFF0F2' : '#fff',
              borderLeft: selected?._id === c._id ? '3px solid #C8102E' : '3px solid transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a1a' }}>{c.name || c.phone}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, ...(segBadge[c.segment] || segBadge.new) }}>{c.segment}</span>
              </div>
              <div style={{ fontSize: 11, color: '#aaa' }}>{c.phone} · {c.ordersPlaced || 0} orders</div>
              {c.optedOut && <div style={{ fontSize: 10, color: '#C62828', marginTop: 2 }}>⛔ Opted out</div>}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>No customers found</div>}
        </div>
      </div>

      {/* Right detail */}
      {selected ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', background: '#FAFAFA', height: 'auto' }}>

          {/* Header */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', marginBottom: 20, gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>{selected.name || 'Unknown'}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, ...(segBadge[selected.segment] || segBadge.new) }}>{selected.segment?.toUpperCase()}</span>
                {selected.optedOut && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#FFEBEE', color: '#C62828' }}>OPTED OUT</span>}
              </div>
              <div style={{ fontSize: 13, color: '#888' }}>+91 {selected.phone}{selected.email ? ` · ${selected.email}` : ''}</div>
            </div>
            <button onClick={() => toggleOptOut(selected)} style={{ ...S.btn, background: selected.optedOut ? '#E8F5E9' : '#FFEBEE', color: selected.optedOut ? '#1A7A4A' : '#C62828', border: '1px solid currentColor', justifyContent: 'center' }}>
              {selected.optedOut ? <><UserCheck size={13} />Re-subscribe</> : <><UserX size={13} />Opt Out</>}
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', justifyContent: isMobile ? 'space-between' : 'flex-start' }}>
            {[
              { label: 'Total Orders',    value: selected.ordersPlaced || 0 },
              { label: 'Total Spend',     value: `₹${(selected.totalSpend || 0).toLocaleString('en-IN')}` },
              { label: 'Avg Order',       value: selected.ordersPlaced ? `₹${Math.round((selected.totalSpend||0)/selected.ordersPlaced)}` : '—' },
              { label: 'Last Order',      value: selected.lastOrderAt ? new Date(selected.lastOrderAt).toLocaleDateString('en-IN') : 'Never' },
              { label: 'Templates Sent',  value: selected.templatesSent || 0 },
              { label: 'Source',          value: selected.source || 'manual' },
            ].map((m, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', minWidth: isMobile ? 'calc(50% - 6px)' : 110, border: '1px solid #F0F0F0', boxSizing: 'border-box' }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a' }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Manual message */}
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#1a1a1a' }}>💬 Send WhatsApp Message</div>
            <textarea value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Type your message…" rows={3}
              style={{ ...S.input, resize: 'vertical', lineHeight: 1.6, marginBottom: 10 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={sendMsg} disabled={msgStatus === 'sending' || !msgText.trim()} style={{ ...S.btn, background: '#1A7A4A', color: '#fff', opacity: !msgText.trim() ? 0.5 : 1 }}>
                <Send size={13} />{msgStatus === 'sending' ? 'Sending…' : 'Send'}
              </button>
              {msgStatus === 'sent'  && <span style={{ fontSize: 12, color: '#1A7A4A' }}>✅ Sent!</span>}
              {msgStatus === 'error' && <span style={{ fontSize: 12, color: '#C8102E' }}>❌ Failed</span>}
            </div>
          </div>

          {/* Orders */}
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#1a1a1a' }}>Order History</div>
          {detailLoading
            ? <div style={{ color: '#aaa', fontSize: 13 }}>Loading orders…</div>
            : orders.length === 0
            ? <div style={{ background: '#fff', borderRadius: 10, padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13, border: '1px solid #F0F0F0' }}>No orders yet</div>
            : orders.map(o => (
                <div key={o._id} style={{ background: '#fff', border: '1px solid #F0F0F0', borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#C8102E', fontSize: 13 }}>{o.orderId}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, ...(statBadge[o.status] || {}) }}>{o.status?.replace(/_/g,' ')}</span>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>₹{(o.totalAmount||0).toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa', marginBottom: 6 }}>{new Date(o.createdAt).toLocaleString('en-IN')}</div>
                  {o.items?.map((item, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#555', padding: '2px 0' }}>• {item.name} — {item.quantity} {item.unit} × ₹{item.price} = ₹{item.total}</div>
                  ))}
                </div>
              ))
          }
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 14, background: '#FAFAFA', padding: 40 }}>
          <div style={{ textAlign: 'center' }}>
            <User size={48} color="#E0E0E0" style={{ marginBottom: 12 }} />
            <div>Select a customer to view their profile</div>
          </div>
        </div>
      )}
    </div>
  );
}