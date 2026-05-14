# Work Session Management Tool (WSM)

WSM is a Windows desktop application for capturing, saving, and restoring workspace sessions. It records open applications, window positions, sizes, and states, then restores them on demand.

---

## Features

- Capture all open windows with position, size, and state
- Save sessions to a local SQLite database
- Restore sessions with full window placement and state
- Plugin system for application-specific capture and restore behavior
- Chrome tab capture and restore via remote debugging protocol
- VS Code workspace detection and restore
- Capture filters to exclude specific processes
- Session management: rename, edit, reorder apps, delete
- Restore ordering: control which apps launch first
- Electron-based GUI with Windows 11 styling
- Live restore progress log
- REST API backend (Flask) for GUI-backend communication

---

## Technologies

**Backend**
- Python 3.10+
- Flask, flask-cors
- SQLite
- pywin32
- psutil

**Frontend**
- Electron
- React
- Vite

---

## Project Structure

```
wsm/
├── main.py                  # CLI entry point
├── api.py                   # Flask REST API
├── capture_progs.py         # Window and process capture
├── save_session.py          # Session save logic
├── restore_session.py       # Session restore logic
├── delete_session.py        # Session deletion
├── view_session.py          # Session listing and detail
├── plugin_manager.py        # Plugin loader and dispatcher
├── plugins/
│   ├── base_plugin.py       # Plugin base class
│   ├── chrome_plugin.py     # Chrome tab capture and restore
│   └── vscode_plugin.py     # VS Code workspace restore
├── wsm-gui/                 # Electron + React frontend
│   ├── src/
│   │   ├── main.js          # Electron main process
│   │   ├── preload.js       # IPC bridge
│   │   └── renderer/        # React components
│   └── package.json
├── database/                # SQLite database (gitignored)
├── captures/                # Captured workspace snapshots (gitignored)
├── logs/                    # Restore logs (gitignored)
├── config/                  # User configuration files (gitignored)
└── system_processes.txt     # Base process exclusion list
```

---

## Installation

### Prerequisites

- Windows 10 or 11
- Python 3.10 or later
- Node.js 18 or later

### Backend

```bash
pip install -r requirements.txt
```

### Frontend

```bash
cd wsm-gui
npm install
```

---

## Running the Application

### GUI (recommended)

Start the Flask API:

```bash
python api.py
```

In a separate terminal, start the Electron app:

```bash
cd wsm-gui
npm run dev
```

The Electron app will attempt to start the Flask API automatically on launch.

### CLI (legacy)

```bash
python main.py
```

---

## Plugins

Plugins handle application-specific capture and restore logic. Each plugin is a Python file in the `plugins/` folder that extends `BasePlugin`.

**Built-in plugins:**

- `chrome_plugin.py` - Captures open Chrome tabs via the Chrome DevTools Protocol and restores them on session restore. Requires Chrome to be launched with `--remote-debugging-port=9222 --user-data-dir=C:\ChromeDebug`.
- `vscode_plugin.py` - Detects VS Code windows and restores them to the correct workspace.

**Adding a plugin:**

Place a new `.py` file in the `plugins/` folder that extends `BasePlugin` and implements `can_handle`, `capture_state`, `generate_restore_instruction`, and `restore`. Restart the app to load it.

---

## Configuration

Configuration files are stored in the `config/` folder and can be managed through the GUI Settings page.

| File | Purpose |
|---|---|
| `capture_filters.json` | Processes excluded from captures |
| `plugins_config.json` | Plugin enabled/disabled state |
| `gui_settings.json` | GUI behaviour settings |

---

## Chrome Tab Capture

To enable Chrome tab capture, launch Chrome with the remote debugging flag before capturing:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=C:\ChromeDebug
```

Once Chrome is running with this flag, WSM will automatically capture all open tab URLs when a workspace is captured.

---

## Disclaimer

WSM is a Windows-focused project. Core functionality depends on Windows APIs (pywin32) and is not compatible with macOS or Linux.