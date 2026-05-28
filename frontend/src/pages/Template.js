import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import {
  Send, Image as Img, Users, CheckSquare, Square, Clock,
  CheckCircle, X, Eye, RefreshCw, Search, Upload
} from 'lucide-react';

/* ── Inline style objects ───────────────────────────────────── */
const S = {
  page:  { animation: 'fadeIn .35s ease' },
  grid:  { display: 'grid', gridTemplateColumns: '1fr 400px', gap: 20, alignItems: 'start' },
  card:  { background: '#fff', borderRadius: 16, padding: '22px 24px', boxShadow: '0 2px 12px rgba(0,0,0,.07)', border: '1px solid #f0f0f0', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 },
  label: { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 },
  input: { width: '100%', padding: '11px 13px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'inherit', transition: 'border .2s', marginBottom: 12, boxSizing: 'border-box', background: '#fafafa' },
  btn:   { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none', transition: 'all .18s' },
};

const PREVIEW_REPLACE = (text) => !text ? '' : text
  .replace(/{Name}/gi,  'Ramesh')
  .replace(/{Email}/gi, 'ramesh@gmail.com')
  .replace(/{Phone}/gi, '9876543210');

const STATUS = {
  sending:   { bg: '#fff7ed', color: '#c2410c', dot: '#f97316', label: 'Sending'   },
  completed: { bg: '#f0fdf4', color: '#15803d', dot: '#22c55e', label: 'Completed' },
  failed:    { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444', label: 'Failed'    },
  scheduled: { bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6', label: 'Scheduled' },
  draft:     { bg: '#f8fafc', color: '#64748b', dot: '#94a3b8', label: 'Draft'     },
};

export default function Template() {
  const [form, setForm]                   = useState({ title: 'Fresh Stock Available! 🥩', message: '', footer: '' });
  const [image, setImage]                 = useState(null);
  const [preview, setPreview]             = useState(null);
  const [contacts, setContacts]           = useState([]);
  const [selected, setSelected]           = useState([]);
  const [sending, setSending]             = useState(false);
  const [templates, setTemplates]         = useState([]);
  const [recipientMode, setRecipientMode] = useState('all');
  const [contactSearch, setContactSearch] = useState('');
  const [expandedId, setExpandedId]       = useState(null);
  const [dragging, setDragging]           = useState(false);

  const fileRef  = useRef();
  const titleRef = useRef();
  const msgRef   = useRef();

  useEffect(() => { loadContacts(); loadTemplates(); }, []);

  const loadContacts = async () => {
    try {
      const { data } = await api.get('/api/contacts');
      if (data.success) setContacts(data.contacts.filter(c => !c.optedOut));
    } catch {}
  };

  const loadTemplates = async () => {
    try {
      const { data } = await api.get('/api/template');
      console.log('Templates API response:', data.success, 'count:', data.templates?.length);
      if (data.success) {
        console.log('First template sample:', JSON.stringify(data.templates?.[0]));
        setTemplates(data.templates || []);
      }
    } catch (e) {
      console.error('loadTemplates error:', e);
    }
  };

  const handleImage = (file) => {
    if (!file || !file.type.startsWith('image/')) { toast.error('Select an image file'); return; }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const insertVar = (ref, field, v) => {
    const el = ref.current; if (!el) return;
    const s = el.selectionStart || 0, e = el.selectionEnd || 0;
    const val = form[field];
    setForm(f => ({ ...f, [field]: val.substring(0,s) + `{${v}}` + val.substring(e) }));
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = s + v.length + 2; }, 0);
  };

  const toggleContact = (phone) =>
    setSelected(s => s.includes(phone) ? s.filter(p => p !== phone) : [...s, phone]);

  const send = async () => {
    if (!form.message.trim()) { toast.error('Enter a message body'); return; }
    const phones = recipientMode === 'all' ? contacts.map(c => c.phone) : selected;
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
        setForm(f => ({ ...f, message: '', footer: '' }));
        setImage(null); setPreview(null);
        setTimeout(loadTemplates, 1500);
      } else toast.error(data.message);
    } catch { toast.error('Failed to send'); }
    setSending(false);
  };

  const recipientCount = recipientMode === 'all' ? contacts.length : selected.length;
  const filtered = contacts.filter(c =>
    !contactSearch ||
    (c.name||'').toLowerCase().includes(contactSearch.toLowerCase()) ||
    (c.phone||'').includes(contactSearch)
  );

  /* ── Chips ─────────────────────────────────────────────── */
  const VarChip = ({ field, ref_, v }) => (
    <button onClick={() => insertVar(ref_, field, v)} style={{
      padding:'2px 9px', borderRadius:20, border:'1px dashed #c8102e',
      background:'#fff5f5', color:'#c8102e', fontSize:11, fontWeight:600,
      cursor:'pointer', fontFamily:'monospace'
    }}>{`{${v}}`}</button>
  );

  return (
    <div style={S.page} className="animate-in">

      {/* Top bar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:0 }}>Broadcast Templates</h1>
          <p style={{ fontSize:13, color:'#64748b', marginTop:4 }}>Compose and send WhatsApp campaigns to your customers</p>
        </div>
        <button onClick={loadTemplates} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:10, border:'1px solid #e2e8f0', background:'#fff', color:'#475569', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div style={S.grid}>

        {/* ── LEFT: Compose ─────────────────────────────── */}
        <div>
          {/* Compose card */}
          <div style={S.card}>
            <div style={S.title}><Send size={16} color="#c8102e" />Compose Message</div>

            {/* Header */}
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <label style={{ ...S.label, margin:0 }}>Header Title</label>
                <div style={{ display:'flex', gap:5 }}>
                  {['Name','Phone','Email'].map(v => <VarChip key={v} field="title" ref_={titleRef} v={v} />)}
                </div>
              </div>
              <input ref={titleRef} style={S.input} value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Fresh Stock Available! 🥩" />
            </div>

            {/* Body */}
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <label style={{ ...S.label, margin:0 }}>Message Body *</label>
                <div style={{ display:'flex', gap:5 }}>
                  {['Name','Phone','Email'].map(v => <VarChip key={v} field="message" ref_={msgRef} v={v} />)}
                </div>
              </div>
              <textarea ref={msgRef} rows={5} style={{ ...S.input, resize:'vertical', lineHeight:1.7, marginBottom:4 }}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Write your message... Use {Name} to personalise." />
              <div style={{ fontSize:11, color:'#94a3b8', textAlign:'right' }}>{form.message.length} characters</div>
            </div>

            {/* Footer */}
            <div>
              <label style={S.label}>Footer (Optional)</label>
              <input style={{ ...S.input, marginBottom:0 }} value={form.footer}
                onChange={e => setForm(f => ({ ...f, footer: e.target.value }))}
                placeholder="e.g. FreshMeat Shop | Order now 🛒" />
            </div>
          </div>

          {/* Image card */}
          <div style={S.card}>
            <div style={{ ...S.title, justifyContent:'space-between' }}>
              <span style={{ display:'flex', alignItems:'center', gap:8 }}><Img size={16} color="#2563eb" />Attach Image</span>
              {image && <button onClick={() => { setImage(null); setPreview(null); }}
                style={{ display:'flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:600, color:'#dc2626', background:'#fef2f2', border:'none', borderRadius:7, padding:'4px 10px', cursor:'pointer' }}>
                <X size={12} /> Remove
              </button>}
            </div>
            {preview ? (
              <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid #e2e8f0' }}>
                <img src={preview} alt="" style={{ width:'100%', maxHeight:200, objectFit:'cover', display:'block' }} />
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleImage(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current?.click()}
                style={{ border:`2px dashed ${dragging?'#c8102e':'#cbd5e1'}`, borderRadius:12, padding:'32px 24px', textAlign:'center', cursor:'pointer', background: dragging ? '#fff5f5' : '#f8fafc' }}
              >
                <Upload size={26} color={dragging?'#c8102e':'#94a3b8'} style={{ margin:'0 auto 8px', display:'block' }} />
                <div style={{ fontSize:13, color:'#64748b' }}>Drag & drop or <span style={{ color:'#c8102e', textDecoration:'underline' }}>click to upload</span></div>
                <div style={{ fontSize:11, color:'#94a3b8', marginTop:4 }}>PNG, JPG, WEBP up to 5MB</div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => handleImage(e.target.files[0])} />
          </div>

          {/* Recipients card */}
          <div style={S.card}>
            <div style={{ ...S.title, justifyContent:'space-between' }}>
              <span style={{ display:'flex', alignItems:'center', gap:8 }}><Users size={16} color="#16a34a" />Recipients</span>
              <span style={{ background:'#fef2f2', color:'#c8102e', fontSize:11.5, fontWeight:700, padding:'3px 10px', borderRadius:20 }}>{recipientCount} selected</span>
            </div>

            {/* Radio options */}
            <div style={{ display:'flex', gap:12, marginBottom: recipientMode === 'select' ? 16 : 0 }}>
              {[
                { val:'all',    label:'All Contacts',    sub:`${contacts.length} opted-in` },
                { val:'select', label:'Select Contacts', sub:'Choose specific' },
              ].map(opt => (
                <label key={opt.val} onClick={() => setRecipientMode(opt.val)} style={{
                  flex:1, display:'flex', alignItems:'center', gap:12, padding:'13px 15px',
                  border:`1.5px solid ${recipientMode===opt.val?'#c8102e':'#e2e8f0'}`,
                  borderRadius:12, cursor:'pointer',
                  background: recipientMode===opt.val ? '#fff5f5' : '#fafafa',
                  boxShadow: recipientMode===opt.val ? '0 2px 10px rgba(200,16,46,0.1)' : 'none'
                }}>
                  {/* Radio circle */}
                  <span style={{
                    width:18, height:18, borderRadius:'50%', flexShrink:0,
                    border:`2px solid ${recipientMode===opt.val?'#c8102e':'#cbd5e1'}`,
                    background: recipientMode===opt.val ? '#c8102e' : '#fff',
                    display:'flex', alignItems:'center', justifyContent:'center'
                  }}>
                    {recipientMode===opt.val && <span style={{ width:6, height:6, borderRadius:'50%', background:'#fff', display:'block' }} />}
                  </span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:'#64748b' }}>{opt.sub}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Contact picker */}
            {recipientMode === 'select' && (
              <div style={{ animation:'fadeIn .2s ease' }}>
                <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                  <div style={{ flex:1, display:'flex', alignItems:'center', gap:7, background:'#f8fafc', border:'1.5px solid #e2e8f0', borderRadius:9, padding:'8px 12px' }}>
                    <Search size={13} color="#94a3b8" />
                    <input placeholder="Search contacts..." value={contactSearch}
                      onChange={e => setContactSearch(e.target.value)}
                      style={{ border:'none', background:'transparent', outline:'none', fontSize:13, color:'#1e293b', width:'100%', fontFamily:'inherit' }} />
                  </div>
                  <button onClick={() => setSelected(contacts.map(c=>c.phone))} style={{ padding:'6px 12px', border:'1px solid #e2e8f0', borderRadius:8, background:'#fff', fontSize:11.5, fontWeight:700, color:'#475569', cursor:'pointer' }}>All</button>
                  <button onClick={() => setSelected([])} style={{ padding:'6px 12px', border:'1px solid #e2e8f0', borderRadius:8, background:'#fff', fontSize:11.5, fontWeight:700, color:'#475569', cursor:'pointer' }}>None</button>
                </div>
                <div style={{ maxHeight:220, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:10 }}>
                  {filtered.length === 0
                    ? <div style={{ padding:20, textAlign:'center', color:'#94a3b8', fontSize:13 }}>No contacts found</div>
                    : filtered.map(c => {
                      const isSel = selected.includes(c.phone);
                      return (
                        <div key={c.phone} onClick={() => toggleContact(c.phone)}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'1px solid #f1f5f9', cursor:'pointer', background: isSel ? '#fff5f5' : '#fff' }}>
                          {isSel ? <CheckSquare size={14} color="#c8102e" /> : <Square size={14} color="#94a3b8" />}
                          <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#c8102e,#ff5c7a)', color:'#fff', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            {(c.name||c.phone)[0].toUpperCase()}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name || 'Unknown'}</div>
                            <div style={{ fontSize:11, color:'#94a3b8' }}>+91 {c.phone}</div>
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              </div>
            )}
          </div>

          {/* Send button */}
          <button onClick={send} disabled={sending || !form.message.trim() || recipientCount === 0}
            style={{ width:'100%', padding:'15px 28px', background: sending ? '#94a3b8' : 'linear-gradient(135deg,#c8102e,#e8304a)', color:'#fff', border:'none', borderRadius:13, fontSize:14.5, fontWeight:700, cursor: sending?'wait':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, boxShadow:'0 4px 16px rgba(200,16,46,0.3)', opacity: (!form.message.trim()||recipientCount===0) ? 0.6 : 1 }}>
            {sending
              ? <><span style={{ width:16,height:16,border:'2px solid rgba(255,255,255,.35)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite',display:'inline-block' }} />Sending to {recipientCount} contacts…</>
              : <><Send size={16} />Send to {recipientCount} Contact{recipientCount!==1?'s':''}</>
            }
          </button>
        </div>

        {/* ── RIGHT: Preview + History ───────────────────── */}
        <div>

          {/* WA Preview */}
          <div style={S.card}>
            <div style={S.title}><Eye size={16} color="#16a34a" />Live Preview</div>
            <div style={{ borderRadius:14, overflow:'hidden', border:'1px solid #e2e8f0', boxShadow:'0 4px 16px rgba(0,0,0,.06)' }}>
              {/* WA header */}
              <div style={{ background:'#075e54', padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:34,height:34,borderRadius:'50%',background:'#25d366',color:'#fff',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center' }}>FM</div>
                <div>
                  <div style={{ color:'#fff', fontSize:13, fontWeight:600 }}>FreshMeat Shop</div>
                  <div style={{ color:'rgba(255,255,255,.7)', fontSize:11 }}>online</div>
                </div>
              </div>
              {/* WA body */}
              <div style={{ background:'#ece5dd', padding:'14px 12px', minHeight:120 }}>
                {preview && <div style={{ borderRadius:10, overflow:'hidden', marginBottom:8 }}>
                  <img src={preview} alt="" style={{ width:'100%', maxHeight:140, objectFit:'cover', display:'block' }} />
                </div>}
                <div style={{ background:'#fff', borderRadius:'0 12px 12px 12px', padding:'12px 14px', maxWidth:'90%', boxShadow:'0 1px 3px rgba(0,0,0,.1)' }}>
                  {form.title && <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginBottom:5 }}>{PREVIEW_REPLACE(form.title)}</div>}
                  <div style={{ fontSize:12.5, color:'#334155', lineHeight:1.55, whiteSpace:'pre-wrap' }}>
                    {form.message ? PREVIEW_REPLACE(form.message) : <span style={{ color:'#94a3b8', fontStyle:'italic' }}>Your message will appear here…</span>}
                  </div>
                  {form.footer && <div style={{ fontSize:11.5, color:'#64748b', fontStyle:'italic', marginTop:6, borderTop:'1px solid #f1f5f9', paddingTop:6 }}>{PREVIEW_REPLACE(form.footer)}</div>}
                  <div style={{ fontSize:12, color:'#1e293b', background:'#f8fafc', borderRadius:8, padding:'8px 10px', marginTop:8, lineHeight:1.7, borderLeft:'3px solid #25d366' }}>
                    🛒 <strong>Are you interested?</strong><br />
                    1️⃣ Yes, Interested!<br />
                    2️⃣ No, Not Interested
                  </div>
                  <div style={{ fontSize:10.5, color:'#94a3b8', textAlign:'right', marginTop:6 }}>
                    {new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})} ✓✓
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Campaign History */}
          <div style={S.card}>
            <div style={{ ...S.title, justifyContent:'space-between' }}>
              <span style={{ display:'flex', alignItems:'center', gap:8 }}><Clock size={16} color="#d97706" />Campaign History</span>
              <span style={{ background:'#f1f5f9', color:'#475569', fontSize:11.5, fontWeight:700, padding:'3px 10px', borderRadius:20 }}>{templates.length}</span>
            </div>

            {templates.length === 0 ? (
              <p style={{ textAlign:'center', color:'#aaa', padding:20, fontSize:13 }}>No campaigns yet.</p>
            ) : (
              <div style={{ maxHeight:500, overflowY:'auto' }}>
                {templates.map((t, i) => {
                  const id = String(t._id || i);
                  const isOpen = expandedId === id;
                  const st = t.status || 'draft';
                  const stColor = st==='completed'?'#15803d':st==='sending'?'#c2410c':st==='failed'?'#dc2626':'#64748b';
                  const stBg   = st==='completed'?'#f0fdf4':st==='sending'?'#fff7ed':st==='failed'?'#fef2f2':'#f8fafc';
                  try {
                    return (
                      <div key={id} style={{ borderRadius:10, border:'1px solid #e2e8f0', background:'#fafafa', overflow:'hidden', marginBottom:8 }}>
                        <div onClick={() => setExpandedId(isOpen ? null : id)}
                          style={{ padding:'10px 14px', cursor:'pointer', background: isOpen?'#fff5f5':'#fff' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                            <span style={{ fontWeight:700, fontSize:13, color:'#111', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {t.title || '(no title)'}
                            </span>
                            <span style={{ background:stBg, color:stColor, fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, whiteSpace:'nowrap' }}>
                              {st}
                            </span>
                          </div>
                          <div style={{ display:'flex', gap:12, marginTop:5, fontSize:11, color:'#666' }}>
                            <span>📤 {t.totalSent||0}</span>
                            <span>✅ {t.interested||0}</span>
                            <span>❌ {t.notInterested||0}</span>
                            <span>🛒 {t.ordersGenerated||0}</span>
                            <span style={{ marginLeft:'auto', color:'#aaa' }}>
                              {t.sentAt ? new Date(t.sentAt).toLocaleDateString('en-IN') : ''}
                            </span>
                          </div>
                        </div>
                        {isOpen && (
                          <div style={{ borderTop:'1px solid #eee', padding:'10px 14px', background:'#fff' }}>
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                              {[
                                {l:'Sent',      v:t.totalSent||0,       bg:'#eff6ff',c:'#2563eb'},
                                {l:'Interested',v:t.interested||0,      bg:'#dcfce7',c:'#16a34a'},
                                {l:'Not Int.',  v:t.notInterested||0,   bg:'#fef2f2',c:'#dc2626'},
                                {l:'Orders',    v:t.ordersGenerated||0, bg:'#fef3c7',c:'#d97706'},
                              ].map(s=>(
                                <div key={s.l} style={{flex:1,minWidth:55,background:s.bg,color:s.c,borderRadius:8,padding:'8px 4px',textAlign:'center'}}>
                                  <div style={{fontSize:18,fontWeight:800}}>{s.v}</div>
                                  <div style={{fontSize:10,opacity:.8}}>{s.l}</div>
                                </div>
                              ))}
                            </div>
                            {t.message && (
                              <div style={{fontSize:11.5,color:'#555',fontStyle:'italic',borderLeft:'3px solid #c8102e',paddingLeft:8}}>
                                "{String(t.message).slice(0,100)}…"
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  } catch(err) {
                    return <div key={i} style={{padding:8,color:'red',fontSize:11}}>Item {i} error: {String(err)}</div>;
                  }
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}