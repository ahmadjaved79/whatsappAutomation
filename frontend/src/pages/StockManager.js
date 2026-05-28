import React, { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { RefreshCw, ToggleLeft, ToggleRight, AlertTriangle, Package } from 'lucide-react';

const S = {
  page:  { animation: 'fadeIn .35s ease' },
  card:  { background: '#fff', borderRadius: 14, padding: '22px 24px', boxShadow: '0 2px 12px rgba(0,0,0,.07)', border: '1px solid #F0F0F0', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 },
  btn:   { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none', transition: 'all .18s' },
  input: { padding: '7px 10px', border: '1px solid #E0E0E0', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  catBadge: { mutton: { bg: '#FFF0F2', c: '#C8102E', icon: '🐑' }, chicken: { bg: '#E8F5E9', c: '#1A7A4A', icon: '🐔' }, special: { bg: '#FDF3D9', c: '#D4A017', icon: '⭐' } },
};

export default function StockManager() {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editId, setEditId]       = useState(null);
  const [editStock, setEditStock] = useState({ stockQty: '', stockThreshold: '' });
  const [saving, setSaving]       = useState(false);
  const [filter, setFilter]       = useState('all');

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await api.get('/api/menu');
    if (data.success) setItems(data.items);
    setLoading(false);
  };

  const toggleAvailable = async (item) => {
    await api.put(`/api/menu/${item._id}/toggle`);
    setItems(prev => prev.map(i => i._id === item._id ? { ...i, available: !i.available } : i));
  };

  const saveStock = async (id) => {
    setSaving(true);
    const { data } = await api.put(`/api/menu/${id}/stock`, {
      stockQty:       editStock.stockQty === '' ? null : Number(editStock.stockQty),
      stockThreshold: Number(editStock.stockThreshold) || 5,
    });
    if (data.success) { setItems(prev => prev.map(i => i._id === id ? data.item : i)); setEditId(null); toast.success('Stock updated!'); }
    else toast.error('Update failed');
    setSaving(false);
  };

  const lowStock = items.filter(i => i.stockQty !== null && i.stockQty !== undefined && i.stockQty <= (i.stockThreshold ?? 5));

  const displayed = items.filter(i =>
    filter === 'all'       ? true :
    filter === 'available' ? i.available :
    filter === 'soldout'   ? !i.available :
    filter === 'lowstock'  ? (i.stockQty !== null && i.stockQty !== undefined && i.stockQty <= (i.stockThreshold ?? 5)) :
    true
  );

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>Loading…</div>;

  return (
    <div style={S.page} className="animate-in">

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={18} color="#E05C00" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#E05C00' }}>Low stock alert — {lowStock.length} item{lowStock.length > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>{lowStock.map(i => `${i.name} (${i.stockQty} ${i.unit} left)`).join(' · ')}</div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'all',       label: `All (${items.length})` },
              { key: 'available', label: `Available (${items.filter(i => i.available).length})` },
              { key: 'soldout',   label: `Sold Out (${items.filter(i => !i.available).length})` },
              { key: 'lowstock',  label: `Low Stock (${lowStock.length})`, warn: lowStock.length > 0 },
            ].map(tab => (
              <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
                ...S.btn, padding: '7px 14px', fontSize: 12,
                background: filter === tab.key ? (tab.warn ? '#E05C00' : '#C8102E') : '#F5F5F5',
                color: filter === tab.key ? '#fff' : (tab.warn ? '#E05C00' : '#555'),
              }}>{tab.label}</button>
            ))}
          </div>
          <button onClick={fetchItems} style={{ ...S.btn, background: '#F5F5F5', color: '#555', marginLeft: 'auto', padding: '8px 12px' }}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Items grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
        {displayed.map(item => {
          const isLow   = item.stockQty !== null && item.stockQty !== undefined && item.stockQty <= (item.stockThreshold ?? 5);
          const cat     = S.catBadge[item.category] || S.catBadge.special;
          const isEditing = editId === item._id;

          return (
            <div key={item._id} style={{
              background: '#fff', borderRadius: 12, padding: '16px 18px',
              border: `1px solid ${isLow ? '#FFB74D' : '#F0F0F0'}`,
              boxShadow: isLow ? '0 0 0 2px #FFF3E0' : '0 1px 6px rgba(0,0,0,.05)',
              opacity: item.available ? 1 : 0.65,
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: cat.bg, color: cat.c }}>
                      {cat.icon} {item.category}
                    </span>
                    {isLow && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#FFF3E0', color: '#E05C00' }}>⚠️ Low</span>}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>₹{item.price} / {item.unit}</div>
                </div>

                {/* Toggle */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginLeft: 10 }}>
                  <button onClick={() => toggleAvailable(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.available ? '#1A7A4A' : '#aaa', padding: 2 }}>
                    {item.available ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                  <span style={{ fontSize: 10, color: item.available ? '#1A7A4A' : '#aaa', fontWeight: 600 }}>
                    {item.available ? 'Available' : 'Sold Out'}
                  </span>
                </div>
              </div>

              {/* Stock info */}
              {!isEditing ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid #F5F5F5' }}>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    Stock:{' '}
                    {item.stockQty !== null && item.stockQty !== undefined
                      ? <span style={{ fontWeight: 700, color: isLow ? '#E05C00' : '#1a1a1a' }}>{item.stockQty} {item.unit}</span>
                      : <span style={{ color: '#ccc' }}>Not tracked</span>
                    }
                    {item.stockQty !== null && item.stockQty !== undefined && (
                      <span style={{ color: '#ccc' }}> · warn at {item.stockThreshold ?? 5}</span>
                    )}
                  </div>
                  <button onClick={() => { setEditId(item._id); setEditStock({ stockQty: item.stockQty ?? '', stockThreshold: item.stockThreshold ?? 5 }); }}
                    style={{ ...S.btn, padding: '4px 10px', fontSize: 11, background: '#F5F5F5', color: '#555' }}>
                    Edit
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #F5F5F5' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 3 }}>QTY ({item.unit})</div>
                      <input type="number" min="0" placeholder="leave blank = unlimited" value={editStock.stockQty}
                        onChange={e => setEditStock(s => ({ ...s, stockQty: e.target.value }))} style={S.input} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 3 }}>WARN BELOW</div>
                      <input type="number" min="0" value={editStock.stockThreshold}
                        onChange={e => setEditStock(s => ({ ...s, stockThreshold: e.target.value }))} style={S.input} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => saveStock(item._id)} disabled={saving}
                      style={{ ...S.btn, flex: 1, padding: '7px', background: '#C8102E', color: '#fff', justifyContent: 'center' }}>
                      {saving ? '…' : 'Save'}
                    </button>
                    <button onClick={() => setEditId(null)}
                      style={{ ...S.btn, padding: '7px 12px', background: '#F5F5F5', color: '#555' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}