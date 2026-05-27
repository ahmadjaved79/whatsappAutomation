import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Megaphone, ShoppingBag, UtensilsCrossed, Wifi, WifiOff, Loader2, Menu, X } from 'lucide-react';
import axios from 'axios';
import './Layout.css';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/contacts', icon: Users, label: 'Contacts' },
  { to: '/template', icon: Megaphone, label: 'Template' },
  { to: '/orders', icon: ShoppingBag, label: 'Orders' },
  { to: '/menu', icon: UtensilsCrossed, label: 'Menu' },
];

export default function Layout() {
  const [wppStatus, setWppStatus] = useState('DISCONNECTED');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data } = await axios.get('/api/whatsapp/status');
        setWppStatus(data.status);
      } catch {}
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    let es;
    try {
      es = new EventSource('/api/whatsapp/status/stream');
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          setWppStatus(d.status);
        } catch {}
      };
    } catch {}

    return () => {
      clearInterval(interval);
      if (es) es.close();
    };
  }, []);

  const statusColor = { CONNECTED: '#1A7A4A', DISCONNECTED: '#C8102E', QR_READY: '#D4A017', INITIALIZING: '#E05C00', ERROR: '#C8102E' };
  const statusLabel = { CONNECTED: 'WhatsApp Connected', DISCONNECTED: 'Not Connected', QR_READY: 'Scan QR Code', INITIALIZING: 'Connecting...', ERROR: 'Connection Error' };

  return (
    <div className="layout">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🥩</span>
            <div>
              <div className="logo-title">FreshMeat</div>
              <div className="logo-sub">Shop Manager</div>
            </div>
          </div>
          <button className="close-btn" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <nav className="nav">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="wpp-status" style={{ '--dot-color': statusColor[wppStatus] || '#ADADAD' }}>
            <span className="status-dot" />
            <span>{statusLabel[wppStatus] || wppStatus}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main-wrapper">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="topbar-title">
            {navItems.find(n => location.pathname.includes(n.to.slice(1)))?.label || 'Dashboard'}
          </div>
          <div className="topbar-status" style={{ color: statusColor[wppStatus] }}>
            {wppStatus === 'CONNECTED' ? <Wifi size={16} /> : wppStatus === 'INITIALIZING' ? <Loader2 size={16} className="spin" /> : <WifiOff size={16} />}
            <span className="hide-mobile">{statusLabel[wppStatus]}</span>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}