import React, { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { ShoppingBag, RefreshCw, ChevronRight, Package, Truck, CheckCircle2, XCircle, Clock, Search } from 'lucide-react';

const S = {
  page: { animation:'fadeIn .35s ease' },
  card: { background:'#fff', borderRadius:14, padding:'22px 24px', boxShadow:'0 2px 12px rgba(0,0,0,.07)', border:'1px solid #F0F0F0', marginBottom:16 },
  btn: { display:'inline-flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8, fontWeight:600, fontSize:12, cursor:'pointer', border:'none', transition:'all .18s' },
  input: { padding:'9px 13px', border:'1px solid #E0E0E0', borderRadius:9, fontSize:13, outline:'none', fontFamily:'inherit' },
};

const STATUS_MAP = {
  confirmed: { bg:'#E8F5E9', color:'#1A7A4A', label:'Confirmed', icon:<Clock size={12}/> },
  preparing: { bg:'#FFF3E0', color:'#E05C00', label:'Preparing', icon:<Package size={12}/> },
  out_for_delivery: { bg:'#E3F2FD', color:'#1565C0', label:'Out for Delivery', icon:<Truck size={12}/> },
  delivered: { bg:'#F1F8E9', color:'#558B2F', label:'Delivered', icon:<CheckCircle2 size={12}/> },
  cancelled: { bg:'#FFEBEE', color:'#C62828', label:'Cancelled', icon:<XCircle size={12}/> },
};

const NEXT_STATUS = { confirmed:'preparing', preparing:'out_for_delivery', out_for_delivery:'delivered' };
const NEXT_LABEL = { confirmed:'Mark Preparing', preparing:'Mark Out for Delivery', out_for_delivery:'Mark Delivered' };

function StatusBadge({ status }) {
  const m = STATUS_MAP[status]||STATUS_MAP.confirmed;
  return <span style={{display:'inline-flex',alignItems:'center',gap:4,background:m.bg,color:m.color,borderRadius:20,padding:'4px 10px',fontSize:11,fontWeight:600}}>{m.icon}{m.label}</span>;
}

function OrderCard({ order, onUpdate }) {
  const [updating, setUpdating] = useState(false);
  const next = NEXT_STATUS[order.status];

  const advance = async () => {
    if (!next) return;
    setUpdating(true);
    try {
      const {data} = await api.put(`/api/orders/${order.orderId}/status`, { status:next });
      if (data.success) { toast.success(`Order ${next==='delivered'?'delivered! Thank you message sent 🎉':'updated!'}`); onUpdate(); }
    } catch { toast.error('Update failed'); }
    setUpdating(false);
  };

  return (
    <div style={{background:'#fff',border:'1px solid #F0F0F0',borderRadius:12,padding:'16px 18px',boxShadow:'0 1px 6px rgba(0,0,0,.05)',transition:'box-shadow .2s'}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='0 1px 6px rgba(0,0,0,.05)'}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <div>
          <span style={{fontFamily:'monospace',fontWeight:700,color:'#C8102E',fontSize:14}}>{order.orderId}</span>
          <span style={{fontSize:12,color:'#888',marginLeft:10}}>📱 +91 {order.customerPhone}</span>
        </div>
        <StatusBadge status={order.status}/>
      </div>
      {/* Items */}
      <div style={{background:'#FAFAFA',borderRadius:8,padding:'10px 12px',marginBottom:10}}>
        {order.items?.map((item,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'3px 0',borderBottom: i<order.items.length-1?'1px solid #F0F0F0':'none'}}>
            <span style={{color:'#333'}}>{item.name} <span style={{color:'#888'}}>× {item.quantity} {item.unit}</span></span>
            <span style={{fontWeight:600,color:'#222'}}>₹{(item.total||item.price*item.quantity).toLocaleString('en-IN')}</span>
          </div>
        ))}
        <div style={{display:'flex',justifyContent:'space-between',marginTop:8,paddingTop:8,borderTop:'2px solid #E8E8E8',fontWeight:700,fontSize:14}}>
          <span>Total</span><span style={{color:'#C8102E'}}>₹{(order.totalAmount||0).toLocaleString('en-IN')}</span>
        </div>
      </div>
      {/* Footer */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:11,color:'#aaa'}}>{new Date(order.createdAt).toLocaleString('en-IN')}</span>
        {next && order.status!=='cancelled' && (
          <button onClick={advance} disabled={updating} style={{...S.btn,background:'linear-gradient(135deg,#C8102E,#9B0D22)',color:'#fff',opacity:updating?0.7:1}}>
            {updating?'Updating…':<><ChevronRight size={13}/>{NEXT_LABEL[order.status]}</>}
          </button>
        )}
        {order.status==='delivered' && <span style={{fontSize:12,color:'#1A7A4A',fontWeight:600}}>✅ Completed</span>}
      </div>
    </div>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');

  useEffect(() => { loadOrders(); }, [filter, date]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter !== 'all') params.status = filter;
      if (date) params.date = date;
      const {data} = await api.get('/api/orders', { params });
      if (data.success) setOrders(data.orders);
    } catch { toast.error('Failed to load orders'); }
    setLoading(false);
  };

  const filtered = orders.filter(o => !search || o.orderId.includes(search.toUpperCase()) || o.customerPhone.includes(search));

  const tabs = [
    { key:'all', label:'All', color:'#555' },
    { key:'confirmed', label:'Confirmed', color:'#1A7A4A' },
    { key:'preparing', label:'Preparing', color:'#E05C00' },
    { key:'out_for_delivery', label:'Out for Delivery', color:'#1565C0' },
    { key:'delivered', label:'Delivered', color:'#558B2F' },
  ];

  return (
    <div style={S.page} className="animate-in">
      <div style={S.card}>
        {/* Filters */}
        <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:16}}>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {tabs.map(t=>(
              <button key={t.key} onClick={()=>setFilter(t.key)} style={{...S.btn,background:filter===t.key?t.color:'#F5F5F5',color:filter===t.key?'#fff':'#555'}}>
                {t.label} {t.key!=='all'&&<span style={{background:'rgba(255,255,255,.25)',borderRadius:10,padding:'1px 6px',fontSize:10}}>{orders.filter(o=>o.status===t.key).length}</span>}
              </button>
            ))}
          </div>
          <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
            <div style={{position:'relative'}}>
              <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#aaa'}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search order / phone…" style={{...S.input,paddingLeft:32,width:200}}/>
            </div>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={S.input}/>
            {date && <button onClick={()=>setDate('')} style={{...S.btn,background:'#F5F5F5',color:'#555'}}>Clear</button>}
            <button onClick={loadOrders} style={{...S.btn,background:'#F5F5F5',color:'#555'}}><RefreshCw size={13}/></button>
          </div>
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:40,color:'#aaa'}}>Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div style={{textAlign:'center',padding:40}}>
            <ShoppingBag size={48} color="#E0E0E0" style={{margin:'0 auto 12px'}}/>
            <div style={{color:'#aaa',fontSize:15}}>No orders found</div>
            <div style={{color:'#ccc',fontSize:13,marginTop:4}}>Send a campaign to start receiving orders</div>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(400px,1fr))',gap:14}}>
            {filtered.map(o=><OrderCard key={o._id} order={o} onUpdate={loadOrders}/>)}
          </div>
        )}
      </div>
    </div>
  );
}