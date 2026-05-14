const { contextBridge, ipcRenderer } = require('electron');

const BASE = 'http://localhost:5000';

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

contextBridge.exposeInMainWorld('api', {
  // Sessions
  getSessions:    ()                  => call('/sessions'),
  getSession:     (id)                => call(`/sessions/${id}`),
  deleteSession:  (id)                => call(`/sessions/${id}`, { method: 'DELETE' }),
  renameSession:  (id, name)          => call(`/sessions/${id}`, {
    method: 'PATCH', body: JSON.stringify({ name }),
  }),
  restoreSession: (id)                => call(`/restore/${id}`, { method: 'POST' }),
  restoreSessionStream: async (id, onMessage, onDone) => {
    const response = await fetch(`${BASE}/restore/${id}`, { method: 'POST' });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const msg = line.slice(6).trim();
          if (msg === '__DONE__') { onDone(); return; }
          if (msg) onMessage(msg);
        }
      }
    }
    onDone();
  },
  // Apps within a session
  deleteApp:      (sessionId, appId)  => call(`/sessions/${sessionId}/apps/${appId}`, { method: 'DELETE' }),
  updateAppOrder: async (sessionId, order) => {
    console.log('Saving order:', sessionId, order);
    const res = await fetch(`http://localhost:5000/sessions/${sessionId}/apps/order`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || `HTTP ${res.status}`);
    return result;
  },
  // Captures
  capture:        ()                  => call('/capture', { method: 'POST' }),
  getSaves:       ()                  => call('/saves'),
  getCaptureWindows: (name)           => call(`/saves/${encodeURIComponent(name)}/windows`),
  saveSession:    (captureName, name) => call('/saves', {
    method: 'POST', body: JSON.stringify({ capture_name: captureName, name }),
  }),
  deleteCapture:  (name)              => call(`/saves/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  // Window controls
  minimizeWindow:     () => ipcRenderer.send('minimize-window'),
  closeWindow:        () => ipcRenderer.send('close-window'),
  // Logs
  getLatestLog:       ()     => call('/logs/latest'),
  // Config
  getVscodeProjects:  ()     => call('/config/vscode-projects'),
  saveVscodeProjects: (data) => call('/config/vscode-projects', { method: 'POST', body: JSON.stringify(data) }),
  getCaptureFilters:  ()     => call('/config/capture-filters'),
  saveCaptureFilters: (data) => call('/config/capture-filters', { method: 'POST', body: JSON.stringify(data) }),
  getGuiSettings:     ()     => call('/config/gui-settings'),
  saveGuiSettings:    (data) => call('/config/gui-settings',   { method: 'POST', body: JSON.stringify(data) }),
  // Plugins
  getPlugins:         ()     => call('/plugins'),
  savePluginsConfig:  (data) => call('/plugins/config',        { method: 'POST', body: JSON.stringify({ plugins: data }) }),
});
