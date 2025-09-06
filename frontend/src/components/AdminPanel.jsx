// src/components/AdminPanel.jsx
// ------------------------------------------------------------------
// Task 3 UI: Manage users (assign/unassign OU/Division, change roles)
// Permissions:
//  - Visible for management/admin (role gate happens at App level)
//  - Only admin sees the "Change Role" control
// ------------------------------------------------------------------
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

export default function AdminPanel({ token, role }){
  const [users, setUsers] = useState([]);
  const [structure, setStructure] = useState([]); // [{ouId, ouName, divisions:[{divisionId, divisionName}]}]
  const [working, setWorking] = useState(null);
  const [toast, setToast] = useState('');

  const show = (m)=>{ setToast(m); setTimeout(()=>setToast(''), 2500); };

  // Index for quick lookups
  const divisionIndex = useMemo(()=>{
    const map = new Map();
    for (const ou of structure) {
      for (const d of (ou.divisions||[])) {
        map.set(String(d.divisionId), { ouName: ou.ouName, divisionName: d.divisionName, ouId: String(ou.ouId) });
      }
    }
    return map;
  }, [structure]);

  async function load(){
    try{
      const [uRes, sRes] = await Promise.all([
        api.get('/users', { headers:{ Authorization:`Bearer ${token}` } }),
        api.get('/structure/ous', { headers:{ Authorization:`Bearer ${token}` } })
      ]);
      setUsers(uRes.data.items || []);
      setStructure(sRes.data.items || []);
    }catch(e){
      console.error(e);
      show(e.response?.data?.error || 'Failed to load users/structure');
    }
  }

  useEffect(()=>{ load(); }, []);

  async function assign(userId, ouId, divisionId){
    setWorking(userId);
    try{
      await api.post(`/users/${userId}/assign`, { ouId, divisionId }, { headers:{ Authorization:`Bearer ${token}` } });
      show('User assigned');
      await load();
    }catch(e){
      console.error(e); show(e.response?.data?.error || 'Assign failed');
    }finally{
      setWorking(null);
    }
  }

  async function unassign(userId){
    setWorking(userId);
    try{
      await api.delete(`/users/${userId}/assign`, { headers:{ Authorization:`Bearer ${token}` } });
      show('User unassigned');
      await load();
    }catch(e){
      console.error(e); show(e.response?.data?.error || 'Unassign failed');
    }finally{
      setWorking(null);
    }
  }

  async function changeRole(userId, newRole){
    setWorking(userId);
    try{
      const { data } = await api.put(`/users/${userId}/role`, { role: newRole }, { headers:{ Authorization:`Bearer ${token}` } });
      show('Role updated' + (data.requireReLogin ? ' (please re-login to refresh your token)' : ''));
      await load();
    }catch(e){
      console.error(e); show(e.response?.data?.error || 'Change role failed (admin only)');
    }finally{
      setWorking(null);
    }
  }

  return (
    <div className="card vstack">
      <div className="hstack" style={{justifyContent:'space-between'}}>
        <h3 style={{margin:0}}>User Management</h3>
        <span className="badge">You are: {role}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Assignment</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => {
            // Pre-select current assignment for the select controls
            const currentDiv = u.division ? String(u.division) : '';
            const current = divisionIndex.get(currentDiv);
            // Build flat options (ou/division pairs)
            const options = [];
            for(const ou of structure){
              for(const d of (ou.divisions||[])){
                options.push({ value: String(d.divisionId), label: `${ou.ouName} / ${d.divisionName}`, ouId: String(ou.ouId) });
              }
            }
            return (
              <Row key={u.id}
                   u={u}
                   role={role}
                   options={options}
                   current={current}
                   working={working===u.id}
                   onAssign={(divisionId)=>{
                     const opt = options.find(o => o.value === divisionId);
                     if(opt) assign(u.id, opt.ouId, divisionId);
                   }}
                   onUnassign={()=>unassign(u.id)}
                   onChangeRole={(newRole)=>changeRole(u.id, newRole)} />
            );
          })}
          {users.length===0 && <tr><td colSpan="5" className="small">No users yet</td></tr>}
        </tbody>
      </table>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Row({ u, role, options, current, working, onAssign, onUnassign, onChangeRole }){
  const [selectedDiv, setSelectedDiv] = useState(current ? undefined : ''); // force choose if none
  useEffect(()=>{
    // When current changes (after reload), reflect it
    if(current){ setSelectedDiv(current.value); }
  }, [current]);

  return (
    <tr>
      <td>{u.name}</td>
      <td>{u.email}</td>
      <td>
        {u.role}
        {role === 'admin' && (
          <span style={{ marginLeft: 8 }}>
            <select defaultValue={u.role} onChange={e=>onChangeRole(e.target.value)}>
              <option value="normal">normal</option>
              <option value="management">management</option>
              <option value="admin">admin</option>
            </select>
          </span>
        )}
      </td>
      <td>
        <div className="vstack" style={{gap:6}}>
          <span className="small">
            {current ? `${current.ouName} / ${current.divisionName}` : '— none —'}
          </span>
          <div className="hstack">
            <select value={selectedDiv || ''} onChange={e=>setSelectedDiv(e.target.value)}>
              <option value="">Select division…</option>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="ghost" onClick={()=>selectedDiv && onAssign(selectedDiv)} disabled={!selectedDiv || working}>Assign</button>
          </div>
        </div>
      </td>
      <td>
        <button onClick={onUnassign} disabled={working}>Unassign</button>
      </td>
    </tr>
  );
}
