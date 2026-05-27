import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { Send, Image, Users, CheckSquare, Square, FileCode, Clock, CheckCircle2, AlertCircle, X, Eye } from 'lucide-react';

const S = {
  page: { animation: 'fadeIn .35s ease' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16 },
  card: { background: '#fff', borderRadius: 14, padding: '22px 24px', boxShadow: '0 2px 12px rgba(0,0,0,.07)', border: '1px solid #F0F0F0', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 },
  input: { width: '100%', padding: '10px 13px', border: '1px solid #E0E0E0', borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'inherit', transition: 'border .2s', marginBottom: 10 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .4 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 22px', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none', transition: 'all .18s' },
  badge: { display: 'inline-flex', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
};

const PREVIEW_REPLACE = (text) => {
  if (!text) return '';
  return text
    .replace(/{Name}/gi, 'John Doe')
    .replace(/{Email}/gi, 'john@example.com')
    .replace(/{Phone}/gi, '9876543210');
};

export default function Template() {
  const [form, setForm] = useState({ title: 'Fresh Stock Available! 🥩', message: '', footer: '', phones: '' });
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [useAllContacts, setUseAllContacts] = useState(true);
  
  const fileRef = useRef();
  const headerRef = useRef(null);

  useEffect(() => { loadContacts(); loadTemplates(); }, []);

  const loadContacts = async () => {
    try { const { data } = await api.get('/api/contacts'); if (data.success) setContacts(data.contacts.filter(c => !c.optedOut)); } catch {}
  };
  
  const loadTemplates = async () => {
    try { const { data } = await api.get('/api/template'); if (data.success) setTemplates(data.templates); } catch {}
  };

  const handleImage = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Select an image file'); return; }
    setImage(file); setPreview(URL.createObjectURL(file));
  };

  const toggleContact = (phone) => setSelected(s => s.includes(phone) ? s.filter(p => p !== phone) : [...s, phone]);

  const send = async () => {
    if (!form.message.trim()) { toast.error('Enter a message body'); return; }
    const phones = useAllContacts ? contacts.map(c => c.phone) : selected;
    if (!phones.length) { toast.error('No contacts selected'); return; }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('message', form.message);
      fd.append('footer', form.footer);
      fd.append('phones', JSON.stringify(phones));
      if (image) fd.append('image', image);
      
      const { data } = await api.post('/api/template/send', fd);
      if (data.success) {
        toast.success(`🚀 Sending to ${data.total} contacts!`);
        setForm(f => ({ ...f, message: '', footer: '' })); setImage(null); setPreview(null);
        loadTemplates();
      } else toast.error(data.message);
    } catch { toast.error('Sending template failed'); }
    setSending(false);
  };

  const statusBadge = (s) => {
    const map = { sending: { bg: '#FFF3E0', c: '#E05C00', icon: <Clock size={10} /> }, completed: { bg: '#E8F5E9', c: '#1A7A4A', icon: <CheckCircle2 size={10} /> }, draft: { bg: '#F3F3F3', c: '#777', icon: <AlertCircle size={10} /> } };
    const m = map[s] || map.draft;
    return <span style={{ ...S.badge, background: m.bg, color: m.c, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{m.icon}{s}</span>;
  };

  return (
    <div style={S.page} className="animate-in">
      <div style={S.grid}>
        {/* Left: Form */}
        <div>
          <div style={S.card}>
            <div style={S.title}><FileCode size={17} color="#C8102E" />Create Message Template</div>

            <label style={S.label}>Header</label>
            <input 
              ref={headerRef}
              style={S.input} 
              value={form.title} 
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} 
              placeholder="Header text, e.g. Fresh Stock Available! 🥩"
            />

            {/* Dynamic Columns Scrollbar Option */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 0', marginBottom: 12, borderBottom: '1px solid #F5F5F5', paddingBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#777', alignSelf: 'center', marginRight: 4, whiteSpace: 'nowrap' }}>INSERT COLUMN:</span>
              {['Name', 'Phone', 'Email'].map(col => (
                <button
                  key={col}
                  type="button"
                  onClick={() => {
                    const input = headerRef.current;
                    if (!input) return;
                    const start = input.selectionStart || 0;
                    const end = input.selectionEnd || 0;
                    const text = form.title;
                    const newValue = text.substring(0, start) + `{${col}}` + text.substring(end);
                    setForm(f => ({ ...f, title: newValue }));
                    setTimeout(() => {
                      input.focus();
                      input.selectionStart = input.selectionEnd = start + col.length + 2;
                    }, 0);
                  }}
                  style={{
                    padding: '4px 10px',
                    background: '#F5F5F5',
                    border: '1px solid #E0E0E0',
                    borderRadius: 16,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#333',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { e.target.style.background = '#C8102E'; e.target.style.color = '#fff'; e.target.style.borderColor = '#C8102E'; }}
                  onMouseLeave={e => { e.target.style.background = '#F5F5F5'; e.target.style.color = '#333'; e.target.style.borderColor = '#E0E0E0'; }}
                >
                  +{col}
                </button>
              ))}
            </div>

            <label style={S.label}>Message Body *</label>
            <textarea 
              value={form.message} 
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Today's fresh Mutton & Chicken available! 🥩&#10;Mutton starts at ₹650/kg&#10;Chicken at ₹180/kg..."
              style={{ ...S.input, height: 110, resize: 'vertical', lineHeight: 1.7 }}
            />

            <label style={S.label}>Promotional Image (Optional)</label>
            <div style={{ border: '2px dashed #E0E0E0', borderRadius: 10, padding: preview ? 0 : 24, textAlign: 'center', cursor: 'pointer', overflow: 'hidden', marginBottom: 12, position: 'relative' }}
              onClick={() => fileRef.current.click()}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImage(e.target.files[0])} />
              {preview ? (
                <div style={{ position: 'relative' }}>
                  <img src={preview} alt="preview" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
                  <button onClick={e => { e.stopPropagation(); setImage(null); setPreview(null) }} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.5)', border: 'none', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <><Image size={28} color="#C8102E" style={{ margin: '0 auto 8px' }} /><div style={{ fontSize: 13, color: '#888' }}>Click to upload image</div></>
              )}
            </div>

            <label style={S.label}>Footer (Optional)</label>
            <input 
              style={S.input} 
              value={form.footer} 
              onChange={e => setForm(f => ({ ...f, footer: e.target.value }))} 
              placeholder="e.g. Reply STOP to opt out"
            />
          </div>

          {/* Contacts selector */}
          <div style={S.card}>
            <div style={S.title}><Users size={17} color="#1565C0" />Select Recipients</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <button onClick={() => setUseAllContacts(true)} style={{ ...S.btn, padding: '8px 16px', background: useAllContacts ? '#C8102E' : '#F5F5F5', color: useAllContacts ? '#fff' : '#555' }}>
                All Contacts ({contacts.length})
              </button>
              <button onClick={() => setUseAllContacts(false)} style={{ ...S.btn, padding: '8px 16px', background: !useAllContacts ? '#C8102E' : '#F5F5F5', color: !useAllContacts ? '#fff' : '#555' }}>
                Select Specific
              </button>
            </div>
            {!useAllContacts && (
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #F0F0F0', borderRadius: 8 }}>
                {contacts.map(c => (
                  <div key={c._id} onClick={() => toggleContact(c.phone)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #F9F9F9', background: selected.includes(c.phone) ? '#FFF0F2' : '#fff' }}>
                    {selected.includes(c.phone) ? <CheckSquare size={15} color="#C8102E" /> : <Square size={15} color="#ccc" />}
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{c.phone} {c.name ? `(${c.name})` : ''}</span>
                    <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>{c.lastStatus || 'pending'}</span>
                  </div>
                ))}
                {contacts.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#aaa', fontSize: 13 }}>No contacts saved yet.</div>}
              </div>
            )}
          </div>

          <button onClick={send} disabled={sending} style={{ ...S.btn, background: 'linear-gradient(135deg,#C8102E,#9B0D22)', color: '#fff', width: '100%', justifyContext: 'center', padding: '13px 20px', fontSize: 14, opacity: sending ? 0.7 : 1, display: 'flex', justifyContent: 'center' }}>
            <Send size={16} />{sending ? 'Sending Template…' : `🚀 Send to ${useAllContacts ? contacts.length : selected.length} Contacts`}
          </button>
        </div>

        {/* Right: Preview + History */}
        <div>
          {/* Message Preview */}
          <div style={S.card}>
            <div style={S.title}><Eye size={17} color="#555" />Interactive Preview</div>
            <div style={{ background: '#E5DDD5', borderRadius: 10, padding: 14, fontFamily: 'inherit' }}>
              <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }}>
                {preview && <img src={preview} alt="img" style={{ width: '100%', borderRadius: 6, marginBottom: 8, maxHeight: 140, objectFit: 'cover' }} />}
                
                {/* Header preview */}
                {form.title && (
                  <div style={{ fontWeight: 'bold', fontSize: 13, color: '#000', marginBottom: 4 }}>
                    {PREVIEW_REPLACE(form.title)}
                  </div>
                )}
                
                {/* Message Body preview */}
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#333' }}>
                  {form.message ? PREVIEW_REPLACE(form.message) : <span style={{ color: '#aaa' }}>Type your message to preview…</span>}
                  {form.message && (
                    <div style={{ marginTop: 12, borderTop: '1px dashed #eee', paddingTop: 8 }}>
                      <strong>🛒 Are you interested?</strong><br />
                      1️⃣ Yes, Interested!<br />
                      2️⃣ No, Not Interested
                    </div>
                  )}
                </div>

                {/* Footer preview */}
                {form.footer && (
                  <div style={{ fontSize: 11, color: '#666', marginTop: 6, borderTop: '1px solid #f0f0f0', paddingTop: 4 }}>
                    {PREVIEW_REPLACE(form.footer)}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 10, color: '#888', textAlign: 'right', marginTop: 6 }}>WhatsApp preview</div>
            </div>
          </div>

          {/* Template History */}
          <div style={S.card}>
            <div style={S.title}><Clock size={17} color="#555" />Template History</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
              {templates.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#aaa', padding: 20, fontSize: 13 }}>No templates sent yet.</div>
              ) : templates.map(t => (
                <div key={t._id} style={{ border: '1px solid #F0F0F0', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContext: 'space-between', alignItems: 'flex-start', marginBottom: 6, justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#222' }}>{t.title}</span>
                    {statusBadge(t.status)}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.message}</div>
                  {t.footer && <div style={{ fontSize: 10, color: '#aaa', marginBottom: 6 }}>Footer: {t.footer}</div>}
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#666' }}>
                    <span>📤 {t.totalSent || 0}/{t.contacts?.length || 0} sent</span>
                    <span>✅ {t.interested || 0} interested</span>
                    <span>🛒 {t.ordersGenerated || 0} orders</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>{t.sentAt ? new Date(t.sentAt).toLocaleString('en-IN') : new Date(t.createdAt).toLocaleString('en-IN')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}