import React, { useState, useRef } from 'react';
import Titlebar     from './components/Titlebar.jsx';
import Sidebar      from './components/Sidebar.jsx';
import Dashboard    from './components/Dashboard.jsx';
import CaptureView  from './components/CaptureView.jsx';
import SettingsView from './components/SettingsView.jsx';
import PluginsView  from './components/PluginsView.jsx';

const VIEWS = {
  sessions: Dashboard,
  capture:  CaptureView,
  settings: SettingsView,
  plugins:  PluginsView,
};

const TOAST_PALETTE = {
  success: { bg: '#dff6dd', border: '#6ccb5f', color: '#1a3d1a' },
  error:   { bg: '#fde7e9', border: '#f1707a', color: '#3d1a1a' },
  info:    { bg: '#f0f6ff', border: '#0067c0', color: '#0d2137' },
};

function Toast({ msg, type, action }) {
  const p = TOAST_PALETTE[type] ?? TOAST_PALETTE.info;
  return (
    <div style={{
      padding: '12px 18px', borderRadius: 6,
      width: 360, maxWidth: '92vw',
      fontSize: 13, fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif",
      border: '1px solid', boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
      animation: 'wsm-slideDown 0.2s ease',
      background: p.bg, borderColor: p.border, color: p.color,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ flex: 1 }}>{msg}</span>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            background: 'transparent', border: `1px solid ${p.border}`,
            borderRadius: 4, padding: '4px 10px', fontSize: 12,
            color: p.color, cursor: 'pointer', flexShrink: 0,
            fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView]     = useState('sessions');
  const [toasts, setToasts] = useState([]);
  const toastIdRef          = useRef(0);

  function showToast(msg, type = 'info', action = null) {
    const id = ++toastIdRef.current;
    setToasts(prev => {
      const next = [...prev, { id, msg, type, action }];
      // Cap at 3 — drop the oldest when a 4th arrives
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, action ? 7000 : 3500);
  }

  const View = VIEWS[view];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#f3f3f3' }}>
      <style>{GLOBAL_CSS}</style>
      <Titlebar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar active={view} onNavigate={setView} />
        <main style={{ flex: 1, overflowY: 'auto', background: '#f3f3f3', padding: 24 }}>
          <View showToast={showToast} />
        </main>
      </div>
      {/* Toast stack — newest at bottom, max 3 */}
      <div style={{
        position: 'fixed', top: 24, right: 24, zIndex: 9000,
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <Toast msg={t.msg} type={t.type} action={t.action} />
          </div>
        ))}
      </div>
    </div>
  );
}

const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { margin: 0; padding: 0; height: 100%; overflow: hidden; }
  body { font-family: 'Segoe UI Variable', 'Segoe UI', sans-serif; }

  @keyframes wsm-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes wsm-slideUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes wsm-slideDown {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .wsm-spinner { animation: wsm-spin 0.75s linear infinite; }

  @keyframes wsm-cursor-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
  .wsm-cursor { animation: wsm-cursor-blink 1s step-end infinite; }

  /* Custom scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.20); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.35); }

  /* Nav items */
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    width: 100%; background: none; border: none;
    border-left: 3px solid transparent;
    padding: 10px 13px;
    font-family: 'Segoe UI Variable', 'Segoe UI', sans-serif;
    font-size: 13px; color: #333;
    cursor: pointer; text-align: left;
    transition: background 120ms ease, color 120ms ease;
  }
  .nav-item:hover { background: rgba(0,0,0,0.04); }
  .nav-item.active {
    background: rgba(0,103,192,0.10);
    border-left-color: #0067c0;
    color: #0067c0;
    font-weight: 500;
  }
  .nav-item .nav-icon { color: #555; font-size: 16px; line-height: 1; }
  .nav-item.active .nav-icon { color: #0067c0; }

  /* Window chrome buttons */
  .win-btn {
    width: 46px; height: 32px; border: none; background: transparent;
    cursor: pointer; font-size: 15px; color: #444;
    display: flex; align-items: center; justify-content: center;
    -webkit-app-region: no-drag;
    transition: background 120ms ease;
    font-family: 'Segoe UI Variable', 'Segoe UI', sans-serif;
  }
  .win-btn:hover { background: rgba(0,0,0,0.08); }
  .win-btn-close:hover { background: #c42b1c !important; color: #fff !important; }

  /* Session cards */
  .wsm-card { transition: box-shadow 150ms ease, transform 150ms ease; }
  .wsm-card:hover {
    box-shadow: 0 4px 16px rgba(0,0,0,0.10) !important;
    transform: translateY(-2px);
  }

  /* Buttons — Primary */
  .btn-primary {
    background: #0067c0; color: #fff; border: none;
    border-radius: 6px; padding: 8px 20px;
    font-size: 14px; font-weight: 500; cursor: pointer;
    font-family: 'Segoe UI Variable', 'Segoe UI', sans-serif;
    transition: background 150ms ease, transform 100ms ease, box-shadow 150ms ease;
  }
  .btn-primary:hover:not(:disabled) { background: #0058a3; }

  /* Buttons — Ghost */
  .btn-ghost {
    background: transparent; color: #0067c0;
    border: 1px solid #0067c0; border-radius: 6px;
    padding: 8px 18px; font-size: 13px; font-weight: 500;
    cursor: pointer;
    font-family: 'Segoe UI Variable', 'Segoe UI', sans-serif;
    transition: background 150ms ease, transform 100ms ease, box-shadow 150ms ease;
  }
  .btn-ghost:hover:not(:disabled) { background: rgba(0,0,0,0.04); }

  /* Buttons — Danger ghost */
  .btn-danger {
    background: transparent; color: #c42b1c;
    border: 1px solid #c42b1c; border-radius: 4px;
    padding: 5px 12px; font-size: 13px; cursor: pointer;
    font-family: 'Segoe UI Variable', 'Segoe UI', sans-serif;
    transition: background 150ms ease, transform 100ms ease, box-shadow 150ms ease;
  }
  .btn-danger:hover:not(:disabled) { background: rgba(196,43,28,0.06); }

  /* Small size modifier (card actions) */
  .btn-sm {
    padding: 5px 12px !important;
    font-size: 13px !important;
    border-radius: 4px !important;
  }

  /* Modal close button */
  .btn-modal-close {
    background: none; border: none; font-size: 14px;
    cursor: pointer; color: #666; padding: 4px 8px;
    border-radius: 4px; line-height: 1;
    font-family: 'Segoe UI Variable', 'Segoe UI', sans-serif;
    transition: background 120ms ease;
  }
  .btn-modal-close:hover { background: #f0f0f0; }

  button:disabled { opacity: 0.55; cursor: not-allowed !important; }
  .remove-btn:hover { background: rgba(196,43,28,0.10) !important; border-radius: 4px; }

  /* Settings sub-nav tabs */
  .settings-tab {
    background: transparent; color: #333;
    border: 1px solid #d0d0d0; border-radius: 20px;
    padding: 6px 16px; font-size: 13px;
    cursor: pointer; text-align: left;
    font-family: 'Segoe UI Variable', 'Segoe UI', sans-serif;
    transition: background 120ms ease;
  }
  .settings-tab:hover { background: rgba(0,0,0,0.04); }
  .settings-tab.active {
    background: #0067c0; color: #fff;
    border-color: #0067c0; font-weight: 500;
  }

  /* Restore indeterminate progress bar */
  @keyframes wsm-progress-slide {
    0%   { left: -40%; }
    100% { left: 110%; }
  }
  .wsm-restore-progress {
    position: absolute;
    bottom: 0; left: 0; right: 0; height: 3px;
    background: rgba(0,103,192,0.12);
    border-radius: 0 0 8px 8px;
    overflow: hidden;
  }
  .wsm-restore-progress-bar {
    position: absolute;
    top: 0; left: -40%; height: 100%; width: 40%;
    background: #0067c0;
    animation: wsm-progress-slide 1.4s ease-in-out infinite;
  }
`;
