import React, { useState, useEffect } from 'react';

const FONT   = "'Segoe UI Variable', 'Segoe UI', sans-serif";
const ACCENT = '#0067c0';

const SECTIONS = [
  { id: 'filters',  label: 'Capture Filters'  },
  { id: 'general',  label: 'General'           },
];

// ── Toggle switch (inline-style only) ────────────────────────────────────────

function Toggle({ checked, onChange }) {
  return (
    <div
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

function SectionSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0' }}>
      <div
        className="wsm-spinner"
        style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '3px solid #e0e0e0', borderTopColor: ACCENT, flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 13, color: '#888', fontFamily: FONT }}>Loading…</span>
    </div>
  );
}

// ── Capture Filters ───────────────────────────────────────────────────────────

function FiltersSection({ showToast }) {
  const [processes, setProcesses]   = useState(null);
  const [newEntry, setNewEntry]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [addError, setAddError]     = useState('');
  const [saveError, setSaveError]   = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await window.api.getCaptureFilters();
      setProcesses(data.excluded_processes || []);
    } catch {
      showToast('Could not load capture filters', 'error');
      setProcesses([]);
    }
  }

  function addProcess() {
    const v = newEntry.trim();
    if (!v) {
      setAddError('Cannot be empty');
      return;
    }
    if (processes.includes(v)) {
      setAddError('Already in list');
      return;
    }
    setProcesses(prev => [...prev, v]);
    setNewEntry('');
    setAddError('');
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await window.api.saveCaptureFilters({ excluded_processes: processes });
      showToast('Capture filters saved', 'success');
    } catch {
      setSaveError('Save failed. Please try again.');
      showToast('Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (processes === null) return <SectionSpinner />;

  return (
    <div>
      <p style={S.sectionDesc}>
        Processes listed here are excluded from workspace captures.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: addError ? 4 : 14 }}>
        <input
          style={{
            ...S.input, flex: 1,
            ...(addError ? { borderColor: '#c42b1c' } : {}),
          }}
          placeholder="e.g. SearchHost.exe"
          value={newEntry}
          onChange={e => { setNewEntry(e.target.value); if (addError) setAddError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') addProcess(); }}
        />
        <button className="btn-ghost btn-sm" onClick={addProcess}>Add</button>
      </div>
      {addError && <div style={{ ...S.errorMsg, marginBottom: 10 }}>{addError}</div>}
      {processes.length === 0 && (
        <div style={S.emptyMsg}>No excluded processes — all processes will be captured.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {processes.map(proc => (
          <div key={proc} style={S.filterRow}>
            <span style={{ fontFamily: FONT, fontSize: 14, color: '#333' }}>{proc}</span>
            <button
              onClick={() => setProcesses(prev => prev.filter(p => p !== proc))}
              style={S.removeBtn}
              title="Remove"
            >✕</button>
          </div>
        ))}
      </div>
      {saveError && <div style={S.errorMsg}>{saveError}</div>}
      <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}

// ── General ───────────────────────────────────────────────────────────────────

function GeneralSection({ showToast }) {
  const [settings, setSettings]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await window.api.getGuiSettings();
      setSettings({ auto_start_api: true, open_to_sessions: true, ...data });
    } catch {
      showToast('Could not load settings', 'error');
      setSettings({ auto_start_api: true, open_to_sessions: true });
    }
  }

  function toggle(key) { setSettings(prev => ({ ...prev, [key]: !prev[key] })); }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await window.api.saveGuiSettings(settings);
      showToast('Settings saved', 'success');
    } catch {
      setSaveError('Save failed. Please try again.');
      showToast('Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <SectionSpinner />;

  const TOGGLES = [
    { key: 'auto_start_api',   label: 'Launch API server on startup',   desc: 'Automatically start the Python API when the app opens.' },
    { key: 'open_to_sessions', label: 'Open to Sessions tab on launch', desc: 'Show the Sessions page when the app first opens.' },
  ];

  return (
    <div>
      <p style={S.sectionDesc}>Application behaviour settings.</p>
      <div style={{ marginBottom: 24 }}>
        {TOGGLES.map((t, i) => (
          <div
            key={t.key}
            style={{
              ...S.settingRow,
              borderBottom: i < TOGGLES.length - 1 ? '1px solid #f0f0f0' : 'none',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={S.settingLabel}>{t.label}</div>
              <div style={S.settingDesc}>{t.desc}</div>
            </div>
            <Toggle checked={!!settings[t.key]} onChange={() => toggle(t.key)} />
          </div>
        ))}
      </div>
      {saveError && <div style={S.errorMsg}>{saveError}</div>}
      <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function SettingsView({ showToast }) {
  const [active, setActive] = useState('filters');

  return (
    <div>
      <div style={S.pageHeader}>
        <h1 style={S.heading}>Settings</h1>
        <p style={S.subheading}>Configure Work Session Manager</p>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Left sub-nav */}
        <div style={S.subnav}>
          {SECTIONS.map(sec => (
            <button
              key={sec.id}
              className={active === sec.id ? 'settings-tab active' : 'settings-tab'}
              onClick={() => setActive(sec.id)}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* Section content */}
        <div style={S.sectionCard}>
          {active === 'filters' && <FiltersSection showToast={showToast} />}
          {active === 'general' && <GeneralSection showToast={showToast} />}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  pageHeader: { marginBottom: 28 },
  heading:    { margin: 0, fontSize: 28, fontWeight: 600, color: '#1a1a1a', fontFamily: FONT },
  subheading: { margin: '6px 0 0', fontSize: 14, color: '#666', fontFamily: FONT },

  subnav: { width: 178, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  navActive: {
    background: ACCENT, color: '#fff',
    border: 'none', borderRadius: 20,
    padding: '9px 16px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: FONT, textAlign: 'left',
  },
  navInactive: {
    background: 'transparent', color: '#555',
    border: '1px solid #d0d0d0', borderRadius: 20,
    padding: '8px 16px', fontSize: 13,
    cursor: 'pointer', fontFamily: FONT, textAlign: 'left',
    transition: 'background 0.15s',
  },
  sectionCard: {
    flex: 1, background: '#fff',
    borderRadius: 8, border: '1px solid rgba(0,0,0,0.07)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
    padding: '24px 28px',
  },

  sectionDesc: { fontSize: 13, color: '#666', fontFamily: FONT, margin: '0 0 20px' },
  emptyMsg:    { fontSize: 13, color: '#888', fontFamily: FONT, padding: '12px 0', textAlign: 'center' },
  errorMsg:    { fontSize: 12, color: '#c42b1c', fontFamily: FONT, marginBottom: 8 },

  input: {
    padding: '8px 12px', borderRadius: 4,
    border: '1px solid #d0d0d0', fontSize: 13,
    fontFamily: FONT, color: '#1a1a1a',
    background: '#fff', boxSizing: 'border-box', outline: 'none', minWidth: 0,
    transition: 'border-color 0.1s',
  },
  projectRow: { display: 'flex', gap: 8, alignItems: 'center' },
  filterRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#f9f9f9', borderRadius: 6,
    border: '1px solid #eeeeee', padding: '10px 14px',
  },
  removeBtn: {
    background: 'transparent', border: 'none',
    color: '#c42b1c', cursor: 'pointer',
    fontSize: 13, padding: '4px 6px',
    borderRadius: 4, fontFamily: FONT, flexShrink: 0,
  },

  settingRow:   { display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 0' },
  settingLabel: { fontSize: 14, fontWeight: 500, color: '#1a1a1a', fontFamily: FONT, marginBottom: 3 },
  settingDesc:  { fontSize: 12, color: '#888', fontFamily: FONT },
};
