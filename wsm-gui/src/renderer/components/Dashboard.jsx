import React, { useState, useEffect, useRef, useMemo } from 'react';
import { APP_NAMES, buildSuggestedName } from '../utils/appNames.js';

const FONT   = "'Segoe UI Variable', 'Segoe UI', sans-serif";
const ACCENT = '#0067c0';
const TS_RE  = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/;

function formatSessionName(name) {
  const m = TS_RE.exec(name);
  if (!m) return name;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${date} — ${time}`;
}

function formatCaptureName(name) {
  const m = TS_RE.exec(name);
  if (!m) return name;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatShortDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

// Returns { type: 'json'|'raw', value } or null if empty/absent
function parsePluginData(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length === 0) {
      return null; // empty object — no plugin data
    }
    return { type: 'json', value: parsed };
  } catch {
    return { type: 'raw', value: raw }; // unparseable — show as-is
  }
}

function lineColor(line) {
  if (line.startsWith('ERROR') || line.startsWith('Failed'))          return '#f48771';
  if (line.startsWith('Launching') || line.startsWith('Plugin'))      return '#9cdcfe';
  if (line.startsWith('Restore complete'))                            return '#4ec9b0';
  if (line.startsWith('Window found') || line.startsWith('Launched')) return '#b5cea8';
  return '#d4d4d4';
}

// ─── Restore log modal ────────────────────────────────────

function RestoreLogModal({ name, lines, done, hasError, onClose }) {
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const statusText  = done ? (hasError ? 'Restore Failed' : 'Restore Complete ✓') : 'Restoring...';
  const statusColor = done ? (hasError ? '#f48771' : '#4ec9b0') : '#888';

  return (
    <div
      style={S.overlay}
      onClick={e => { if (e.target === e.currentTarget && done) onClose(); }}
    >
      <div style={S.restoreLogCard}>
        <div style={S.restoreLogHeader}>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, fontFamily: FONT }}>
            Restoring Session
          </div>
          <div style={{ color: '#888', fontSize: 13, fontFamily: FONT, marginTop: 3 }}>{name}</div>
        </div>

        {/* Indeterminate → solid progress bar */}
        <div style={S.restoreProgressTrack}>
          {done ? (
            <div style={{ position: 'absolute', inset: 0, background: hasError ? '#f48771' : '#4ec9b0' }} />
          ) : (
            <div className="wsm-restore-progress-bar" />
          )}
        </div>

        <div ref={logRef} style={S.restoreLogArea}>
          {lines.map((line, i) => (
            <div key={i} style={{ color: lineColor(line) }}>
              {line}
              {i === lines.length - 1 && !done && <span className="wsm-cursor">▌</span>}
            </div>
          ))}
        </div>

        <div style={S.restoreLogFooter}>
          <span style={{ fontSize: 13, color: statusColor, fontFamily: FONT, fontWeight: done ? 600 : 400 }}>
            {statusText}
          </span>
          <button className="btn-ghost btn-sm" onClick={onClose} disabled={!done}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared modal shell ───────────────────────────────────

function Modal({ title, onClose, children, cardStyle }) {
  return (
    <div
      style={S.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...S.modal, ...cardStyle }}>
        <div style={S.modalHeader}>
          <span style={S.modalTitle}>{title}</span>
          <button className="btn-modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div style={S.modalBody}>{children}</div>
      </div>
    </div>
  );
}

// ─── Detail modal sub-components ─────────────────────────

function LaunchBadge({ type }) {
  const isPlugin = type && type !== 'default' && type !== 'generic';
  return (
    <span style={isPlugin ? S.launchBadgePlugin : S.launchBadgeGeneric}>
      {isPlugin ? type : 'generic'}
    </span>
  );
}

function StateBadge({ isMaximized, isMinimized }) {
  if (isMaximized) return <span style={S.stateBadgeMax}>Maximized</span>;
  if (isMinimized) return <span style={S.stateBadgeMin}>Minimized</span>;
  return null;
}

function AppRow({ app, isLast, expanded, onTogglePlugin }) {
  const pluginData = parsePluginData(app.plugin_data);
  const rawTitle   = app.window_title || app.executable_path || '—';
  const shortTitle = rawTitle.length > 60 ? rawTitle.slice(0, 60) + '…' : rawTitle;
  const processLabel = app.process_name
    || (app.executable_path ? app.executable_path.split(/[\\/]/).pop() : '—');

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid #f0f0f0', paddingBottom: 18, marginBottom: 18 }}>
      {/* Main two-column row */}
      <div style={{ display: 'flex', gap: 20 }}>

        {/* Left: process name, window title, launch badge */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.appRowProcess}>{processLabel}</div>
          <div style={S.appRowTitle}>{shortTitle}</div>
          <LaunchBadge type={app.launch_type} />
        </div>

        {/* Right: metadata */}
        <div style={S.appRowMeta}>
          <div style={S.appRowExe}>{app.executable_path || '—'}</div>
          <div style={S.appRowMetaLine}>
            Position:&nbsp;
            <span style={S.appRowMetaVal}>X: {app.pos_x ?? '—'}</span>
            &nbsp;&nbsp;
            <span style={S.appRowMetaVal}>Y: {app.pos_y ?? '—'}</span>
          </div>
          <div style={S.appRowMetaLine}>
            Size:&nbsp;
            <span style={S.appRowMetaVal}>
              {app.width ?? '—'} × {app.height ?? '—'}
            </span>
          </div>
          <StateBadge isMaximized={!!app.is_maximized} isMinimized={!!app.is_minimized} />
        </div>
      </div>

      {/* Plugin data collapsible */}
      {pluginData && (
        <div style={{ marginTop: 10 }}>
          <button style={S.pluginToggle} onClick={onTogglePlugin}>
            {expanded ? '▼' : '▶'}&nbsp;Plugin Data
          </button>
          {expanded && (
            <pre style={S.pluginPre}>
              {pluginData.type === 'json'
                ? JSON.stringify(pluginData.value, null, 2)
                : pluginData.value}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function DetailModal({ session, loading, onRestore, onClose }) {
  const [expandedPlugins, setExpandedPlugins] = useState(new Set());

  function togglePlugin(appId) {
    setExpandedPlugins(prev => {
      const next = new Set(prev);
      next.has(appId) ? next.delete(appId) : next.add(appId);
      return next;
    });
  }

  const apps      = session.applications ?? [];
  const appCount  = apps.length;
  const hasApps   = !loading && appCount > 0;

  return (
    <div
      style={S.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={S.detailCard}>

        {/* Header */}
        <div style={S.detailHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.detailName}>{formatSessionName(session.name)}</div>
            <div style={S.detailCreatedLine}>
              Created {formatDate(session.created_at)}
            </div>
          </div>
          <button className="btn-modal-close" onClick={onClose} style={{ flexShrink: 0 }}>
            &#x2715;
          </button>
        </div>

        {/* Summary bar */}
        {!loading && (
          <div style={S.detailSummaryBar}>
            <span style={S.summaryPill}>
              {appCount} app{appCount !== 1 ? 's' : ''}
            </span>
            <span style={S.summaryPill}>
              Created: {formatShortDate(session.created_at)}
            </span>
          </div>
        )}

        {/* Body */}
        <div style={S.detailBody}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '56px 0' }}>
              <div className="wsm-spinner" style={S.bigSpinner} />
            </div>
          ) : !hasApps ? (
            <div style={{ textAlign: 'center', color: '#888', fontFamily: FONT, fontSize: 14, padding: '56px 0' }}>
              No apps in this session
            </div>
          ) : (
            <div>
              {apps.map((app, i) => (
                <AppRow
                  key={app.app_id ?? i}
                  app={app}
                  isLast={i === apps.length - 1}
                  expanded={expandedPlugins.has(app.app_id)}
                  onTogglePlugin={() => togglePlugin(app.app_id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.detailFooter}>
          <button className="btn-ghost btn-sm" onClick={onClose}>Close</button>
          {!loading && (
            <button className="btn-primary btn-sm" onClick={onRestore}>
              Restore Session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Session card ─────────────────────────────────────────

function SessionCard({
  session, appCount, restoring,
  confirmingDelete, confirmingRestore,
  onRestoreClick, onRestoreConfirm, onRestoreCancel,
  onView, onEdit,
  onDeleteClick, onDeleteConfirm, onDeleteCancel,
}) {
  const displayName = formatSessionName(session.name);
  return (
    <div className="wsm-card" style={S.card}>
      {restoring && (
        <div className="wsm-restore-progress">
          <div className="wsm-restore-progress-bar" />
        </div>
      )}
      <div style={S.cardTop}>
        <div style={S.cardName}>{displayName}</div>
        {appCount != null && (
          <span style={S.badge}>{appCount} app{appCount !== 1 ? 's' : ''}</span>
        )}
      </div>
      <div style={S.cardDate}>{formatDate(session.created_at)}</div>

      {/* Inline restore confirmation */}
      {confirmingRestore && !restoring ? (
        <div style={S.inlineConfirm}>
          <div style={S.inlineConfirmMsg}>
            Restore this session? Current windows will not be closed.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-primary btn-sm" onClick={onRestoreConfirm}>Confirm</button>
            <button className="btn-ghost btn-sm" onClick={onRestoreCancel}>Cancel</button>
          </div>
        </div>
      ) : confirmingDelete ? (
        <div style={S.inlineConfirm}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={S.inlineSure}>Sure?</span>
            <button
              className="btn-danger"
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={onDeleteConfirm}
            >
              Yes
            </button>
            <button className="btn-ghost btn-sm" onClick={onDeleteCancel}>No</button>
          </div>
        </div>
      ) : (
        <div style={S.cardActions}>
          <button className="btn-primary btn-sm" onClick={onRestoreClick} disabled={restoring}>
            {restoring ? 'Restoring…' : 'Restore'}
          </button>
          <button className="btn-ghost btn-sm" onClick={onView}>View Details</button>
          <button className="btn-ghost btn-sm" onClick={onEdit}>&#x270F; Edit</button>
          <button className="btn-danger" onClick={onDeleteClick}>Delete</button>
        </div>
      )}
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────

function EditModal({ session, tab, name, apps, appsLoading, renaming, orderChanged, savingOrder, onTabChange, onNameChange, onRename, onDeleteApp, onSaveOrder, onReorder, onClose }) {
  const [dragIndex, setDragIndex]       = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const nameUnchanged = name.trim() === formatSessionName(session.name);

  function handleDragStart(e, index) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }

  function handleDrop(e, index) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragOverIndex(null);
      return;
    }
    const newApps = [...apps];
    const [moved] = newApps.splice(dragIndex, 1);
    newApps.splice(index, 0, moved);
    onReorder(newApps);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragLeave(e) {
    if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
      setDragOverIndex(null);
    }
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  return (
    <Modal
      title={`Edit — ${formatSessionName(session.name)}`}
      onClose={onClose}
      cardStyle={{ width: 480 }}
    >
      <div style={S.tabBar}>
        {[['rename', 'Rename'], ['apps', 'Apps']].map(([id, label]) => (
          <button
            key={id}
            style={tab === id ? S.tabActive : S.tabInactive}
            onClick={() => onTabChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'rename' && (
        <div>
          <label style={S.label}>Session name</label>
          <input
            type="text"
            style={S.input}
            value={name}
            onChange={e => onNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim() && !nameUnchanged) onRename(); }}
            autoFocus
          />
          <div style={S.modalFooter}>
            <button
              className="btn-primary btn-sm"
              onClick={onRename}
              disabled={renaming || !name.trim() || nameUnchanged}
            >
              {renaming ? 'Saving…' : 'Save Name'}
            </button>
          </div>
        </div>
      )}

      {tab === 'apps' && (
        <div>
          {appsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0' }}>
              <div className="wsm-spinner" style={S.spinner} />
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={S.appsCount}>
                  {apps.length} app{apps.length !== 1 ? 's' : ''} in this session
                </div>
                {orderChanged && (
                  <button
                    className="btn-primary btn-sm"
                    onClick={onSaveOrder}
                    disabled={savingOrder}
                    style={{ fontSize: 12 }}
                  >
                    {savingOrder ? 'Saving…' : 'Save Order'}
                  </button>
                )}
              </div>
              {apps.length === 0 && (
                <div style={S.noAppsWarning}>&#x26A0; This session has no apps</div>
              )}
              {apps.length >= 2 && (
                <div style={S.dragHint}>Drag to set the order apps will be restored</div>
              )}
              <div style={S.appList}>
                {apps.map((app, i) => (
                  <div
                    key={app.app_id}
                    draggable
                    onDragStart={e => handleDragStart(e, i)}
                    onDragOver={e => handleDragOver(e, i)}
                    onDrop={e => handleDrop(e, i)}
                    onDragLeave={handleDragLeave}
                    onDragEnd={handleDragEnd}
                    style={{
                      ...S.editAppRow,
                      borderTop: dragOverIndex === i ? '2px solid #0067c0' : '1px solid #ebebeb',
                      opacity: dragIndex === i ? 0.5 : 1,
                    }}
                  >
                    <div style={S.dragHandle}>⠿</div>
                    <div style={S.orderBadge}>{i + 1}</div>
                    <div style={S.editAppInfo}>
                      <div style={S.editAppProcess}>{app.process_name || '—'}</div>
                      <div style={S.editAppTitle}>
                        {app.window_title || app.executable_path}
                      </div>
                    </div>
                    <button
                      className="remove-btn"
                      style={S.removeBtn}
                      onClick={() => onDeleteApp(app.app_id)}
                      title="Remove from session"
                    >
                      &#x2715;
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Dashboard (Sessions view) ────────────────────────────

export default function Dashboard({ showToast }) {
  // API connectivity (initial load with retry)
  const [apiStatus, setApiStatus]         = useState('checking');
  const retryCountRef                     = useRef(0);
  const retryTimerRef                     = useRef(null);
  const doConnectRef                      = useRef(null);

  // List
  const [sessions, setSessions]           = useState([]);
  const [loading, setLoading]             = useState(false);
  const [loadError, setLoadError]         = useState(false);
  const [appCounts, setAppCounts]         = useState({});

  // Capture button
  const [capturing, setCapturing]         = useState(false);

  // Save modal
  const [saveModal, setSaveModal]         = useState(false);
  const [captures, setCaptures]           = useState([]);
  const [selected, setSelected]           = useState('');
  const [sessionName, setSessionName]     = useState('');
  const [nameSuggested, setNameSuggested] = useState(false);
  const [saveError, setSaveError]         = useState('');
  const [saving, setSaving]               = useState(false);

  // Detail modal
  const [detailModal, setDetailModal]     = useState(null); // null | partial-session | full-session
  const [detailLoading, setDetailLoading] = useState(false);

  // Edit modal
  const [editModal, setEditModal]         = useState(null);
  const [editTab, setEditTab]             = useState('rename');
  const [editName, setEditName]           = useState('');
  const [editApps, setEditApps]           = useState([]);
  const [editAppsLoading, setEditAppsLoading] = useState(false);
  const [renaming, setRenaming]           = useState(false);
  const [editOriginalOrder, setEditOriginalOrder] = useState([]);
  const [orderChanged, setOrderChanged]   = useState(false);
  const [savingOrder, setSavingOrder]     = useState(false);

  // Restore
  const [restoring, setRestoring]         = useState(null);

  // Inline confirms
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState(null);

  // Log modal
  const [logModal, setLogModal]           = useState(null);

  // Restore log modal (SSE streaming)
  const [restoreLogModal, setRestoreLogModal] = useState(null);

  // Search & sort
  const [search, setSearch]           = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [sortBy, setSortBy]           = useState('newest');

  const visibleSessions = useMemo(() => {
    let list = sessions;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => {
        const name = formatSessionName(s.name).toLowerCase();
        const date = s.created_at ? new Date(s.created_at).toLocaleString('en-US').toLowerCase() : '';
        return name.includes(q) || date.includes(q);
      });
    }
    return [...list].sort((a, b) => {
      const ca = appCounts[a.session_id] ?? 0;
      const cb = appCounts[b.session_id] ?? 0;
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === 'most')   return cb - ca;
      if (sortBy === 'fewest') return ca - cb;
      return 0;
    });
  }, [sessions, search, sortBy, appCounts]);

  // ── Initial connection with retry ────────────────────────

  doConnectRef.current = async function connectAndLoad() {
    try {
      const data = await window.api.getSessions();
      const list = Array.isArray(data) ? data : [];
      setSessions(list);
      retryCountRef.current = 0;
      setApiStatus('ready');
      fetchAppCounts(list);
    } catch {
      retryCountRef.current += 1;
      if (retryCountRef.current >= 10) {
        setApiStatus('failed');
      } else {
        setApiStatus('retrying');
        retryTimerRef.current = setTimeout(() => doConnectRef.current(), 2000);
      }
    }
  };

  useEffect(() => {
    doConnectRef.current();
    return () => clearTimeout(retryTimerRef.current);
  }, []);

  // ── Escape key ───────────────────────────────────────────

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (restoreLogModal) {
        if (restoreLogModal.done) setRestoreLogModal(null);
        return; // always consume — can't close while running
      }
      if (logModal)    { setLogModal(null);    return; }
      if (editModal)   { setEditModal(null);   return; }
      if (detailModal) { setDetailModal(null); return; }
      if (saveModal)   { setSaveModal(false);  return; }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [restoreLogModal, logModal, editModal, detailModal, saveModal]);

  // ── Reload sessions ──────────────────────────────────────

  async function loadSessions() {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await window.api.getSessions();
      const list = Array.isArray(data) ? data : [];
      setSessions(list);
      setSearch('');
      setSortBy('newest');
      fetchAppCounts(list);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAppCounts(list) {
    const results = await Promise.allSettled(
      list.map(s => window.api.getSession(s.session_id))
    );
    const counts = {};
    list.forEach((s, i) => {
      if (results[i].status === 'fulfilled') {
        counts[s.session_id] = results[i].value.applications?.length ?? 0;
      }
    });
    setAppCounts(counts);
  }

  // ── Capture ──────────────────────────────────────────────

  async function handleCapture() {
    setCapturing(true);
    try {
      await window.api.capture();
      showToast('Workspace captured successfully', 'success');
    } catch {
      showToast('Capture failed — check the logs', 'error');
    } finally {
      setCapturing(false);
    }
  }

  // ── Save modal ───────────────────────────────────────────

  async function openSaveModal() {
    let list;
    try {
      list = await window.api.getSaves();
      if (!list.length) {
        showToast('No captures found. Run a capture first.', 'info');
        return;
      }
    } catch {
      showToast('Could not load captures', 'error');
      return;
    }
    setCaptures(list);
    setSelected(list[0]);
    setSessionName('');
    setNameSuggested(false);
    setSaveError('');
    setSaveModal(true);
    try {
      console.log('Auto-suggest triggered for:', list[0]);
      const windows = await window.api.getCaptureWindows(list[0]);
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

  async function handleSave() {
    if (!sessionName.trim()) { setSaveError('Session name is required'); return; }
    setSaveError('');
    setSaving(true);
    try {
      await window.api.saveSession(selected, sessionName.trim());
      showToast('Session saved', 'success');
      setSaveModal(false);
      loadSessions();
    } catch {
      setSaveError('Save failed — please try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleCaptureChange(captureName) {
    setSelected(captureName);
    console.log('Auto-suggest triggered for:', captureName);
    try {
      const windows = await window.api.getCaptureWindows(captureName);
      const suggestion = buildSuggestedName(Array.isArray(windows) ? windows : []);
      console.log('Suggested name:', suggestion);
      if (!suggestion) return;
      if (!sessionName.trim() || nameSuggested) {
        setSessionName(suggestion);
        setNameSuggested(true);
      }
    } catch {
      // fail silently
    }
  }

  // ── Delete (inline confirm) ──────────────────────────────

  function handleDeleteClick(id)  { setRestoreConfirm(null); setDeleteConfirm(id); }
  function handleDeleteCancel()   { setDeleteConfirm(null); }

  async function handleDeleteConfirm(id) {
    setDeleteConfirm(null);
    try {
      await window.api.deleteSession(id);
      setSessions(prev => prev.filter(s => s.session_id !== id));
      setSearch('');
      setSortBy('newest');
      showToast('Session deleted');
    } catch {
      showToast('Delete failed', 'error');
    }
  }

  // ── Restore ──────────────────────────────────────────────

  function handleRestoreClick(id) { setDeleteConfirm(null); setRestoreConfirm(id); }
  function handleRestoreCancel()  { setRestoreConfirm(null); }

  // Shared restore execution — SSE streaming modal, toast fallback on connection failure
  async function executeRestore(id, sessionName) {
    setRestoreLogModal({ id, name: sessionName || `Session ${id}`, lines: [], done: false, hasError: false });
    try {
      await window.api.restoreSessionStream(
        id,
        (msg) => {
          setRestoreLogModal(prev => prev ? { ...prev, lines: [...prev.lines, msg] } : prev);
        },
        () => {
          setRestoreLogModal(prev => {
            if (!prev) return prev;
            const hasError = prev.lines.some(l => l.startsWith('ERROR') || l.startsWith('Failed'));
            return { ...prev, done: true, hasError };
          });
          loadSessions();
        },
      );
    } catch {
      // SSE connection failed — fall back to regular call + toast
      setRestoreLogModal(null);
      setRestoring(id);
      try {
        const r = await window.api.restoreSession(id);
        const n = r.results?.filter(x => x.status === 'restored').length ?? 0;
        showToast(`Restored ${n} application${n !== 1 ? 's' : ''}`, 'success');
      } catch {
        showToast('Restore failed — check logs', 'error', {
          label: 'View Log',
          onClick: async () => {
            try {
              const log = await window.api.getLatestLog();
              setLogModal(log);
            } catch {
              showToast('Could not read log file', 'error');
            }
          },
        });
      } finally {
        setRestoring(null);
      }
    }
  }

  async function handleRestoreConfirm(id) {
    setRestoreConfirm(null);
    const session = sessions.find(s => s.session_id === id);
    executeRestore(id, session ? formatSessionName(session.name) : null);
  }

  // ── Detail modal ─────────────────────────────────────────

  async function handleViewDetails(id, session) {
    // Open immediately with card-level data so the modal appears at once
    setDetailModal(session);
    setDetailLoading(true);
    try {
      const data = await window.api.getSession(id);
      setDetailModal(data);
    } catch {
      showToast('Could not load session details', 'error');
      setDetailModal(null);
    } finally {
      setDetailLoading(false);
    }
  }

  // ── Edit modal ───────────────────────────────────────────

  async function openEditModal(session) {
    setEditModal(session);
    setEditTab('rename');
    setEditName(formatSessionName(session.name));
    setEditApps([]);
    setEditOriginalOrder([]);
    setOrderChanged(false);
    setEditAppsLoading(true);
    try {
      const data = await window.api.getSession(session.session_id);
      const apps = data.applications ?? [];
      setEditApps(apps);
      setEditOriginalOrder(apps.map(a => a.app_id));
    } catch {
      showToast('Could not load session apps', 'error');
    } finally {
      setEditAppsLoading(false);
    }
  }

  async function handleRename() {
    const name = editName.trim();
    if (!name) return;
    setRenaming(true);
    try {
      await window.api.renameSession(editModal.session_id, name);
      setSessions(prev =>
        prev.map(s => s.session_id === editModal.session_id ? { ...s, name } : s)
      );
      setEditModal(prev => ({ ...prev, name }));
      showToast('Session renamed', 'success');
    } catch {
      showToast('Rename failed', 'error');
    } finally {
      setRenaming(false);
    }
  }

  async function handleDeleteApp(appId) {
    setEditApps(prev => prev.filter(a => a.app_id !== appId));
    setAppCounts(prev => ({
      ...prev,
      [editModal.session_id]: Math.max(0, (prev[editModal.session_id] ?? 1) - 1),
    }));
    try {
      await window.api.deleteApp(editModal.session_id, appId);
    } catch {
      showToast('Could not remove app', 'error');
      const data = await window.api.getSession(editModal.session_id).catch(() => null);
      if (data) setEditApps(data.applications ?? []);
    }
  }

  function handleReorderApps(newApps) {
    setEditApps(newApps);
    const newIds = newApps.map(a => a.app_id);
    setOrderChanged(JSON.stringify(newIds) !== JSON.stringify(editOriginalOrder));
  }

  async function handleSaveOrder() {
    const snapshotApps = [...editApps];
    const order = snapshotApps.map((app, i) => ({ app_id: Number(app.app_id), restore_order: i }));
    setSavingOrder(true);
    try {
      await window.api.updateAppOrder(editModal.session_id, order);
      setEditOriginalOrder(snapshotApps.map(a => a.app_id));
      setOrderChanged(false);
      showToast('Restore order saved', 'success');
    } catch {
      showToast('Could not save order', 'error');
      const appMap = Object.fromEntries(snapshotApps.map(a => [a.app_id, a]));
      const reverted = editOriginalOrder.map(id => appMap[id]).filter(Boolean);
      setEditApps(reverted);
      setOrderChanged(false);
    } finally {
      setSavingOrder(false);
    }
  }

  // ── Full-page connection overlays ────────────────────────

  if (apiStatus === 'checking' || apiStatus === 'retrying') {
    return (
      <div style={S.fullPage}>
        <div className="wsm-spinner" style={S.bigSpinner} />
        <div style={S.fullPageTitle}>Connecting to API…</div>
        {retryCountRef.current > 0 && (
          <div style={S.fullPageSub}>Attempt {retryCountRef.current + 1} of 10…</div>
        )}
      </div>
    );
  }

  if (apiStatus === 'failed') {
    return (
      <div style={S.fullPage}>
        <div style={S.fullPageTitle}>Could not connect to the API server.</div>
        <div style={S.fullPageSub}>Try restarting the app.</div>
        <button
          className="btn-primary"
          style={{ marginTop: 20 }}
          onClick={() => {
            clearTimeout(retryTimerRef.current);
            retryCountRef.current = 0;
            setApiStatus('checking');
            setTimeout(() => doConnectRef.current(), 0);
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Normal render ────────────────────────────────────────

  return (
    <div>
      {loadError && (
        <div style={S.errorBanner}>
          <span>Could not load sessions. Is the API running?</span>
          <button className="btn-ghost btn-sm" onClick={loadSessions}>Retry</button>
        </div>
      )}

      <div style={S.pageHeader}>
        <div>
          <h1 style={S.heading}>Sessions</h1>
          <p style={S.subheading}>
            {search.trim()
              ? `Showing ${visibleSessions.length} of ${sessions.length} session${sessions.length !== 1 ? 's' : ''}`
              : `${sessions.length} saved session${sessions.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>
        <div style={S.headerActions}>
          <button className="btn-ghost" onClick={handleCapture} disabled={capturing}>
            {capturing
              ? <span style={S.btnLoadingInner}>
                  <span className="wsm-spinner" style={S.btnSpinner} />
                  Capturing…
                </span>
              : 'Capture Workspace'
            }
          </button>
          <button className="btn-primary" onClick={openSaveModal}>Save Session</button>
        </div>
      </div>

      {!loading && sessions.length > 0 && (
        <div style={S.searchRow}>
          <div style={S.searchInputWrap}>
            <input
              type="text"
              placeholder="Search sessions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={{ ...S.searchInput, borderColor: searchFocused ? ACCENT : '#e0e0e0' }}
            />
          </div>
          <div style={S.sortWrap}>
            <label style={S.sortLabel}>Sort by</label>
            <select
              style={S.sortSelect}
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="most">Most apps</option>
              <option value="fewest">Fewest apps</option>
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div style={S.centered}>
          <div className="wsm-spinner" style={S.spinner} />
          <span style={S.mutedText}>Loading sessions…</span>
        </div>
      ) : sessions.length === 0 ? (
        <div style={S.centered}>
          <div style={S.emptyIcon}>🗂️</div>
          <div style={S.emptyTitle}>No sessions saved yet</div>
          <div style={S.mutedText}>Capture your workspace to get started.</div>
        </div>
      ) : visibleSessions.length === 0 ? (
        <div style={S.centered}>
          <div style={S.emptyTitle}>No sessions match your search.</div>
          <button style={S.clearSearchBtn} onClick={() => setSearch('')}>Clear search</button>
        </div>
      ) : (
        <div style={S.grid}>
          {visibleSessions.map(s => (
            <SessionCard
              key={s.session_id}
              session={s}
              appCount={appCounts[s.session_id]}
              restoring={restoring === s.session_id}
              confirmingDelete={deleteConfirm === s.session_id}
              confirmingRestore={restoreConfirm === s.session_id}
              onRestoreClick={() => handleRestoreClick(s.session_id)}
              onRestoreConfirm={() => handleRestoreConfirm(s.session_id)}
              onRestoreCancel={handleRestoreCancel}
              onView={() => handleViewDetails(s.session_id, s)}
              onEdit={() => openEditModal(s)}
              onDeleteClick={() => handleDeleteClick(s.session_id)}
              onDeleteConfirm={() => handleDeleteConfirm(s.session_id)}
              onDeleteCancel={handleDeleteCancel}
            />
          ))}
        </div>
      )}

      {/* Save modal */}
      {saveModal && (
        <Modal
          title="Save Session"
          onClose={() => setSaveModal(false)}
          cardStyle={{ width: 400, borderRadius: 12 }}
        >
          <div style={S.fieldGroup}>
            <label style={S.label}>
              Session name *
              {nameSuggested && <span style={S.suggestedBadge}>Suggested</span>}
            </label>
            <input
              type="text"
              style={{ ...S.input, ...(saveError && !sessionName.trim() ? S.inputError : {}) }}
              value={sessionName}
              onChange={e => { setSessionName(e.target.value); setNameSuggested(false); if (saveError) setSaveError(''); }}
              placeholder="e.g. Morning Dev Setup"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            />
            {!sessionName.trim() && (
              <div style={S.fieldHint}>Session name is required</div>
            )}
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Capture to save</label>
            <select
              style={S.select}
              value={selected}
              onChange={e => handleCaptureChange(e.target.value)}
            >
              {captures.map(c => (
                <option key={c} value={c}>{formatCaptureName(c)}</option>
              ))}
            </select>
          </div>
          {saveError && <div style={S.saveError}>{saveError}</div>}
          <div style={S.modalFooter}>
            <button className="btn-ghost btn-sm" onClick={() => setSaveModal(false)}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || !sessionName.trim()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* Detail modal */}
      {detailModal && (
        <DetailModal
          session={detailModal}
          loading={detailLoading}
          onRestore={() => {
            const id   = detailModal.session_id;
            const name = formatSessionName(detailModal.name);
            setDetailModal(null);
            executeRestore(id, name);
          }}
          onClose={() => setDetailModal(null)}
        />
      )}

      {/* Restore log modal */}
      {restoreLogModal && (
        <RestoreLogModal
          name={restoreLogModal.name}
          lines={restoreLogModal.lines}
          done={restoreLogModal.done}
          hasError={restoreLogModal.hasError}
          onClose={() => setRestoreLogModal(null)}
        />
      )}

      {/* Log modal */}
      {logModal && (
        <Modal
          title={`Log — ${logModal.filename}`}
          onClose={() => setLogModal(null)}
          cardStyle={{ width: 640 }}
        >
          <div style={{ fontSize: 11, color: '#888', fontFamily: FONT, marginBottom: 10 }}>
            {logModal.filename}
          </div>
          <pre style={{
            background: '#1e1e1e', color: '#d0d0d0',
            borderRadius: 6, padding: '14px 16px',
            fontSize: 11, lineHeight: 1.6, fontFamily: 'monospace',
            overflowY: 'auto', maxHeight: 420,
            margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {logModal.content}
          </pre>
        </Modal>
      )}

      {/* Edit modal */}
      {editModal && (
        <EditModal
          session={editModal}
          tab={editTab}
          name={editName}
          apps={editApps}
          appsLoading={editAppsLoading}
          renaming={renaming}
          orderChanged={orderChanged}
          savingOrder={savingOrder}
          onTabChange={setEditTab}
          onNameChange={setEditName}
          onRename={handleRename}
          onDeleteApp={handleDeleteApp}
          onSaveOrder={handleSaveOrder}
          onReorder={handleReorderApps}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────

const S = {
  // Full-page overlays
  fullPage: {
    position: 'fixed', inset: 0, zIndex: 500,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#f3f3f3', gap: 16, textAlign: 'center',
  },
  bigSpinner: {
    width: 32, height: 32, borderRadius: '50%',
    border: '3px solid #e0e0e0', borderTopColor: ACCENT,
  },
  fullPageTitle: { fontSize: 18, fontWeight: 600, color: '#333', fontFamily: FONT },
  fullPageSub:   { fontSize: 13, color: '#888', fontFamily: FONT },

  // Error banner
  errorBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, padding: '12px 16px', marginBottom: 20,
    background: '#fde7e9', border: '1px solid #f1707a', borderRadius: 6,
    fontSize: 13, color: '#3d1a1a', fontFamily: FONT,
  },

  pageHeader: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 28,
  },
  heading:    { margin: 0, fontSize: 28, fontWeight: 600, color: '#1a1a1a', fontFamily: FONT, lineHeight: 1.2 },
  subheading: { margin: '6px 0 0', fontSize: 14, color: '#666', fontFamily: FONT },
  headerActions: { display: 'flex', gap: 8, alignItems: 'center' },

  btnLoadingInner: { display: 'flex', alignItems: 'center', gap: 7 },
  btnSpinner: {
    width: 13, height: 13, borderRadius: '50%',
    border: `2px solid rgba(0,103,192,0.25)`,
    borderTopColor: ACCENT, flexShrink: 0,
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
  },

  card: {
    background: '#ffffff', borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
    padding: '18px 20px',
    display: 'flex', flexDirection: 'column', gap: 8,
    position: 'relative', overflow: 'hidden',
  },
  cardTop:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  cardName:   { fontSize: 16, fontWeight: 600, color: '#1a1a1a', fontFamily: FONT, flex: 1, lineHeight: 1.4 },
  badge:      { background: '#e8f0fe', color: ACCENT, borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 500, fontFamily: FONT, flexShrink: 0, whiteSpace: 'nowrap' },
  cardDate:   { fontSize: 12, color: '#666', fontFamily: FONT },
  cardActions: { display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' },

  inlineConfirm: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0 4px' },
  inlineConfirmMsg: { fontSize: 12, color: '#555', fontFamily: FONT, lineHeight: 1.4 },
  inlineSure: { fontSize: 13, fontWeight: 600, color: '#c42b1c', fontFamily: FONT },

  centered:  { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 320, textAlign: 'center' },
  spinner:   { width: 32, height: 32, borderRadius: '50%', border: '3px solid #e0e0e0', borderTopColor: ACCENT },
  mutedText: { fontSize: 14, color: '#888', fontFamily: FONT, maxWidth: 340 },
  emptyIcon:  { fontSize: 44 },
  emptyTitle: { fontSize: 18, fontWeight: 600, color: '#444', fontFamily: FONT },

  // Shared modal overlay
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },

  // Generic modal card (used by Modal shell)
  modal: {
    background: '#fff', borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    width: 500, maxWidth: '92vw', maxHeight: '80vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid #f0f0f0', flexShrink: 0,
  },
  modalTitle: {
    fontSize: 15, fontWeight: 600, color: '#1a1a1a', fontFamily: FONT,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
  },
  modalBody:   { padding: 20, overflowY: 'auto', flex: 1 },
  modalFooter: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' },

  // ── Detail modal ────────────────────────────────────────

  detailCard: {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 8px 40px rgba(0,0,0,0.20)',
    width: 700, maxWidth: '96vw', maxHeight: '80vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  detailHeader: {
    display: 'flex', alignItems: 'flex-start', gap: 16,
    padding: '22px 24px 16px',
    borderBottom: '1px solid #f0f0f0', flexShrink: 0,
  },
  detailName: {
    fontSize: 20, fontWeight: 600, color: '#1a1a1a', fontFamily: FONT,
    lineHeight: 1.3, marginBottom: 4,
  },
  detailCreatedLine: { fontSize: 13, color: '#888', fontFamily: FONT },
  detailSummaryBar: {
    display: 'flex', gap: 8, padding: '12px 24px',
    borderBottom: '1px solid #f0f0f0', flexShrink: 0,
  },
  summaryPill: {
    background: '#e8f0fe', color: ACCENT,
    borderRadius: 10, padding: '3px 10px',
    fontSize: 12, fontWeight: 500, fontFamily: FONT,
  },
  detailBody: {
    padding: '20px 24px', overflowY: 'auto', flex: 1,
  },
  detailFooter: {
    display: 'flex', gap: 8, justifyContent: 'flex-end',
    padding: '14px 24px', borderTop: '1px solid #f0f0f0', flexShrink: 0,
  },

  // ── App row ─────────────────────────────────────────────

  appRowProcess: {
    fontSize: 14, fontWeight: 600, color: '#1a1a1a',
    fontFamily: FONT, marginBottom: 3,
  },
  appRowTitle: {
    fontSize: 12, color: '#888', fontFamily: FONT,
    marginBottom: 7, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  appRowMeta: {
    flexShrink: 0, width: 280,
    display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end',
  },
  appRowExe: {
    fontSize: 11, color: '#aaa', fontFamily: 'monospace',
    wordBreak: 'break-all', textAlign: 'right', lineHeight: 1.4,
  },
  appRowMetaLine: {
    fontSize: 11, color: '#777', fontFamily: FONT,
  },
  appRowMetaVal: {
    fontFamily: 'monospace', fontWeight: 500,
  },

  // Launch type badge
  launchBadgeGeneric: {
    background: '#f0f0f0', color: '#666',
    borderRadius: 10, padding: '2px 8px',
    fontSize: 11, fontFamily: FONT, fontWeight: 500,
  },
  launchBadgePlugin: {
    background: '#e8f0fe', color: ACCENT,
    borderRadius: 10, padding: '2px 8px',
    fontSize: 11, fontFamily: FONT, fontWeight: 500,
  },

  // Window state badges
  stateBadgeMax: {
    background: '#e8f0fe', color: ACCENT,
    borderRadius: 10, padding: '2px 8px',
    fontSize: 11, fontFamily: FONT, fontWeight: 500,
    alignSelf: 'flex-end',
  },
  stateBadgeMin: {
    background: '#f0f0f0', color: '#666',
    borderRadius: 10, padding: '2px 8px',
    fontSize: 11, fontFamily: FONT, fontWeight: 500,
    alignSelf: 'flex-end',
  },

  // Plugin data collapsible
  pluginToggle: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 11, color: '#555', fontFamily: FONT,
    padding: 0, display: 'flex', alignItems: 'center', gap: 4,
  },
  pluginPre: {
    background: '#f5f5f5', borderRadius: 4, padding: '10px 12px',
    fontSize: 11, fontFamily: 'monospace',
    margin: '8px 0 0', overflowX: 'auto',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    lineHeight: 1.5,
  },

  // ── Restore log modal ────────────────────────────────────

  restoreLogCard: {
    background: '#1e1e1e', borderRadius: 8,
    boxShadow: '0 8px 40px rgba(0,0,0,0.50)',
    width: 600, maxWidth: '96vw', height: 500,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  restoreLogHeader: {
    padding: '18px 20px 14px',
    borderBottom: '1px solid #2d2d2d', flexShrink: 0,
  },
  restoreProgressTrack: {
    height: 3, background: '#2d2d2d',
    position: 'relative', overflow: 'hidden', flexShrink: 0,
  },
  restoreLogArea: {
    flex: 1, overflowY: 'auto', padding: 12,
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
    fontSize: 13, lineHeight: 1.7,
  },
  restoreLogFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 20px',
    borderTop: '1px solid #2d2d2d', flexShrink: 0,
  },

  // ── Form fields ─────────────────────────────────────────

  fieldGroup:  { marginBottom: 16 },
  label:       { display: 'block', fontSize: 12, color: '#555', fontWeight: 500, marginBottom: 6, fontFamily: FONT },
  suggestedBadge: { marginLeft: 6, fontSize: 10, color: '#888', background: '#f0f0f0', borderRadius: 4, padding: '1px 5px', fontWeight: 400, verticalAlign: 'middle' },
  input: {
    width: '100%', padding: '8px 12px',
    borderRadius: 4, border: '1px solid #d0d0d0',
    fontSize: 13, fontFamily: FONT, color: '#1a1a1a',
    background: '#fff', boxSizing: 'border-box',
    outline: 'none', transition: 'border-color 0.1s',
  },
  inputError:  { borderColor: '#c42b1c' },
  fieldHint:   { fontSize: 11, color: '#888', fontFamily: FONT, marginTop: 5 },
  select: {
    width: '100%', padding: '8px 12px',
    borderRadius: 4, border: '1px solid #d0d0d0',
    fontSize: 13, fontFamily: FONT, color: '#1a1a1a',
    background: '#fff', boxSizing: 'border-box', outline: 'none',
  },
  saveError: { fontSize: 12, color: '#c42b1c', fontFamily: FONT, marginTop: -8, marginBottom: 4 },

  // ── Search & sort bar ────────────────────────────────────

  searchRow: {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
  },
  searchInputWrap: {
    position: 'relative', width: 300,
  },
  searchIcon: {
    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
    fontSize: 14, pointerEvents: 'none', userSelect: 'none',
  },
  searchInput: {
    width: '100%', padding: '8px 12px',
    border: '1px solid #e0e0e0', borderRadius: 6,
    fontSize: 14, fontFamily: FONT, color: '#1a1a1a',
    background: '#fff', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.1s',
  },
  sortWrap: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  sortLabel: {
    fontSize: 14, color: '#666', fontFamily: FONT, whiteSpace: 'nowrap',
  },
  sortSelect: {
    padding: '8px 32px 8px 12px', border: '1px solid #e0e0e0', borderRadius: 6,
    fontSize: 14, fontFamily: FONT, color: '#1a1a1a',
    background: '#fff', outline: 'none', cursor: 'pointer',
    appearance: 'none', WebkitAppearance: 'none',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
  },
  clearSearchBtn: {
    background: 'none', border: 'none', color: ACCENT,
    fontSize: 14, fontFamily: FONT, cursor: 'pointer',
    textDecoration: 'underline', padding: 0, marginTop: 8,
  },

  // ── Edit modal ──────────────────────────────────────────

  tabBar: { display: 'flex', gap: 6, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' },
  tabActive:   { background: ACCENT, color: '#fff', border: 'none', borderRadius: 20, padding: '6px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: FONT },
  tabInactive: { background: 'transparent', color: '#555', border: '1px solid #d0d0d0', borderRadius: 20, padding: '6px 20px', fontSize: 13, cursor: 'pointer', fontFamily: FONT },

  appsCount:     { fontSize: 13, fontWeight: 600, color: '#333', fontFamily: FONT, marginBottom: 0 },
  noAppsWarning: { fontSize: 13, color: '#b83c1e', fontFamily: FONT, padding: '10px 14px', background: '#fde7e9', borderRadius: 6, border: '1px solid #f1707a', marginBottom: 12 },
  dragHint:      { fontSize: 12, color: '#999', fontStyle: 'italic', fontFamily: FONT, marginBottom: 10 },
  appList:       { display: 'flex', flexDirection: 'column', gap: 0 },
  editAppRow:    { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 6, border: '1px solid #ebebeb', background: '#f8f8f8', marginBottom: 6, userSelect: 'none' },
  editAppInfo:   { flex: 1, minWidth: 0 },
  editAppProcess: { fontSize: 11, color: '#888', fontFamily: FONT, marginBottom: 2 },
  editAppTitle:  { fontSize: 13, fontWeight: 500, color: '#1a1a1a', fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  removeBtn:     { background: 'transparent', color: '#c42b1c', border: 'none', cursor: 'pointer', fontSize: 13, padding: '4px 6px', borderRadius: 4, flexShrink: 0, fontFamily: FONT, lineHeight: 1 },
  dragHandle:    { color: '#bbb', fontSize: 16, cursor: 'grab', userSelect: 'none', flexShrink: 0, lineHeight: 1 },
  orderBadge:    { width: 20, height: 20, borderRadius: '50%', background: '#e8e8e8', color: '#888', fontSize: 11, fontWeight: 600, fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
};
