import React, { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { Clock, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

const S = {
  page:  { animation: 'fadeIn .35s ease' },
  card:  { background: '#fff', borderRadius: 14, padding: '22px 24px', boxShadow: '0 2px 12px rgba(0,0,0,.07)', border: '1px solid #F0F0F0', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 },
  input: { width: '100%', padding: '10px 13px', border: '1px solid #E0E0E0', borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'inherit', transition: 'border .2s', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: .4 },
  btn:   { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none', transition: 'all .18s' },
};

const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_LABELS = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };

const EMPTY_FORM = {
  title: 'Fresh Mutton Available Today! 🥩',
  message: 'Hi {Name}! 🥩 *Fresh mutton & chicken* arrived today.\n\nLimited stock — order now before it sells out!\n\nReply *ORDER* to place your order.',
  footer: 'FreshMeat Shop | Daily Fresh Delivery',
  scheduleTime: '08:00',
  repeatDaily: true,
  scheduleDays: [],
};

export default function ScheduleBroadcast() {
  const [schedules, setSchedules] = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [contacts, setContacts]   = useState([]);
  const [segFilter, setSegFilter] = useState('all');
  const [form, setForm]           = useState(EMPTY_FORM);

  useEffect(() => { fetchSchedules(); }, []);
  useEffect(() => { fetchContacts(); }, [segFilter]);

  const fetchSchedules = async () => {
    const { data } = await api.get('/api/template/schedules');
    if (data.success) setSchedules(data.schedules);
  };

  const fetchContacts = async () => {
    const q = segFilter !== 'all' ? `?segment=${segFilter}` : '';
    const { data } = await api.get(`/api/contacts${q}`);
    if (data.success) setContacts(data.contacts.filter(c => !c.optedOut));
  };

  const toggleDay = (day) => setForm(f => ({
    ...f, scheduleDays: f.scheduleDays.includes(day) ? f.scheduleDays.filter(d => d !== day) : [...f.scheduleDays, day],
  }));

  const handleSubmit = async () => {
    if (!form.message.trim() || !form.scheduleTime) { toast.error('Message and time are required'); return; }
    setSaving(true);
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, Array.isArray(v) ? JSON.stringify(v) : String(v)));
    body.append('phones', JSON.stringify(contacts.map(c => c.phone)));
    try {
      const { data } = await api.post('/api/template/schedule', body);
      if (data.success) { toast.success('Schedule created!'); setShowForm(false); setForm(EMPTY_FORM); fetchSchedules(); }
      else toast.error(data.message);
    } catch { toast.error('Failed to create schedule'); }
    setSaving(false);
  };

  const toggleActive = async (id) => {
    await api.put(`/api/template/schedule/${id}/toggle`);
    fetchSchedules();
  };

  const deleteSchedule = async (id) => {
    if (!window.confirm('Delete this schedule?')) return;
    await api.delete(`/api/template/schedule/${id}`);
    toast.success('Deleted');
    fetchSchedules();
  };

  return (
    <div style={S.page} className="animate-in">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>⏰ Scheduled Broadcasts</div>
        <button onClick={() => setShowForm(!showForm)} style={{ ...S.btn, background: showForm ? '#F5F5F5' : '#C8102E', color: showForm ? '#555' : '#fff' }}>
          <Plus size={14} />{showForm ? 'Cancel' : 'New Schedule'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={S.card}>
          <div style={S.title}><Plus size={16} color="#C8102E" />Create Scheduled Broadcast</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={S.label}>Title / Header</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Send Time</label>
              <input type="time" value={form.scheduleTime} onChange={e => setForm(f => ({ ...f, scheduleTime: e.target.value }))} style={S.input} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Message (use {'{Name}'} for personalisation)</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={5} style={{ ...S.input, resize: 'vertical', lineHeight: 1.7, marginTop: 4 }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Footer (optional)</label>
            <input value={form.footer} onChange={e => setForm(f => ({ ...f, footer: e.target.value }))} style={S.input} />
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={S.label}>Audience</label>
              <select value={segFilter} onChange={e => setSegFilter(e.target.value)} style={{ ...S.input, width: 200 }}>
                <option value="all">All contacts ({contacts.length})</option>
                <option value="vip">VIP only</option>
                <option value="regular">Regular only</option>
                <option value="new">New only</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Repeat days (leave all unselected = every day)</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {DAYS.map(d => (
                <button key={d} onClick={() => toggleDay(d)} style={{
                  ...S.btn, padding: '5px 12px', fontSize: 12,
                  background: form.scheduleDays.includes(d) ? '#C8102E' : '#F5F5F5',
                  color: form.scheduleDays.includes(d) ? '#fff' : '#555',
                }}>{DAY_LABELS[d]}</button>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
            📋 Sending to <strong>{contacts.length}</strong> contacts
          </div>

          <button onClick={handleSubmit} disabled={saving} style={{ ...S.btn, background: '#1A7A4A', color: '#fff' }}>
            {saving ? 'Saving…' : '✅ Save Schedule'}
          </button>
        </div>
      )}

      {/* Schedule list */}
      {schedules.length === 0 && !showForm ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 48 }}>
          <Clock size={48} color="#E0E0E0" style={{ margin: '0 auto 12px' }} />
          <div style={{ color: '#aaa', fontSize: 15, fontWeight: 600 }}>No schedules yet</div>
          <div style={{ color: '#ccc', fontSize: 13, marginTop: 4 }}>Create your first scheduled broadcast above</div>
        </div>
      ) : schedules.map(s => (
        <div key={s._id} style={{ ...S.card, borderLeft: `4px solid ${s.isActive ? '#1A7A4A' : '#E0E0E0'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>{s.title}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: s.isActive ? '#E8F5E9' : '#F5F5F5', color: s.isActive ? '#1A7A4A' : '#888' }}>
                  {s.isActive ? 'Active' : 'Paused'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>{s.message.slice(0, 100)}{s.message.length > 100 ? '…' : ''}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#888', flexWrap: 'wrap' }}>
                <span>⏰ {s.scheduleTime}</span>
                <span>👥 {s.contacts?.length || 0} contacts</span>
                <span>📅 {s.scheduleDays?.length === 0 ? 'Every day' : s.scheduleDays?.map(d => DAY_LABELS[d]).join(', ')}</span>
                {s.nextRunAt && s.isActive && <span style={{ color: '#1A7A4A' }}>Next: {new Date(s.nextRunAt).toLocaleString('en-IN')}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 14, flexShrink: 0 }}>
              <button onClick={() => toggleActive(s._id)} style={{ ...S.btn, padding: '6px 12px', fontSize: 12, background: s.isActive ? '#FFEBEE' : '#E8F5E9', color: s.isActive ? '#C8102E' : '#1A7A4A', border: '1px solid currentColor' }}>
                {s.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                {s.isActive ? 'Pause' : 'Resume'}
              </button>
              <button onClick={() => deleteSchedule(s._id)} style={{ ...S.btn, padding: '6px 10px', fontSize: 12, background: '#FFEBEE', color: '#C8102E', border: '1px solid #FECDD3' }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}