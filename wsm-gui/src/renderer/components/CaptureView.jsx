import React, { useState, useEffect } from 'react';
import { buildSuggestedName } from '../utils/appNames.js';

const FONT   = "'Segoe UI Variable', 'Segoe UI', sans-serif";
const ACCENT = '#0067c0';
const TS_RE  = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/;

function formatCaptureName(name) {
  const m = TS_RE.exec(name);
  if (!m) return name;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return d.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function Modal({ title, onClose, children }) {
  return (
    <div
      style={S.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <span style={S.modalTitle}>{title}</span>
          <button className="btn-modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div style={S.modalBody}>{children}</div>
      </div>
    </div>
  );
}

export default function CaptureView({ showToast }) {
  const [capturing, setCapturing]           = useState(false);
  const [captureResult, setCaptureResult]   = useState(null);
  const [captureError, setCaptureError]     = useState(null);
  const [captures, setCaptures]             = useState([]);
  const [loadingCaptures, setLoadingCaptures] = useState(true);

  // Selection
  const [selected, setSelected]             = useState(new Set());
  const [bulkModal, setBulkModal]           = useState(false);

  // Save modal
  const [saveModal, setSaveModal]           = useState(null);
  const [sessionName, setSessionName]       = useState('');
  const [nameSuggested, setNameSuggested]   = useState(false);
  const [saveError, setSaveError]           = useState('');
  const [savingSession, setSavingSession]   = useState(false);

  useEffect(() => { loadCaptures(); }, []);

  // ── Escape key to close modals ────────────────────────────

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (bulkModal) { setBulkModal(false); return; }
      if (saveModal) { setSaveModal(null);  return; }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bulkModal, saveModal]);

  async function loadCaptures() {
    setLoadingCaptures(true);
    try {
      const list = await window.api.getSaves();
      setCaptures(Array.isArray(list) ? [...list].sort().reverse() : []);
      setSelected(new Set());
    } catch {
      showToast('Could not load captures', 'error');
    } finally {
      setLoadingCaptures(false);
    }
  }

  // ── Capture ───────────────────────────────────────────────

  async function handleCapture() {
    setCapturing(true);
    setCaptureResult(null);
    setCaptureError(null);
    try {
      const r = await window.api.capture();
      setCaptureResult(r);
      showToast(`Captured ${r.windows_captured ?? 0} windows`, 'success');
      loadCaptures();
    } catch {
      setCaptureError('Capture failed. Make sure the API server is running.');
      showToast('Capture failed', 'error');
    } finally {
      setCapturing(false);
    }
  }

  // ── Save modal ────────────────────────────────────────────

  async function openSaveModal(captureName) {
    setSaveModal(captureName);
    setSessionName('');
    setNameSuggested(false);
    setSaveError('');
    console.log('Auto-suggest triggered for:', captureName);
    try {
      const windows = await window.api.getCaptureWindows(captureName);
      const suggestion = buildSuggestedName(Array.isArray(windows) ? windows : []);
      console.log('Suggested name:', suggestion);
      if (suggestion) {
        setSessionName(suggestion);
        setNameSuggested(true);
      }
    } catch {
      // fail silently — name stays empty
    }
  }

  async function handleSaveSession() {
    if (!sessionName.trim()) { setSaveError('Session name is required'); return; }
    setSavingSession(true);
    setSaveError('');
    try {
      const r = await window.api.saveSession(saveModal, sessionName.trim());
      showToast(`Session saved — ${r.applications_saved ?? 0} apps`, 'success');
      setSaveModal(null);
    } catch {
      setSaveError('Save failed — please try again');
    } finally {
      setSavingSession(false);
    }
  }

  // ── Selection ─────────────────────────────────────────────

  const allSelected = captures.length > 0 && captures.every(c => selected.has(c));

  function toggleSelect(cap) {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(cap) ? s.delete(cap) : s.add(cap);
      return s;
    });
  }

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(captures));
  }

  // ── Delete single ─────────────────────────────────────────

  async function handleDeleteCapture(cap) {
    setCaptures(prev => prev.filter(c => c !== cap));
    setSelected(prev => { const s = new Set(prev); s.delete(cap); return s; });
    try {
      const r = await window.api.deleteCapture(cap);
      if (r.error) throw new Error(r.error);
      showToast('Capture deleted');
    } catch {
      showToast('Could not delete capture', 'error');
      loadCaptures(); // revert
    }
  }

  // ── Delete selected ───────────────────────────────────────

  async function handleBulkDelete() {
    const toDelete = [...selected];
    setBulkModal(false);
    setSelected(new Set());
    let count = 0;
    for (const cap of toDelete) {
      try {
        const r = await window.api.deleteCapture(cap);
        if (!r.error) {
          setCaptures(prev => prev.filter(c => c !== cap));
          count++;
        }
      } catch { /* leave in list on network failure */ }
    }
    showToast(`${count} capture${count !== 1 ? 's' : ''} deleted`);
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div>
      <div style={S.pageHeader}>
        <h1 style={S.heading}>Capture</h1>
        <p style={S.subheading}>Snapshot your current desktop workspace</p>
      </div>

      {/* Main capture card */}
      <div style={S.captureCard}>
        <div style={S.captureIcon}>📸</div>
        <div style={S.captureTitle}>Capture Workspace</div>
        <p style={S.captureDesc}>
          Records all open windows with their positions, sizes, and executable paths.
        </p>
        <button
          className="btn-primary"
          style={S.captureBtn}
          onClick={handleCapture}
          disabled={capturing}
        >
          {capturing
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <span className="wsm-spinner" style={S.btnSpinner} />
                Capturing…
              </span>
            : 'Capture Now'
          }
        </button>

        {capturing && <div style={S.statusMsg}>Scanning open windows and processes…</div>}

        {captureResult && !capturing && (
          <div style={S.successBox}>
            <div style={S.successText}>
              ✓ Captured {captureResult.windows_captured} windows
              {captureResult.capture && ` — ${formatCaptureName(captureResult.capture)}`}
            </div>
            <button
              className="btn-primary btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => openSaveModal(captureResult.capture)}
            >
              Save This Session
            </button>
          </div>
        )}

        {captureError && !capturing && (
          <div style={S.errorBox}>{captureError}</div>
        )}
      </div>

      {/* Recent captures — always visible */}
      <div style={S.section}>
        <div style={S.listHeader}>
          {!loadingCaptures && captures.length > 0 ? (
            <label style={S.selectAllLabel}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                style={S.checkbox}
              />
              <span style={S.sectionTitle}>Recent Captures ({captures.length})</span>
            </label>
          ) : (
            <span style={S.sectionTitle}>Recent Captures</span>
          )}
          {selected.size > 0 && (
            <button
              className="btn-danger"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => setBulkModal(true)}
            >
              Delete Selected ({selected.size})
            </button>
          )}
        </div>

        {loadingCaptures ? (
          <div style={S.capturesLoading}>
            <div className="wsm-spinner" style={S.capturesSpinner} />
          </div>
        ) : captures.length === 0 ? (
          <div style={S.emptyCaptures}>
            <div style={S.emptyIcon}>📂</div>
            <div style={S.emptyTitle}>No captures found</div>
            <div style={S.emptyDesc}>Click Capture Now to take your first snapshot.</div>
          </div>
        ) : (
          <div style={S.captureList}>
            {captures.map(cap => (
              <div key={cap} style={S.captureRow}>
                <input
                  type="checkbox"
                  checked={selected.has(cap)}
                  onChange={() => toggleSelect(cap)}
                  style={S.checkbox}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.captureName}>{formatCaptureName(cap)}</div>
                  <div style={S.captureRaw}>{cap}</div>
                </div>
                <div style={S.captureActions}>
                  <button className="btn-ghost btn-sm" onClick={() => openSaveModal(cap)}>
                    Save
                  </button>
                  <button
                    className="btn-danger"
                    style={{ fontSize: 13, padding: '5px 10px' }}
                    onClick={() => handleDeleteCapture(cap)}
                    title="Delete this capture"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save modal */}
      {saveModal && (
        <Modal title="Save Session" onClose={() => setSaveModal(null)}>
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Capture</label>
            <div style={S.captureDisplay}>{formatCaptureName(saveModal)}</div>
          </div>
          <div style={{ marginBottom: saveError ? 6 : 16 }}>
            <label style={S.label}>
              Session name *
              {nameSuggested && <span style={S.suggestedBadge}>Suggested</span>}
            </label>
            <input
              type="text"
              style={{ ...S.input, ...(saveError && !sessionName.trim() ? { borderColor: '#c42b1c' } : {}) }}
              value={sessionName}
              onChange={e => { setSessionName(e.target.value); setNameSuggested(false); if (saveError) setSaveError(''); }}
              placeholder="e.g. Morning Dev Setup"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveSession(); }}
            />
            {!sessionName.trim() && (
              <div style={{ fontSize: 11, color: '#888', fontFamily: FONT, marginTop: 5 }}>
                Session name is required
              </div>
            )}
          </div>
          {saveError && <div style={S.saveError}>{saveError}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn-ghost btn-sm" onClick={() => setSaveModal(null)}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              onClick={handleSaveSession}
              disabled={savingSession || !sessionName.trim()}
            >
              {savingSession ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk delete confirm modal */}
      {bulkModal && (
        <Modal title="Delete Captures" onClose={() => setBulkModal(false)}>
          <p style={{ fontSize: 14, color: '#333', fontFamily: FONT, margin: '0 0 24px' }}>
            Delete <strong>{selected.size} capture{selected.size !== 1 ? 's' : ''}</strong>?{' '}
            This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-ghost btn-sm" onClick={() => setBulkModal(false)}>Cancel</button>
            <button className="btn-danger" onClick={handleBulkDelete}>
              Delete {selected.size}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  pageHeader: { marginBottom: 28 },
  heading:    { margin: 0, fontSize: 28, fontWeight: 600, color: '#1a1a1a', fontFamily: FONT },
  subheading: { margin: '6px 0 0', fontSize: 14, color: '#666', fontFamily: FONT },

  captureCard: {
    background: '#fff', borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
    padding: '32px 24px', textAlign: 'center', marginBottom: 24,
  },
  captureIcon:  { fontSize: 44, marginBottom: 16 },
  captureTitle: { fontSize: 18, fontWeight: 600, color: '#1a1a1a', fontFamily: FONT, marginBottom: 8 },
  captureDesc:  { fontSize: 14, color: '#666', fontFamily: FONT, margin: '0 auto 24px', maxWidth: 380 },
  captureBtn:   { padding: '14px 48px', fontSize: 14, minWidth: 200 },
  btnSpinner: {
    width: 14, height: 14, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
    display: 'inline-block',
  },
  statusMsg:  { marginTop: 14, fontSize: 13, color: '#666', fontFamily: FONT },
  successBox: {
    marginTop: 20, padding: '16px 24px',
    background: '#dff6dd', border: '1px solid #6ccb5f',
    borderRadius: 8, display: 'inline-block',
  },
  successText: { fontSize: 13, color: '#1a3d1a', fontFamily: FONT },
  errorBox: {
    marginTop: 20, padding: '12px 18px',
    background: '#fde7e9', border: '1px solid #f1707a',
    borderRadius: 8, fontSize: 13, color: '#3d1a1a', fontFamily: FONT,
    display: 'inline-block',
  },

  section: { marginTop: 8 },

  listHeader: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  selectAllLabel: {
    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
  },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: '#333', fontFamily: FONT },
  checkbox: { width: 15, height: 15, cursor: 'pointer', accentColor: ACCENT, flexShrink: 0 },

  // Captures loading spinner
  capturesLoading: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    padding: '40px 0',
  },
  capturesSpinner: {
    width: 32, height: 32, borderRadius: '50%',
    border: '3px solid #e0e0e0', borderTopColor: ACCENT,
  },

  // Captures empty state
  emptyCaptures: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', textAlign: 'center',
    padding: '40px 0', gap: 8,
  },
  emptyIcon:  { fontSize: 36 },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: '#444', fontFamily: FONT },
  emptyDesc:  { fontSize: 13, color: '#888', fontFamily: FONT },

  captureList: {
    display: 'flex', flexDirection: 'column', gap: 8,
    maxHeight: '50vh', overflowY: 'auto',
  },
  captureRow: {
    background: '#fff', borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    padding: '10px 14px',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  captureName:    { fontSize: 13, color: '#1a1a1a', fontFamily: FONT, fontWeight: 500 },
  captureRaw:     { fontSize: 11, color: '#aaa', fontFamily: 'monospace', marginTop: 2 },
  captureActions: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 },

  // Modal
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    width: 420, maxWidth: '92vw',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid #f0f0f0', flexShrink: 0,
  },
  modalTitle: { fontSize: 15, fontWeight: 600, color: '#1a1a1a', fontFamily: FONT },
  modalBody:  { padding: 20 },
  label: { display: 'block', fontSize: 12, color: '#555', fontWeight: 500, marginBottom: 6, fontFamily: FONT },
  suggestedBadge: { marginLeft: 6, fontSize: 10, color: '#888', background: '#f0f0f0', borderRadius: 4, padding: '1px 5px', fontWeight: 400, verticalAlign: 'middle' },
  captureDisplay: {
    padding: '8px 12px', background: '#f5f5f5',
    borderRadius: 4, border: '1px solid #e0e0e0',
    fontSize: 13, color: '#444', fontFamily: FONT,
  },
  input: {
    width: '100%', padding: '8px 12px',
    borderRadius: 4, border: '1px solid #d0d0d0',
    fontSize: 13, fontFamily: FONT, color: '#1a1a1a',
    background: '#fff', boxSizing: 'border-box', outline: 'none',
  },
  saveError: { fontSize: 12, color: '#c42b1c', fontFamily: FONT, marginBottom: 4 },
};
