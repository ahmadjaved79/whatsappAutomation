import React, { useState, useEffect } from 'react';
import api from '../api';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const S = {
  page:   { animation: 'fadeIn .35s ease' },
  card:   { background: '#fff', borderRadius: 14, padding: '22px 24px', boxShadow: '0 2px 12px rgba(0,0,0,.07)', border: '1px solid #F0F0F0', marginBottom: 16 },
  title:  { fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 },
  metric: { background: '#FAFAFA', borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 130, borderLeft: '3px solid #E0E0E0' },
};

export default function RevenueReports() {
  const [period, setPeriod]     = useState('daily');
  const [revenue, setRevenue]   = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [summary, setSummary]   = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => { fetchAll(); }, [period]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [r, t, s] = await Promise.all([
        api.get(`/api/analytics/revenue?period=${period}`),
        api.get('/api/analytics/top-items'),
        api.get('/api/analytics/summary'),
      ]);
      if (r.data.success) setRevenue(formatRevenue(r.data.data, period));
      if (t.data.success) setTopItems(t.data.data.slice(0, 6));
      if (s.data.success) setSummary(s.data.summary);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const formatRevenue = (data, p) => data.map(d => ({
    label: p === 'monthly' ? `${d._id.year}-${String(d._id.month).padStart(2,'0')}` :
           p === 'weekly'  ? `W${d._id.week}` :
           `${String(d._id.day).padStart(2,'0')}/${String(d._id.month).padStart(2,'0')}`,
    revenue: Math.round(d.revenue),
    orders:  d.orders,
  }));

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>Loading reports…</div>;

  return (
    <div style={S.page} className="animate-in">

      {/* Summary metrics */}
      {summary && (
        <div style={S.card}>
          <div style={S.title}>📊 Overview</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: "Today's Revenue",  value: `₹${summary.revenue.today.toLocaleString('en-IN')}`,  sub: `${summary.orders.today} orders`,  accent: '#1A7A4A' },
              { label: 'This Week',        value: `₹${summary.revenue.week.toLocaleString('en-IN')}`,   sub: `${summary.orders.week} orders`,   accent: '#1565C0' },
              { label: 'This Month',       value: `₹${summary.revenue.month.toLocaleString('en-IN')}`,  sub: `${summary.orders.month} orders`,  accent: '#C8102E' },
              { label: 'All Time',         value: `₹${summary.revenue.total.toLocaleString('en-IN')}`,  sub: `${summary.orders.total} total`,   accent: '#D4A017' },
              { label: 'Pending Orders',   value: summary.orders.pending,  sub: 'in progress', accent: '#E05C00' },
            ].map((m, i) => (
              <div key={i} style={{ ...S.metric, borderLeftColor: m.accent }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: m.accent }}>{m.value}</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{m.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue chart */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ ...S.title, marginBottom: 0 }}>📈 Revenue & Orders</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['daily','weekly','monthly'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '5px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', border: '1px solid',
                fontWeight: 600, background: period === p ? '#C8102E' : '#F5F5F5',
                color: period === p ? '#fff' : '#555', borderColor: period === p ? '#C8102E' : '#E0E0E0',
              }}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
            ))}
          </div>
        </div>
        {revenue.length === 0
          ? <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>No data for this period</div>
          : <ResponsiveContainer width="100%" height={260}>
              <BarChart data={revenue} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} stroke="#F5F5F5" />
                <YAxis yAxisId="rev" tick={{ fontSize: 11, fill: '#888' }} tickFormatter={v => `₹${v}`} />
                <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 11, fill: '#888' }} />
                <Tooltip formatter={(v, n) => n === 'revenue' ? [`₹${v}`, 'Revenue'] : [v, 'Orders']} />
                <Legend />
                <Bar yAxisId="rev" dataKey="revenue" fill="#C8102E" radius={[4,4,0,0]} name="Revenue (₹)" />
                <Bar yAxisId="ord" dataKey="orders"  fill="#1A7A4A" radius={[4,4,0,0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
        }
      </div>

      {/* Top items */}
      <div style={S.card}>
        <div style={S.title}>🏆 Top Selling Items</div>
        {topItems.length === 0
          ? <div style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>No sales data yet</div>
          : topItems.map((item, i) => {
              const maxRev = topItems[0]?.revenue || 1;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 22, fontSize: 12, color: '#888', textAlign: 'right' }}>#{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>{item._id}</div>
                    <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3 }}>
                      <div style={{ height: 6, width: `${(item.revenue / maxRev) * 100}%`, background: '#C8102E', borderRadius: 3 }} />
                    </div>
                  </div>
                  <div style={{ minWidth: 90, textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>₹{Math.round(item.revenue).toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>{item.orders} orders</div>
                  </div>
                </div>
              );
            })
        }
      </div>

      {/* Segments */}
      {summary && (
        <div style={S.card}>
          <div style={S.title}>👥 Customer Segments</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'VIP',     count: summary.contacts.vip,     color: '#7c3aed', bg: '#F5F3FF', note: '5+ orders' },
              { label: 'Regular', count: summary.contacts.regular, color: '#1565C0', bg: '#E3F2FD', note: '2–4 orders' },
              { label: 'New',     count: summary.contacts.new,     color: '#1A7A4A', bg: '#E8F5E9', note: '0–1 orders' },
            ].map(s => (
              <div key={s.label} style={{ ...S.metric, background: s.bg, borderLeftColor: s.color, minWidth: 120 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.label}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{s.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}