// src/App.js
// --------------------------------------------------------------
// Shows Register/Login (Task 1) + Credentials UI (Task 2).
// Also renders the AdminPanel (Task 3) only when the user role
// is management or admin.
// --------------------------------------------------------------
import React, { useState } from 'react';
import { api, setAuthToken } from './api';
import Credentials from './components/Credentials';
import AdminPanel from './components/AdminPanel';

export default function App() {
  // --- auth form state ---
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // --- runtime auth state ---
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  // --- lightweight toast ---
  const [msg, setMsg] = useState('');
  const toast = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2200); };

  // Register a new user (default role: normal)
  async function register() {
    try {
      const { data } = await api.post('/register', { name, email, password });
      setToken(data.token);
      setUser(data.user);
      setAuthToken(data.token);       // attach token for subsequent calls
      toast('Registered successfully');
    } catch (e) {
      toast(e.response?.data?.error || 'Registration failed');
    }
  }

  // Login existing user
  async function login() {
    try {
      const { data } = await api.post('/login', { email, password });
      setToken(data.token);
      setUser(data.user);
      setAuthToken(data.token);
      toast('Login successful');
    } catch (e) {
      toast(e.response?.data?.error || 'Login failed');
    }
  }

  // Clear token + user from memory
  function logout() {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    toast('Logged out');
  }

  return (
    <div className="container">
      <div className="card vstack">
        <h2 style={{ margin: '0 0 6px' }}>Capstone Auth</h2>
        <span className="small">Task 1 & 2 — React UI</span>

        {!token ? (
          // --- show auth form when logged out ---
          <div className="vstack">
            <div className="hstack">
              <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
              <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="hstack">
              <button onClick={register}>Register</button>
              <button className="ghost" onClick={login}>Login</button>
            </div>
          </div>
        ) : (
          // --- show user badge + logout when logged in ---
          <div className="hstack" style={{ justifyContent: 'space-between' }}>
            <div className="hstack" style={{ gap: 8 }}>
              <span className="badge">{user?.name}</span>
              <span className="small">{user?.email}</span>
            </div>
            <button onClick={logout}>Logout</button>
          </div>
        )}
      </div>

      {/* Task 2 UI: credentials */}
      {token && <Credentials token={token} role={user?.role || 'admin'} />}

      {/* Task 3 UI: management/admin only */}
      {token && (user?.role === 'management' || user?.role === 'admin') && (
        <AdminPanel token={token} role={user?.role} />
      )}

      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
