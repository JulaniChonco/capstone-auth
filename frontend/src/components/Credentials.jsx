import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Credentials({ token, role }){
  const [divisions, setDivisions] = useState([]);
  const [divisionId, setDivisionId] = useState('');
  const [credentials, setCredentials] = useState([]);
  const [adding, setAdding] = useState({ system:'', username:'', password:'' });
  const [toast, setToast] = useState('');
  const show = (m)=>{ setToast(m); setTimeout(()=>setToast(''), 2500); };

  useEffect(()=>{(async ()=>{
    try{
      const { data } = await api.get('/dev/divisions', { headers:{ Authorization:`Bearer ${token}` }});
      const flat = []; (data.items||[]).forEach(ou => (ou.divisions||[]).forEach(d => flat.push({ id:d.divisionId, name:`${ou.ouName} / ${d.divisionName}` })));
      setDivisions(flat); if(flat.length && !divisionId) setDivisionId(flat[0].id);
    }catch(e){ console.error(e); show('Failed to load divisions'); }
  })();}, []);

  useEffect(()=>{ if(!divisionId) return; (async ()=>{
    try{ const { data } = await api.get(`/divisions/${divisionId}/credentials`, { headers:{ Authorization:`Bearer ${token}` }});
      setCredentials(data.credentials||[]);
    }catch(e){ console.error(e); show('Failed to load credentials'); }
  })();}, [divisionId, token]);

  async function addCredential(){
    if(!adding.system || !adding.username || !adding.password) return show('Please fill in all fields');
    try{
      const { data } = await api.post(`/divisions/${divisionId}/credentials`, adding, { headers:{ Authorization:`Bearer ${token}` }});
      setCredentials(data.credentials||[]); setAdding({system:'',username:'',password:''}); show('Credential added');
    }catch(e){ console.error(e); show(e.response?.data?.error||'Failed to add credential'); }
  }
  async function updateCredential(credId, patch){
    try{
      const { data } = await api.put(`/divisions/${divisionId}/credentials/${credId}`, patch, { headers:{ Authorization:`Bearer ${token}` }});
      setCredentials((credentials||[]).map(c => c._id===credId ? data.credential : c)); show('Credential updated');
    }catch(e){ console.error(e); show(e.response?.data?.error||'Failed to update (requires management role)'); }
  }

  return (<div className="card vstack">
    <div className="hstack" style={{justifyContent:'space-between'}}>
      <h3 style={{margin:0}}>Division Credentials</h3>
      <span className="badge">Role: {role}</span>
    </div>
    <div className="hstack">
      <select value={divisionId} onChange={e=>setDivisionId(e.target.value)}>
        {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </div>
    <table><thead><tr><th style={{width:'35%'}}>System</th><th style={{width:'25%'}}>Username</th><th style={{width:'25%'}}>Password</th><th style={{width:'15%'}}>Actions</th></tr></thead>
      <tbody>
        {(credentials||[]).map(c => <tr key={c._id}>
          <td>{c.system}</td><td>{c.username}</td><td>{c.password}</td>
          <td><button className="ghost" onClick={()=>{
            const np = prompt('New password for '+c.username, c.password||''); if(np!==null) updateCredential(c._id, { password: np });
          }}>Update</button></td></tr>)}
        {(!credentials||credentials.length===0) && <tr><td colSpan="4" className="small">No credentials yet</td></tr>}
      </tbody></table>

    <div className="card vstack" style={{background:'#fafafa'}}>
      <div className="hstack">
        <input placeholder="System" value={adding.system} onChange={e=>setAdding({...adding, system:e.target.value})} />
        <input placeholder="Username" value={adding.username} onChange={e=>setAdding({...adding, username:e.target.value})} />
        <input placeholder="Password" value={adding.password} onChange={e=>setAdding({...adding, password:e.target.value})} />
        <button onClick={addCredential}>Add</button>
      </div>
      <span className="small">Normal can add; update requires management/admin.</span>
    </div>
    {toast && <div className="toast">{toast}</div>}
  </div>);
}
