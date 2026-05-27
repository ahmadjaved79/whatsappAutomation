import React, { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, UtensilsCrossed, IndianRupee, Tag, ToggleLeft, ToggleRight, RefreshCw, Zap } from 'lucide-react';

const S = {
  page: { animation:'fadeIn .35s ease' },
  card: { background:'#fff', borderRadius:14, padding:'22px 24px', boxShadow:'0 2px 12px rgba(0,0,0,.07)', border:'1px solid #F0F0F0', marginBottom:16 },
  input: { width:'100%', padding:'9px 12px', border:'1px solid #E0E0E0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit', transition:'border .2s', marginBottom:8 },
  label: { display:'block', fontSize:11, fontWeight:700, color:'#666', marginBottom:4, textTransform:'uppercase', letterSpacing:.4 },
  btn: { display:'inline-flex', alignItems:'center', gap:6, padding:'9px 18px', borderRadius:9, fontWeight:600, fontSize:13, cursor:'pointer', border:'none', transition:'all .18s' },
  catBadge: { mutton:{bg:'#FFF0F2',c:'#C8102E',icon:'🐑'}, chicken:{bg:'#E8F5E9',c:'#1A7A4A',icon:'🐔'}, special:{bg:'#FDF3D9',c:'#D4A017',icon:'⭐'} },
};

const EMPTY = { name:'', category:'chicken', price:'', unit:'kg', description:'', available:true };

function ItemCard({ item, onEdit, onDelete, onToggle }) {
  const cat = S.catBadge[item.category]||S.catBadge.chicken;
  return (
    <div style={{background:'#fff',border:'1px solid #F0F0F0',borderRadius:12,overflow:'hidden',boxShadow:'0 1px 6px rgba(0,0,0,.05)',transition:'transform .2s,box-shadow .2s',opacity:item.available?1:.55}}
      onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,.10)'}}
      onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='0 1px 6px rgba(0,0,0,.05)'}}>
      <div style={{background:`linear-gradient(135deg,${cat.bg},#fff)`,padding:'16px 16px 12px',borderBottom:'1px solid #F5F5F5'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
          <span style={{fontSize:20}}>{cat.icon}</span>
          <span style={{background:cat.bg,color:cat.c,borderRadius:6,padding:'2px 9px',fontSize:11,fontWeight:700,textTransform:'capitalize'}}>{item.category}</span>
        </div>
        <div style={{fontWeight:700,fontSize:15,color:'#1a1a1a',marginBottom:3}}>{item.name}</div>
        {item.description && <div style={{fontSize:12,color:'#888',lineHeight:1.4}}>{item.description}</div>}
      </div>
      <div style={{padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:'#C8102E'}}>₹{item.price}<span style={{fontSize:11,fontWeight:500,color:'#888'}}>/{item.unit}</span></div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <button onClick={()=>onToggle(item)} title={item.available?'Disable':'Enable'} style={{background:'none',border:'none',cursor:'pointer',color:item.available?'#1A7A4A':'#aaa',padding:4}}>
            {item.available ? <ToggleRight size={22}/> : <ToggleLeft size={22}/>}
          </button>
          <button onClick={()=>onEdit(item)} style={{background:'#F0F4FF',border:'none',borderRadius:7,cursor:'pointer',color:'#1565C0',padding:'6px 8px'}}><Pencil size={13}/></button>
          <button onClick={()=>onDelete(item._id)} style={{background:'#FFEBEE',border:'none',borderRadius:7,cursor:'pointer',color:'#C62828',padding:'6px 8px'}}><Trash2 size={13}/></button>
        </div>
      </div>
    </div>
  );
}

export default function Menu() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [catFilter, setCatFilter] = useState('all');
  const [seeding, setSeeding] = useState(false);

  useEffect(() => { loadMenu(); }, []);

  const loadMenu = async () => {
    try { const {data} = await api.get('/api/menu'); if(data.success) setItems(data.items); } catch { toast.error('Failed to load menu'); }
  };

  const save = async () => {
    if (!form.name.trim()||!form.price) { toast.error('Name and price are required'); return; }
    try {
      if (editing) {
        await api.put(`/api/menu/${editing}`, {...form,price:Number(form.price)});
        toast.success('Updated!');
      } else {
        await api.post('/api/menu', {...form,price:Number(form.price)});
        toast.success('Added!');
      }
      setForm(EMPTY); setEditing(null); setShowForm(false); loadMenu();
    } catch { toast.error('Save failed'); }
  };

  const editItem = (item) => { setForm({...item}); setEditing(item._id); setShowForm(true); };

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this item?')) return;
    try { await api.delete(`/api/menu/${id}`); toast.success('Deleted'); loadMenu(); } catch { toast.error('Delete failed'); }
  };

  const toggleAvail = async (item) => {
    try { await api.put(`/api/menu/${item._id}`, {...item,available:!item.available}); loadMenu(); } catch { toast.error('Failed'); }
  };

  const seedMenu = async () => {
    if (!window.confirm('This will reset menu to defaults. Continue?')) return;
    setSeeding(true);
    try { const {data}=await api.post('/api/menu/seed'); toast.success(`${data.count} items seeded!`); loadMenu(); } catch { toast.error('Seed failed'); }
    setSeeding(false);
  };

  const cats = ['all','mutton','chicken','special'];
  const displayed = catFilter==='all' ? items : items.filter(i=>i.category===catFilter);

  return (
    <div style={S.page} className="animate-in">
      {/* Toolbar */}
      <div style={S.card}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:6}}>
            {cats.map(c=>(
              <button key={c} onClick={()=>setCatFilter(c)} style={{...S.btn,padding:'7px 14px',fontSize:12,background:catFilter===c?'#C8102E':'#F5F5F5',color:catFilter===c?'#fff':'#555',textTransform:'capitalize'}}>
                {c==='all'?'🍽 All':{mutton:'🐑 Mutton',chicken:'🐔 Chicken',special:'⭐ Special'}[c]}
              </button>
            ))}
          </div>
          <div style={{marginLeft:'auto',display:'flex',gap:8}}>
            <button onClick={loadMenu} style={{...S.btn,background:'#F5F5F5',color:'#555',padding:'8px 12px'}}><RefreshCw size={13}/></button>
            <button onClick={seedMenu} disabled={seeding} style={{...S.btn,background:'#FDF3D9',color:'#D4A017'}}>
              <Zap size={13}/>{seeding?'Seeding…':'Load Defaults'}
            </button>
            <button onClick={()=>{setForm(EMPTY);setEditing(null);setShowForm(true)}} style={{...S.btn,background:'linear-gradient(135deg,#C8102E,#9B0D22)',color:'#fff'}}>
              <Plus size={14}/>Add Item
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div style={S.card}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>{editing?'✏️ Edit Item':'➕ New Menu Item'}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={S.label}>Item Name *</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Mutton Boneless" style={S.input}/>
            </div>
            <div>
              <label style={S.label}>Category *</label>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={S.input}>
                <option value="chicken">🐔 Chicken</option>
                <option value="mutton">🐑 Mutton</option>
                <option value="special">⭐ Special</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Price (₹) *</label>
              <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="650" style={S.input}/>
            </div>
            <div>
              <label style={S.label}>Unit</label>
              <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} style={S.input}>
                <option value="kg">kg</option>
                <option value="g">grams</option>
                <option value="pack">pack</option>
                <option value="piece">piece</option>
              </select>
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <label style={S.label}>Description</label>
              <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Short description…" style={S.input}/>
            </div>
          </div>
          <div style={{display:'flex',gap:10,marginTop:6}}>
            <button onClick={save} style={{...S.btn,background:'#C8102E',color:'#fff'}}>{editing?'Update':'Add Item'}</button>
            <button onClick={()=>{setShowForm(false);setEditing(null);setForm(EMPTY)}} style={{...S.btn,background:'#F5F5F5',color:'#555'}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Menu Grid */}
      {items.length===0 ? (
        <div style={{...S.card,textAlign:'center',padding:48}}>
          <UtensilsCrossed size={52} color="#E0E0E0" style={{margin:'0 auto 14px'}}/>
          <div style={{color:'#aaa',fontSize:16,fontWeight:600}}>Menu is empty</div>
          <div style={{color:'#ccc',fontSize:13,margin:'6px 0 18px'}}>Add items manually or click "Load Defaults" to seed sample menu</div>
          <button onClick={seedMenu} style={{...S.btn,background:'#C8102E',color:'#fff',margin:'0 auto'}}><Zap size={14}/>Load Default Menu</button>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:14}}>
          {displayed.map(item=><ItemCard key={item._id} item={item} onEdit={editItem} onDelete={deleteItem} onToggle={toggleAvail}/>)}
        </div>
      )}
    </div>
  );
}