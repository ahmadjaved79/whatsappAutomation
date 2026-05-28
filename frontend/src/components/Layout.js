import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Megaphone, ShoppingBag, UtensilsCrossed,
  Wifi, WifiOff, Loader2, Menu, X,
  BarChart2, UserCircle, Clock, MessageCircle, Package
} from 'lucide-react';
import api from '../api';
import './Layout.css';

const navGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/orders',    icon: ShoppingBag,     label: 'Orders'    },
      { to: '/revenue',   icon: BarChart2,        label: 'Revenue'   },
    ],
  },
  {
    label: 'Messaging',
    items: [
      { to: '/template',        icon: Megaphone,      label: 'Template'     },
      { to: '/schedule',        icon: Clock,           label: 'Schedule'     },
      { to: '/manual-message',  icon: MessageCircle,   label: 'Send Message' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: '/contacts',  icon: Users,           label: 'Contacts'  },
      { to: '/customers', icon: UserCircle,      label: 'Customers' },
      { to: '/menu',      icon: UtensilsCrossed, label: 'Menu'      },
      { to: '/stock',     icon: Package,          label: 'Stock'     },
    ],
  },
];

const allNavItems = navGroups.flatMap(g => g.items);

export default function Layout() {
  const [wppStatus, setWppStatus]     = useState('DISCONNECTED');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data } = await api.get('/api/whatsapp/status');
        setWppStatus(data.status);
      } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);

    const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    let es = null, retryDelay = 3000, retryTimer = null, destroyed = false;
    const connectSSE = () => {
      if (destroyed) return;
      try {
        es = new EventSource(BASE + '/api/whatsapp/status/stream');
        es.onopen = () => { retryDelay = 3000; };
        es.onmessage = (e) => {
          try { const d = JSON.parse(e.data); setWppStatus(d.status); } catch {}
        };
        es.onerror = () => {
          es.close(); es = null;
          if (!destroyed) {
            retryTimer = setTimeout(() => {
              retryDelay = Math.min(retryDelay * 2, 30000);
              connectSSE();
            }, retryDelay);
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
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const statusMeta = {
    CONNECTED:    { color: '#16a34a', label: 'Connected'    },
    DISCONNECTED: { color: '#c8102e', label: 'Disconnected' },
    QR_READY:     { color: '#d97706', label: 'Scan QR'      },
    INITIALIZING: { color: '#ea580c', label: 'Connecting…'  },
    ERROR:        { color: '#c8102e', label: 'Error'         },
  };
  const meta = statusMeta[wppStatus] || statusMeta.DISCONNECTED;

  const statusClass =
    wppStatus === 'CONNECTED'    ? 'connected'    :
    wppStatus === 'INITIALIZING' ? 'loading'      : 'disconnected';

  const currentPage = allNavItems.find(n =>
    location.pathname === n.to || location.pathname.startsWith(n.to + '/')
  )?.label || 'Dashboard';

  return (
    <div className="layout">
      {/* Overlay — mobile only */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ───────────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>

        <div className="sidebar__header">
          <div className="sidebar__logo">
            <div className="sidebar__logo-icon">🥩</div>
            <div>
              <div className="sidebar__logo-title">FreshMeat</div>
              <div className="sidebar__logo-sub">Shop Manager</div>
            </div>
          </div>
          <button className="sidebar__close" onClick={() => setSidebarOpen(false)}>
            <X size={17} />
          </button>
        </div>

        <nav className="sidebar__nav">
          {navGroups.map(group => (
            <div key={group.label}>
              <div className="sidebar__group-label">{group.label}</div>
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                >
                  <Icon size={17} className="sidebar__link-icon" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__status" style={{ '--dot': meta.color }}>
            <span className="sidebar__status-dot" />
            <span>{meta.label}</span>
          </div>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────── */}
      <div className="main-wrapper">

        {/* Topbar */}
        <header className="topbar">
          <button className="topbar__menu-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>

          <span className="topbar__title">{currentPage}</span>

          <div className="topbar__right">
            <div className={`topbar__status topbar__status--${statusClass}`}>
              {wppStatus === 'CONNECTED'    ? <Wifi size={13} />              :
               wppStatus === 'INITIALIZING' ? <Loader2 size={13} className="spin" /> :
                                              <WifiOff size={13} />}
              <span className="topbar__status-label">{meta.label}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}