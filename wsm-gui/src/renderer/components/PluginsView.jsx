import React, { useState, useEffect } from 'react';

const FONT   = "'Segoe UI Variable', 'Segoe UI', sans-serif";
const ACCENT = '#0067c0';

function Toggle({ checked, onChange }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? ACCENT : '#b8b8b8',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s ease', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3, left: checked ? 22 : 2,
        width: 16, height: 16,
        borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
  );
}

export default function PluginsView({ showToast }) {
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => { loadPlugins(); }, []);

  async function loadPlugins() {
    setLoading(true);
    try {
      const data = await window.api.getPlugins();
      setPlugins(Array.isArray(data) ? data : []);
    } catch {
      showToast('Could not load plugins', 'error');
    } finally {
      setLoading(false);
    }
  }

  function togglePlugin(filename) {
    setPlugins(prev => prev.map(p =>
      p.filename === filename ? { ...p, enabled: !p.enabled } : p
    ));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const config = Object.fromEntries(plugins.map(p => [p.filename, p.enabled]));
      await window.api.savePluginsConfig(config);
      showToast('Plugin settings saved', 'success');
    } catch {
      showToast('Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={S.pageHeader}>
        <h1 style={S.heading}>Plugins</h1>
        <p style={S.subheading}>Manage which plugins are active</p>
      </div>

      {loading ? (
        <div style={S.centered}>
          <div className="wsm-spinner" style={S.spinner} />
          <span style={S.mutedText}>Loading plugins…</span>
        </div>
      ) : plugins.length === 0 ? (
        <div style={S.centered}>
          <div style={{ fontSize: 42, marginBottom: 14 }}>🔌</div>
          <div style={S.emptyTitle}>No plugins found</div>
          <div style={S.mutedText}>Place .py files in the plugins/ folder and restart the app.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {plugins.map(plugin => (
            <div key={plugin.filename} style={S.pluginCard}>
              <div style={{ flex: 1 }}>
                <div style={S.pluginName}>{plugin.name}</div>
                <div style={S.pluginFilename}>{plugin.filename}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={plugin.enabled ? S.badgeActive : S.badgeDisabled}>
                  {plugin.enabled ? 'Active' : 'Disabled'}
                </span>
                <Toggle checked={plugin.enabled} onChange={() => togglePlugin(plugin.filename)} />
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && plugins.length > 0 && (
        <button className="btn-primary" style={{ marginBottom: 24 }} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      )}

      <div style={S.infoBox}>
         To add a new plugin, place a <code>.py</code> file in the <code>plugins/</code> folder and restart the app.
      </div>
    </div>
  );
}

const S = {
  pageHeader: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 28,
  },
  heading:    { margin: 0, fontSize: 28, fontWeight: 600, color: '#1a1a1a', fontFamily: FONT, lineHeight: 1.2 },
  subheading: { margin: '6px 0 0', fontSize: 14, color: '#666', fontFamily: FONT },

  centered: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 12, paddingTop: 48, textAlign: 'center',
  },
  spinner:    { width: 28, height: 28, borderRadius: '50%', border: '3px solid #e0e0e0', borderTopColor: ACCENT },
  mutedText:  { fontSize: 14, color: '#888', fontFamily: FONT },
  emptyTitle: { fontSize: 18, fontWeight: 600, color: '#444', fontFamily: FONT },

  pluginCard: {
    background: '#fff', borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.07)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
    padding: '16px 20px',
    display: 'flex', alignItems: 'center', gap: 16,
  },
  pluginName:     { fontSize: 15, fontWeight: 600, color: '#1a1a1a', fontFamily: FONT },
  pluginFilename: { fontSize: 11, color: '#999', fontFamily: 'monospace', marginTop: 2 },

  badgeActive: {
    fontSize: 11, fontWeight: 600, fontFamily: FONT,
    background: '#dff6dd', color: '#1a6e1a',
    borderRadius: 10, padding: '2px 10px', border: '1px solid #a8d8a8',
  },
  badgeDisabled: {
    fontSize: 11, fontWeight: 600, fontFamily: FONT,
    background: '#f0f0f0', color: '#888',
    borderRadius: 10, padding: '2px 10px', border: '1px solid #ddd',
  },

  infoBox: {
    background: '#f0f6ff', border: '1px solid #c0d8f0',
    borderRadius: 8, padding: '14px 18px',
    fontSize: 13, color: '#1a3d6e', fontFamily: FONT,
    marginTop: 8,
  },
};
