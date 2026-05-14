import React from 'react';

export default function Titlebar() {
  return (
    <div style={S.bar}>
      <span style={S.title}>Work Session Manager</span>
      <div style={S.controls}>
        <button
          className="win-btn"
          onClick={() => window.api.minimizeWindow()}
          title="Minimize"
        >
          &#x2014;
        </button>
        <button
          className="win-btn win-btn-close"
          onClick={() => window.api.closeWindow()}
          title="Close"
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}

const S = {
  bar: {
    height: 32,
    flexShrink: 0,
    background: 'rgba(255,255,255,0.7)',
    backdropFilter: 'blur(20px)',
    WebkitAppRegion: 'drag',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    userSelect: 'none',
  },
  title: {
    paddingLeft: 16,
    fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif",
    fontSize: 12,
    color: '#555',
    fontWeight: 400,
  },
  controls: {
    display: 'flex',
    height: '100%',
  },
};
