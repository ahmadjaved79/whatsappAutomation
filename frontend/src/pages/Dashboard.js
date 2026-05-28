import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { ShoppingBag, TrendingUp, Clock, IndianRupee, Wifi, WifiOff, Loader2, RefreshCw, QrCode, Power } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './Dashboard.css';

const fmt = (n) => {
  if (n >= 100000) return '₹' + (n/100000).toFixed(1) + 'L';
  if (n >= 1000)   return '₹' + (n/1000).toFixed(1) + 'K';
  return '₹' + n;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p className="tooltip-date">{label}</p>
        <p className="tooltip-item">
          <span>Orders:</span>
          <span style={{ fontWeight:800, color:'#c8102e' }}>{payload[0]?.value || 0}</span>
        </p>
        <p className="tooltip-item">
          <span>Revenue:</span>
          <span style={{ fontWeight:800, color:'#10b981' }}>₹{(payload[1]?.value || 0).toLocaleString('en-IN')}</span>
        </p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const [stats,      setStats]      = useState(null);
  const [orders,     setOrders]     = useState([]);
  const [wpp,        setWpp]        = useState({ status:'DISCONNECTED', qr:null });
  const [loading,    setLoading]    = useState(true);
  const [connecting, setConnecting] = useState(false);

  const pollStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/api/whatsapp/status');
      setWpp(prev => ({
        status: data.status,
        qr: data.status === 'CONNECTED' ? null : (data.qr || prev.qr)
      }));
      if (data.status !== 'INITIALIZING') setConnecting(false);
    } catch {}
  }, []);

  useEffect(() => {
    loadData();
    pollStatus();
    const interval = setInterval(pollStatus, 5000);

    const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    let es = null, retryDelay = 3000, retryTimer = null, destroyed = false;

    const connectSSE = () => {
      if (destroyed) return;
      try {
        es = new EventSource(BASE + '/api/whatsapp/status/stream');
        es.onopen = () => { retryDelay = 3000; };
        es.onmessage = (e) => {
          try {
            const d = JSON.parse(e.data);
            setWpp(prev => ({ status:d.status, qr: d.status==='CONNECTED' ? null : (d.qr || prev.qr) }));
            if (d.status !== 'INITIALIZING') setConnecting(false);
          } catch {}
        };
        es.onerror = () => {
          es.close(); es = null;
          if (!destroyed) {
            retryTimer = setTimeout(() => { retryDelay = Math.min(retryDelay*2, 30000); connectSSE(); }, retryDelay);
          }
        };
      } catch {}
    };
    connectSSE();

    return () => {
      destroyed = true;
      clearInterval(interval);
      clearTimeout(retryTimer);
      if (es) es.close();
    };
  }, [pollStatus]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, o] = await Promise.all([
        api.get('/api/orders/stats/summary'),
        api.get('/api/orders'),
      ]);
      if (s.data.success) setStats(s.data.stats);
      if (o.data.success) setOrders(o.data.orders);
    } catch { toast.error('Failed to load data'); }
    setLoading(false);
  };

  const connectWpp = async () => {
    setConnecting(true);
    try {
      await api.post('/api/whatsapp/connect');
      toast.success('Initialising… QR will appear shortly');
    } catch { toast.error('Connection failed'); setConnecting(false); }
  };

  const disconnectWpp = async () => {
    try {
      await api.post('/api/whatsapp/disconnect');
      setWpp({ status:'DISCONNECTED', qr:null });
      toast.success('Disconnected');
    } catch { toast.error('Failed'); }
  };

  const getChartData = () => {
    const data = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      data.push({
        date: d.toLocaleDateString('en-IN', { day:'numeric', month:'short' }),
        orders: 0,
        revenue: 0,
        rawDate: d,
      });
    }
    // Use ALL orders (not sliced) so chart matches totalRevenue stat
    orders.forEach(order => {
      const orderDate = new Date(order.createdAt);
      data.forEach(day => {
        if (orderDate.toDateString() === day.rawDate.toDateString()) {
          day.orders += 1;
          if (order.status === 'delivered') {
            day.revenue += order.totalAmount || 0;
          }
        }
      });
    });
    return data;
  };

  const statCards = [
    { label:'Total Orders',    value: stats?.totalOrders ?? 0,     icon:<ShoppingBag size={20}/>,  classType:'card-orange', iconBg:'#FFF0E0', iconColor:'#E05C00' },
    { label:"Today's Orders",  value: stats?.todayOrders ?? 0,     icon:<TrendingUp size={20}/>,   classType:'card-green',  iconBg:'#D1FADF', iconColor:'#1A7A4A' },
    { label:'Pending',         value: stats?.pendingOrders ?? 0,   icon:<Clock size={20}/>,         classType:'card-gold',   iconBg:'#FDF3D9', iconColor:'#D4A017' },
    { label:'Total Revenue',   value: stats ? `₹${(stats.totalRevenue||0).toLocaleString('en-IN')}` : '₹0',
      icon:<IndianRupee size={20}/>, classType:'card-red', iconBg:'#F5D0D7', iconColor:'#C8102E' },
  ];

  const isConnected  = wpp.status === 'CONNECTED';
  const isLoading    = wpp.status === 'INITIALIZING' || connecting;
  const wppBannerClass = `wpp-status-banner wpp-${wpp.status.toLowerCase()}`;
  const dailyTarget  = 10;
  const todayCount   = stats?.todayOrders ?? 0;
  const targetPct    = Math.min(100, Math.round((todayCount / dailyTarget) * 100));
  const chartData    = getChartData();
  const maxRevenue   = Math.max(...chartData.map(d => d.revenue), 1);

  return (
    <div className="dashboard-page animate-in">

      {/* ── Stat Cards ──────────────────────────────── */}
      <div className="stats-grid">
        {statCards.map(({ label, value, icon, classType, iconBg, iconColor }) => (
          <div key={label} className={`dash-card ${classType}`}>
            <div className="card-header">
              <span className="stat-label">{label}</span>
              <span className="stat-icon-box" style={{ background:iconBg, color:iconColor }}>{icon}</span>
            </div>
            <div className="stat-value" style={{ color:iconColor }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Main Layout ──────────────────────────────── */}
      <div className="layout-grid">

        {/* Left */}
        <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

          {/* Chart */}
          <div className="dash-card chart-section">
            <div className="section-title-container">
              <span className="section-title">Sales & Order Trends</span>
              <div className="chart-legend">
                <span><span style={{ background:'#c8102e', width:10, height:10, borderRadius:'50%', display:'inline-block', marginRight:5 }}/>Orders</span>
                <span><span style={{ background:'#10b981', width:10, height:10, borderRadius:'50%', display:'inline-block', marginRight:5 }}/>Revenue (Delivered)</span>
              </div>
            </div>

            <div style={{ width:'100%', height:260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top:10, right:10, left:20, bottom:0 }}>
                  <defs>
                    <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#c8102e" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#c8102e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize:11, fill:'#64748b', fontWeight:600 }} stroke="#e2e8f0" />
                  <YAxis
                    tick={{ fontSize:11, fill:'#64748b' }}
                    stroke="#e2e8f0"
                    width={60}
                    tickFormatter={(v) => v >= 1000 ? `₹${(v/1000).toFixed(0)}K` : v}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="orders"  stroke="#c8102e" strokeWidth={3} fillOpacity={1} fill="url(#colorOrders)"  />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Orders */}
          <div className="dash-card panel-left">
            <div className="section-title-container">
              <span className="section-title">Recent Orders</span>
              <button onClick={loadData} className="btn-secondary"><RefreshCw size={13}/>Refresh</button>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>{['Order ID','Phone','Items','Amount','Status'].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign:'center', color:'#aaa', padding:28 }}>No orders yet.</td></tr>
                  ) : orders.slice(0, 10).map(o => (
                    <tr key={o._id}>
                      <td style={{ fontWeight:700, color:'#c8102e', fontFamily:'monospace' }}>{o.orderId}</td>
                      <td>+91 {o.customerPhone}</td>
                      <td>{o.items?.length || 0} item{o.items?.length !== 1 ? 's' : ''}</td>
                      <td style={{ fontWeight:700 }}>₹{(o.totalAmount||0).toLocaleString('en-IN')}</td>
                      <td><span className={`status-badge status-${o.status}`}>{o.status?.replace(/_/g,' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

          {/* WhatsApp Connection */}
          <div className="dash-card panel-right">
            <div className="section-title-container" style={{ marginBottom:18 }}>
              <span className="section-title">WhatsApp Connection</span>
            </div>
            <div className="wpp-connection-container">
              <div className={wppBannerClass}>
                <span className="status-indicator-light"/>
                <span style={{ fontWeight:800, fontSize:13 }}>
                  {{ CONNECTED:'Connected & Ready', DISCONNECTED:'Not Connected', QR_READY:'Scan QR Code Below', INITIALIZING:'Connecting...', ERROR:'Connection Error' }[wpp.status] || wpp.status}
                </span>
              </div>
              {wpp.qr && wpp.status === 'QR_READY' && (
                <div className="qr-box">
                  <div style={{ fontSize:12, color:'#64748b', marginBottom:10, fontWeight:700 }}>📱 WhatsApp → Linked Devices → Link a Device</div>
                  <div className="qr-image-wrapper"><img src={wpp.qr} alt="QR" className="qr-image"/></div>
                  <div style={{ fontSize:11, color:'#aaa', marginTop:8 }}>QR refreshes every 20 seconds</div>
                </div>
              )}
              {wpp.status === 'QR_READY' && !wpp.qr && (
                <div style={{ textAlign:'center', padding:'20px 0', color:'#d97706', fontSize:13, fontWeight:700 }}>
                  <Loader2 size={18} className="spin" style={{ marginRight:8 }}/>Loading QR…
                </div>
              )}
              {!isConnected ? (
                <button onClick={connectWpp} disabled={isLoading} className="btn-primary" style={{ width:'100%' }}>
                  {isLoading ? <><Loader2 size={15} className="spin"/>Connecting…</> : <><QrCode size={15}/>Connect WhatsApp</>}
                </button>
              ) : (
                <button onClick={disconnectWpp} className="btn-danger" style={{ width:'100%' }}>
                  <Power size={15}/>Disconnect
                </button>
              )}
              <div className="guide-box">
                <strong style={{ display:'block', marginBottom:6 }}>Quick Connection Guide:</strong>
                <ol style={{ margin:0, paddingLeft:18 }}>
                  <li>Click <strong>"Connect WhatsApp"</strong></li>
                  <li>Scan the QR code when it loads</li>
                  <li>Go to <strong>Linked Devices</strong> on your phone</li>
                  <li>Scan and verify session ✅</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Daily Target */}
          <div className="dash-card panel-right">
            <div className="section-title-container" style={{ marginBottom:16 }}>
              <span className="section-title">Daily Sales Target</span>
            </div>
            <div className="progress-container">
              <div className="progress-header">
                <span>Today's Progress</span>
                <span style={{ color:'#c8102e', fontWeight:800 }}>{todayCount} / {dailyTarget} Orders ({targetPct}%)</span>
              </div>
              <div className="progress-bar-wrapper">
                <div className="progress-bar-fill" style={{ width:`${targetPct}%` }}/>
              </div>
              <p style={{ fontSize:11.5, color:'#64748b', marginTop:8, lineHeight:1.6 }}>
                Target is 10 orders daily. Send templates to your contacts to drive more purchases!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}