import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Upload, UserPlus, Trash2, FileSpreadsheet, Phone, CheckCircle2, Save, X, Users } from 'lucide-react';

const S = {
  page: { animation:'fadeIn .35s ease' },
  card: { background:'#fff', borderRadius:14, padding:'22px 24px', boxShadow:'0 2px 12px rgba(0,0,0,.07)', border:'1px solid #F0F0F0', marginBottom:16 },
  row: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 },
  title: { fontSize:15, fontWeight:700, color:'#1a1a1a', marginBottom:14, display:'flex', alignItems:'center', gap:8 },
  dropZone: { border:'2px dashed #E0E0E0', borderRadius:12, padding:'36px 20px', textAlign:'center', cursor:'pointer', transition:'all .2s', background:'#FAFAFA' },
  input: { width:'100%', padding:'10px 13px', border:'1px solid #E0E0E0', borderRadius:9, fontSize:13, outline:'none', fontFamily:'inherit', transition:'border .2s' },
  btn: { display:'inline-flex', alignItems:'center', gap:7, padding:'10px 20px', borderRadius:9, fontWeight:600, fontSize:13, cursor:'pointer', border:'none', transition:'all .18s' },
  phoneTag: { display:'inline-flex', alignItems:'center', gap:6, background:'#F0F9F4', border:'1px solid #B2DFCC', color:'#1A7A4A', borderRadius:7, padding:'5px 10px', fontSize:13, fontWeight:500 },
  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { textAlign:'left', padding:'10px 12px', borderBottom:'2px solid #F0F0F0', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:.5, color:'#888' },
  td: { padding:'12px', borderBottom:'1px solid #F9F9F9', color:'#333' },
};

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [extracted, setExtracted] = useState([]);
  const [manual, setManual] = useState('');
  const [manualList, setManualList] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  useEffect(() => { loadContacts(); }, []);

  const loadContacts = async () => {
    try { const {data} = await axios.get('/api/contacts'); if(data.success) setContacts(data.contacts); }
    catch { toast.error('Failed to load contacts'); }
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { toast.error('Upload .xlsx, .xls or .csv file'); return; }
    setUploading(true);
    const fd = new FormData(); fd.append('file', file);
    try {
      const { data } = await axios.post('/api/contacts/upload-excel', fd);
      if (data.success) { 
        setExtracted(data.contacts); 
        toast.success(`Extracted ${data.count} contacts!`); 
      }
      else toast.error(data.message);
    } catch { toast.error('Upload failed'); }
    setUploading(false);
  };

  const addManual = () => {
    const nums = manual.split(/[\n,\s]+/).map(n => n.replace(/\D/g, '').replace(/^91/, '')).filter(n => n.length === 10);
    if (!nums.length) { toast.error('Enter valid 10-digit numbers'); return; }
    const unique = [...new Set([...manualList, ...nums])];
    setManualList(unique); setManual('');
    toast.success(`Added ${nums.length} number(s)`);
  };

  const saveAll = async () => {
    const manualContacts = manualList.map(p => ({ phone: p, name: '', email: '' }));
    const seen = new Set();
    const all = [];

    [...extracted, ...manualContacts].forEach(c => {
      if (!seen.has(c.phone)) {
        seen.add(c.phone);
        all.push(c);
      }
    });

    if (!all.length) { toast.error('No contacts to save'); return; }
    setSaving(true);
    try {
      const { data } = await axios.post('/api/contacts/save', { contacts: all, source: extracted.length > 0 ? 'excel' : 'manual' });
      if (data.success) { 
        toast.success(`Saved ${data.added} contacts!`); 
        setExtracted([]); 
        setManualList([]); 
        loadContacts(); 
      }
    } catch { toast.error('Save failed'); }
    setSaving(false);
  };

  const deleteContact = async (id) => {
    if (!window.confirm('Delete this contact?')) return;
    try { await axios.delete(`/api/contacts/${id}`); toast.success('Deleted'); loadContacts(); }
    catch { toast.error('Delete failed'); }
  };

  const allPending = [...new Set([...extracted,...manualList])];

  return (
    <div style={S.page} className="animate-in">
      <div style={S.row}>
        {/* Excel Upload */}
        <div style={S.card}>
          <div style={S.title}><FileSpreadsheet size={17} color="#1A7A4A"/>Upload Excel File</div>
          <div
            style={{...S.dropZone, borderColor: dragging?'#1A7A4A':'#E0E0E0', background: dragging?'#F0F9F4':'#FAFAFA'}}
            onDragOver={e=>{e.preventDefault();setDragging(true)}}
            onDragLeave={()=>setDragging(false)}
            onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0])}}
            onClick={()=>fileRef.current.click()}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
            <Upload size={32} color="#C8102E" style={{margin:'0 auto 10px'}}/>
            <div style={{fontWeight:600,color:'#333',marginBottom:4}}>{uploading?'Extracting numbers…':'Drop Excel file here'}</div>
            <div style={{fontSize:12,color:'#aaa'}}>Supports .xlsx, .xls, .csv • Extracts Indian mobile numbers</div>
          </div>
          {extracted.length>0 && (
            <div style={{marginTop:14}}>
              <div style={{fontSize:13,fontWeight:600,color:'#1A7A4A',marginBottom:8}}>✅ {extracted.length} contacts extracted:</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,maxHeight:130,overflowY:'auto'}}>
                {extracted.map(c=>(
                  <span key={c.phone} style={S.phoneTag}>
                    <Phone size={11}/>
                    {c.phone} {c.name ? `(${c.name})` : ''}
                    <X size={11} style={{cursor:'pointer'}} onClick={()=>setExtracted(x=>x.filter(n=>n.phone!==c.phone))}/>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Manual Entry */}
        <div style={S.card}>
          <div style={S.title}><UserPlus size={17} color="#C8102E"/>Add Manually</div>
          <textarea
            value={manual} onChange={e=>setManual(e.target.value)}
            placeholder={"Enter mobile numbers (one per line or comma separated)\n9876543210\n8765432109, 7654321098"}
            style={{...S.input,height:120,resize:'vertical',lineHeight:1.7}}
          />
          <button onClick={addManual} style={{...S.btn,background:'#C8102E',color:'#fff',marginTop:10,width:'100%',justifyContent:'center'}}>
            <UserPlus size={14}/>Add to List
          </button>
          {manualList.length>0 && (
            <div style={{marginTop:12}}>
              <div style={{fontSize:13,fontWeight:600,color:'#C8102E',marginBottom:8}}>📋 {manualList.length} manual numbers:</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,maxHeight:100,overflowY:'auto'}}>
                {manualList.map(p=>(
                  <span key={p} style={{...S.phoneTag,background:'#FFF0F2',borderColor:'#F5D0D7',color:'#C8102E'}}>
                    <Phone size={11}/>{p}<X size={11} style={{cursor:'pointer'}} onClick={()=>setManualList(x=>x.filter(n=>n!==p))}/>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Bar */}
      {allPending.length>0 && (
        <div style={{...S.card,background:'linear-gradient(135deg,#1A7A4A,#22A05E)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 22px'}}>
          <div><span style={{fontSize:18,fontWeight:800}}>{allPending.length}</span> <span style={{fontSize:14}}>contacts ready to save</span></div>
          <button onClick={saveAll} disabled={saving} style={{...S.btn,background:'#fff',color:'#1A7A4A',fontWeight:700}}>
            <Save size={14}/>{saving?'Saving…':'Save All Contacts'}
          </button>
        </div>
      )}

      {/* Contacts Table */}
      <div style={S.card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div style={S.title}><Users size={17} color="#555"/>Saved Contacts ({contacts.length})</div>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={S.table}>
            <thead><tr>{['Phone','Name','Email','Source','Status','Templates','Orders','Added'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {contacts.length===0 ? (
                <tr><td colSpan={8} style={{...S.td,textAlign:'center',color:'#aaa',padding:30}}>No contacts yet. Upload an Excel file or add manually.</td></tr>
              ) : contacts.map(c=>(
                <tr key={c._id}>
                  <td style={{...S.td,fontWeight:600}}><Phone size={12} style={{marginRight:5,color:'#888'}}/>{c.phone}</td>
                  <td style={S.td}>{c.name || '-'}</td>
                  <td style={S.td}>{c.email || '-'}</td>
                  <td style={S.td}><span style={{background:c.source==='excel'?'#E8F5E9':'#E3F2FD',color:c.source==='excel'?'#1A7A4A':'#1565C0',borderRadius:5,padding:'2px 8px',fontSize:11,fontWeight:600}}>{c.source}</span></td>
                  <td style={S.td}><span style={{background:'#F9F9F9',borderRadius:5,padding:'2px 8px',fontSize:11,fontWeight:600,color:'#555'}}>{c.lastStatus||'pending'}</span></td>
                  <td style={{...S.td,textAlign:'center'}}>{c.templatesSent||0}</td>
                  <td style={{...S.td,textAlign:'center'}}>{c.ordersPlaced||0}</td>
                  <td style={{...S.td,fontSize:11,color:'#888'}}>{new Date(c.createdAt).toLocaleDateString('en-IN')}</td>
                  <td style={S.td}><button onClick={()=>deleteContact(c._id)} style={{background:'none',border:'none',cursor:'pointer',color:'#E57373',padding:4}}><Trash2 size={14}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
