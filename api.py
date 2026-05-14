import glob
import json
import os
import queue
import shutil
import sqlite3
import sys
import threading

from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS

def get_app_data_dir():
    """Returns the user data directory for WSM.
    - In development: project root (existing behaviour)
    - In production (PyInstaller): %APPDATA%/WorkSessionManager
    """
    if getattr(sys, 'frozen', False):
        appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
        data_dir = os.path.join(appdata, 'WorkSessionManager')
    else:
        data_dir = os.path.dirname(os.path.abspath(__file__))
    return data_dir

ROOT       = get_app_data_dir()
BASE_DIR   = os.path.dirname(os.path.abspath(__file__)) if not getattr(sys, 'frozen', False) else sys._MEIPASS
DB_PATH    = os.path.join(ROOT, 'database', 'session_manager.db')
CONFIG_DIR = os.path.join(ROOT, 'config')


def _read_config(filename, default):
    path = os.path.join(CONFIG_DIR, filename)
    if not os.path.exists(path):
        return default
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _write_config(filename, data):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    path = os.path.join(CONFIG_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def init_database():
    os.makedirs(os.path.join(ROOT, 'database'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'captures'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'logs'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'config'), exist_ok=True)

    sys_procs_dst = os.path.join(ROOT, 'system_processes.txt')
    if not os.path.exists(sys_procs_dst):
        if getattr(sys, 'frozen', False):
            sys_procs_src = os.path.join(sys._MEIPASS, 'system_processes.txt')
        else:
            sys_procs_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'system_processes.txt')
        if os.path.exists(sys_procs_src):
            shutil.copy2(sys_procs_src, sys_procs_dst)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            session_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS applications (
            app_id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            executable_path TEXT,
            window_title TEXT,
            launch_args TEXT,
            pos_x INTEGER,
            pos_y INTEGER,
            width INTEGER,
            height INTEGER,
            launch_type TEXT DEFAULT 'default',
            is_minimized INTEGER DEFAULT 0,
            is_maximized INTEGER DEFAULT 0,
            process_name TEXT,
            plugin_data TEXT,
            restore_order INTEGER,
            FOREIGN KEY (session_id) REFERENCES sessions (session_id)
        )
    ''')
    conn.commit()
    conn.close()
    print(f'[WSM] Data directory: {ROOT}')
    print('[WSM] Database initialized')

init_database()

from view_session import get_sessions
from delete_session import delete_session
from save_session import (
    list_captures,
    load_capture,
    insert_session,
    insert_application,
    ensure_launch_type_column,
)
import capture_progs
import restore_session as restore_mod
from plugin_manager import PluginManager

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "PATCH", "DELETE", "OPTIONS"], "allow_headers": ["Content-Type"]}})

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    return response


def row_to_dict(row):
    return {key: row[key] for key in row.keys()}


def _get_apps_with_ids(session_id):
    """Like get_applications but includes rowid as app_id and returns plain dicts."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(applications)")
    available = {r[1] for r in cursor.fetchall()}
    base = ["app_id", "executable_path", "window_title", "launch_args",
            "pos_x", "pos_y", "width", "height"]
    optional = ["process_name", "launch_type", "is_maximized", "is_minimized", "plugin_data",
                "restore_order"]
    cols = base + [c for c in optional if c in available]
    has_restore_order = "restore_order" in available
    order_clause = (
        "ORDER BY CASE WHEN restore_order IS NULL THEN 1 ELSE 0 END, restore_order"
        if has_restore_order else ""
    )
    cursor.execute(
        f"SELECT {', '.join(cols)} FROM applications WHERE session_id = ? {order_clause}",
        (session_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


# GET /sessions
@app.route("/sessions", methods=["GET"])
def list_sessions():
    sessions = get_sessions()
    return jsonify([
        {"session_id": s[0], "name": s[1], "created_at": s[2]}
        for s in sessions
    ])


# GET /sessions/<id>
@app.route("/sessions/<int:session_id>", methods=["GET"])
def get_session(session_id):
    sessions = get_sessions()
    session = next((s for s in sessions if s[0] == session_id), None)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    return jsonify({
        "session_id": session[0],
        "name": session[1],
        "created_at": session[2],
        "applications": _get_apps_with_ids(session_id),
    })


# DELETE /sessions/<id>
@app.route("/sessions/<int:session_id>", methods=["DELETE"])
def remove_session(session_id):
    sessions = get_sessions()
    if not any(s[0] == session_id for s in sessions):
        return jsonify({"error": "Session not found"}), 404
    delete_session(session_id)
    return jsonify({"deleted": session_id})


# POST /capture
@app.route("/capture", methods=["POST"])
def run_capture():
    print(f'[DEBUG] Flask cwd: {os.getcwd()}')
    print(f'[DEBUG] api.py location: {os.path.dirname(os.path.abspath(__file__))}')
    print(f'[DEBUG] capture_filters.json exists: {os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "config", "capture_filters.json"))}')
    base = os.path.join(ROOT, "captures", capture_progs.timestamp())
    capture_progs.ensure_dir(base)

    capture_progs.capture_screenshot(os.path.join(base, "screenshot.png"))

    kept, excluded = capture_progs.list_visible_windows()

    with open(os.path.join(base, "open_windows.json"), "w", encoding="utf-8") as f:
        json.dump(kept, f, indent=2)

    with open(os.path.join(base, "filter_log.json"), "w", encoding="utf-8") as f:
        json.dump(excluded, f, indent=2)

    processes = capture_progs.list_top_processes()
    with open(os.path.join(base, "processes.json"), "w", encoding="utf-8") as f:
        json.dump(processes, f, indent=2, ensure_ascii=False)

    capture_name = os.path.basename(base)
    return jsonify({
        "capture": capture_name,
        "path": base,
        "windows_captured": len(kept),
        "windows_excluded": len(excluded),
    })


# GET /saves
@app.route("/saves", methods=["GET"])
def list_saves():
    return jsonify(list_captures())


# DELETE /saves/<folder_name>
@app.route("/saves/<folder_name>", methods=["DELETE"])
def delete_capture(folder_name):
    captures_root = os.path.realpath(os.path.join(ROOT, "captures"))
    target = os.path.realpath(os.path.join(captures_root, folder_name))
    # Security: reject any path that escapes the captures directory
    if not target.startswith(captures_root + os.sep):
        return jsonify({"error": "Invalid folder name"}), 400
    if not os.path.isdir(target):
        return jsonify({"error": "Capture not found"}), 400
    shutil.rmtree(target)
    return jsonify({"ok": True})


# GET /saves/<folder_name>/windows
@app.route('/saves/<folder_name>/windows', methods=['GET'])
def get_capture_windows(folder_name):
    captures_root = os.path.join(ROOT, 'captures')
    target = os.path.realpath(os.path.join(captures_root, folder_name))
    if not target.startswith(os.path.realpath(captures_root)):
        return jsonify({'error': 'Invalid folder name'}), 400
    windows_file = os.path.join(target, 'open_windows.json')
    if not os.path.exists(windows_file):
        return jsonify([])
    with open(windows_file, encoding='utf-8') as f:
        return jsonify(json.load(f))


# POST /saves
@app.route("/saves", methods=["POST"])
def save_from_capture():
    data = request.get_json() or {}
    capture_name = data.get("capture_name")

    if not capture_name:
        return jsonify({"error": "capture_name is required"}), 400

    if capture_name not in list_captures():
        return jsonify({"error": f"Capture '{capture_name}' not found"}), 404

    custom_name = (data.get("name") or "").strip()
    session_name = custom_name if custom_name else capture_name

    windows = load_capture(capture_name)
    ensure_launch_type_column()
    session_id = insert_session(session_name)
    plugin_manager = PluginManager()

    saved_count = 0
    seen = set()

    for window in windows:
        exe_path = window.get("executable_path")
        if not exe_path:
            continue

        try:
            plugin_data = plugin_manager.capture_state(window)
            if not isinstance(plugin_data, dict):
                plugin_data = {}
        except Exception:
            plugin_data = {}

        plugin_data_json = json.dumps(plugin_data)
        instruction = plugin_manager.get_restore_instruction(window, plugin_data)
        restore_executable_path = instruction.get("executable_path") or exe_path

        if restore_executable_path in seen:
            continue
        seen.add(restore_executable_path)

        position = window.get("position", {})
        size = window.get("size", {})

        insert_application(
            session_id,
            restore_executable_path,
            window.get("process_name"),
            window.get("title"),
            instruction.get("launch_args"),
            position.get("x"),
            position.get("y"),
            size.get("width"),
            size.get("height"),
            int(bool(window.get("is_maximized", False))),
            int(bool(window.get("is_minimized", False))),
            instruction.get("launch_type", "default"),
            plugin_data_json,
        )
        saved_count += 1

    return jsonify({
        "session_id": session_id,
        "capture": capture_name,
        "applications_saved": saved_count,
    })


# PATCH /sessions/<id>
@app.route("/sessions/<int:session_id>", methods=["PATCH"])
def rename_session(session_id):
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE sessions SET name = ? WHERE session_id = ?", (name, session_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# DELETE /sessions/<id>/apps/<app_id>
@app.route("/sessions/<int:session_id>/apps/<int:app_id>", methods=["DELETE"])
def delete_app(session_id, app_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM applications WHERE app_id = ? AND session_id = ?",
        (app_id, session_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# PATCH /sessions/<id>/apps/order
@app.route('/sessions/<int:session_id>/apps/order', methods=['PATCH'])
def update_app_order(session_id):
    try:
        order_data = request.json.get('order', [])
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(applications)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'restore_order' not in columns:
            cursor.execute("ALTER TABLE applications ADD COLUMN restore_order INTEGER")
            conn.commit()
        for item in order_data:
            cursor.execute(
                'UPDATE applications SET restore_order = ? WHERE app_id = ? AND session_id = ?',
                (int(item['restore_order']), int(item['app_id']), int(session_id))
            )
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# POST /restore/<id>  — streams progress via Server-Sent Events
@app.route("/restore/<int:session_id>", methods=["POST"])
def restore_session(session_id):
    sessions = restore_mod.get_sessions()
    session = next((s for s in sessions if s[0] == session_id), None)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    def generate():
        log_queue = queue.Queue()

        def progress_callback(message):
            log_queue.put(message)

        def run_restore():
            try:
                restore_mod.restore_apps_for_session(session_id, progress_callback=progress_callback)
            except Exception as e:
                log_queue.put(f'ERROR: {str(e)}')
            finally:
                log_queue.put('__DONE__')

        thread = threading.Thread(target=run_restore, daemon=True)
        thread.start()

        while True:
            msg = log_queue.get()
            if msg == '__DONE__':
                yield 'data: __DONE__\n\n'
                break
            yield f'data: {msg}\n\n'

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


# GET /logs/latest
@app.route("/logs/latest", methods=["GET"])
def get_latest_log():
    log_dir = os.path.join(ROOT, "logs")
    files = glob.glob(os.path.join(log_dir, "*.log")) if os.path.isdir(log_dir) else []
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        return jsonify({"filename": None, "content": "No logs found"})
    latest = max(files, key=os.path.getmtime)
    with open(latest, encoding="utf-8", errors="replace") as f:
        content = f.read()
    return jsonify({"filename": os.path.basename(latest), "content": content})


# GET /config/capture-filters
@app.route("/config/capture-filters", methods=["GET"])
def get_capture_filters():
    defaults = {"excluded_processes": []}
    data = _read_config("capture_filters.json", None)
    if data is None:
        _write_config("capture_filters.json", defaults)
        data = defaults
    return jsonify(data)


# POST /config/capture-filters
@app.route("/config/capture-filters", methods=["POST"])
def save_capture_filters():
    _write_config("capture_filters.json", request.get_json() or {})
    return jsonify({"ok": True})


# GET /config/gui-settings
@app.route("/config/gui-settings", methods=["GET"])
def get_gui_settings():
    defaults = {"auto_start_api": True, "open_to_sessions": True}
    data = _read_config("gui_settings.json", None)
    if data is None:
        _write_config("gui_settings.json", defaults)
        data = defaults
    return jsonify(data)


# POST /config/gui-settings
@app.route("/config/gui-settings", methods=["POST"])
def save_gui_settings():
    _write_config("gui_settings.json", request.get_json() or {})
    return jsonify({"ok": True})


# GET /plugins
@app.route("/plugins", methods=["GET"])
def get_plugins():
    plugins_dir = os.path.join(ROOT, "plugins")
    NAME_MAP = {"vscode": "VS Code", "chrome": "Chrome"}

    plugin_files = []
    if os.path.isdir(plugins_dir):
        for filename in sorted(os.listdir(plugins_dir)):
            if filename in ("__init__.py", "base_plugin.py") or not filename.endswith(".py"):
                continue
            plugin_files.append(filename)

    # Create config with all enabled if it doesn't exist yet
    plugin_config = _read_config("plugins_config.json", None)
    if plugin_config is None:
        plugin_config = {f: True for f in plugin_files}
        _write_config("plugins_config.json", plugin_config)

    result = []
    for filename in plugin_files:
        stem = filename[:-3].replace("_plugin", "")
        name = NAME_MAP.get(stem, stem.replace("_", " ").title())
        result.append({
            "filename": filename,
            "name": name,
            "enabled": plugin_config.get(filename, True),
        })
    return jsonify(result)


# POST /plugins/config
@app.route("/plugins/config", methods=["POST"])
def save_plugin_config():
    data = request.get_json() or {}
    # Accept both { "plugins": {...} } and a flat dict
    config = data.get("plugins", data)
    _write_config("plugins_config.json", config)
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(port=5000)
