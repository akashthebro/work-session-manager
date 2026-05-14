import React from 'react';

const NAV = [
  { id: 'sessions', icon: '',  label: 'Sessions' },
  { id: 'capture',  icon: '', label: 'Capture'  },
  { id: 'settings', icon: '',  label: 'Settings' },
  { id: 'plugins',  icon: '', label: 'Plugins'  },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <div style={S.sidebar}>
      <div style={S.section}>
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item${active === item.id ? ' active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const S = {
  sidebar: {
    width: 220,
    flexShrink: 0,
    background: 'rgba(255,255,255,0.6)',
    backdropFilter: 'blur(20px)',
    borderRight: '1px solid rgba(0,0,0,0.06)',
    padding: '12px 0',
    overflowY: 'auto',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
  },
  icon: {
    fontSize: 16,
    lineHeight: 1,
  },
};
