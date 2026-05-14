import json
import sqlite3
import os
import subprocess
import sys
import time

import psutil
import win32con
import win32gui
import win32process

from plugin_manager import PluginManager

def get_data_dir():
    if getattr(sys, 'frozen', False):
        appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
        return os.path.join(appdata, 'WorkSessionManager')
    return os.path.dirname(os.path.abspath(__file__))

DATA_DIR = get_data_dir()
DB_PATH  = os.path.join(DATA_DIR, 'database', 'session_manager.db')
LOG_DIR  = os.path.join(DATA_DIR, 'logs')
RESTORE_LOG_PATH = None


def setup_restore_log():
    global RESTORE_LOG_PATH

    os.makedirs(LOG_DIR, exist_ok=True)
    timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")
    RESTORE_LOG_PATH = os.path.join(LOG_DIR, f"restore_{timestamp}.log")


def write_log(message):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {message}"

    print(log_line)

    if RESTORE_LOG_PATH:
        with open(RESTORE_LOG_PATH, "a", encoding="utf-8") as log_file:
            log_file.write(log_line + "\n")

# -----------------------------
# Database Functions
# -----------------------------

def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    return any(column[1] == column_name for column in cursor.fetchall())

def get_sessions():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT session_id, name, created_at FROM sessions")
    sessions = cursor.fetchall()

    conn.close()
    return sessions


def parse_plugin_data(plugin_data):
    if not plugin_data:
        return {}

    try:
        parsed_plugin_data = json.loads(plugin_data)
        if isinstance(parsed_plugin_data, dict):
            return parsed_plugin_data
    except Exception:
        pass

    return {}


def get_applications(session_id):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    has_launch_type = column_exists(cursor, "applications", "launch_type")
    has_process_name = column_exists(cursor, "applications", "process_name")
    has_is_maximized = column_exists(cursor, "applications", "is_maximized")
    has_is_minimized = column_exists(cursor, "applications", "is_minimized")
    has_plugin_data = column_exists(cursor, "applications", "plugin_data")
    has_restore_order = column_exists(cursor, "applications", "restore_order")

    columns = [
        "executable_path",
        "launch_args",
        "window_title",
        "pos_x",
        "pos_y",
        "width",
        "height",
    ]
    if has_process_name:
        columns.append("process_name")
    if has_launch_type:
        columns.append("launch_type")
    if has_is_maximized:
        columns.append("is_maximized")
    if has_is_minimized:
        columns.append("is_minimized")
    if has_plugin_data:
        columns.append("plugin_data")

    order_clause = (
        "ORDER BY CASE WHEN restore_order IS NULL THEN 1 ELSE 0 END, restore_order"
        if has_restore_order else ""
    )
    cursor.execute(f"""
        SELECT {", ".join(columns)}
        FROM applications
        WHERE session_id = ?
        {order_clause}
    """, (session_id,))

    apps = cursor.fetchall()

    conn.close()
    return [
        {
            "executable_path": app["executable_path"],
            "process_name": app["process_name"] if has_process_name else None,
            "launch_args": app["launch_args"],
            "window_title": app["window_title"],
            "pos_x": app["pos_x"],
            "pos_y": app["pos_y"],
            "width": app["width"],
            "height": app["height"],
            "launch_type": app["launch_type"] if has_launch_type else "default",
            "is_maximized": app["is_maximized"] if has_is_maximized else False,
            "is_minimized": app["is_minimized"] if has_is_minimized else False,
            "plugin_data": parse_plugin_data(app["plugin_data"]) if has_plugin_data else {},
        }
        for app in apps
    ]


def restore_apps_for_session(session_id, progress_callback=None):
    """Restore a session by ID with optional progress callbacks. Returns list of results."""
    setup_restore_log()

    sessions = get_sessions()
    session = next((s for s in sessions if s[0] == session_id), None)
    if not session:
        raise ValueError(f"Session {session_id} not found")

    session_name = session[1]
    if progress_callback:
        progress_callback(f'Starting restore for session: {session_name}')

    apps = get_applications(session_id)
    plugin_manager = PluginManager()
    results = []

    for app in apps:
        exe_path = app["executable_path"]
        result = {"executable_path": exe_path, "status": None}
        process_name = app.get("process_name") or os.path.basename(exe_path)

        if not os.path.exists(exe_path):
            if progress_callback:
                progress_callback(f'Failed to launch: {process_name} — invalid path')
            result["status"] = "skipped_invalid_path"
            results.append(result)
            continue

        try:
            if progress_callback:
                progress_callback(f'Launching {process_name}...')

            opened_by_plugin = plugin_manager.restore_application(app)

            if opened_by_plugin:
                if progress_callback:
                    progress_callback(f'Plugin restore: {process_name}')
            else:
                launch_args = app["launch_args"]
                if launch_args:
                    subprocess.Popen([exe_path] + launch_args.split())
                else:
                    subprocess.Popen([exe_path])

            if progress_callback:
                progress_callback(f'Launched {process_name} successfully')

            if progress_callback:
                progress_callback(f'Waiting for window: {process_name}...')

            hwnd = find_window_for_process(
                exe_path,
                window_title=app["window_title"],
                process_name=app.get("process_name"),
            )

            if hwnd:
                window_text = win32gui.GetWindowText(hwnd)
                if progress_callback:
                    progress_callback(f'Window found: {window_text or process_name}')

                pos_x, pos_y = app["pos_x"], app["pos_y"]
                width, height = app["width"], app["height"]
                if None not in (pos_x, pos_y, width, height):
                    if progress_callback:
                        progress_callback(f'Positioning window: {process_name} → {pos_x},{pos_y} {width}×{height}')
                    move_window(hwnd, pos_x, pos_y, width, height)

                is_maximized = bool(app.get("is_maximized", False))
                is_minimized = bool(app.get("is_minimized", False))
                state = "maximized" if is_maximized else ("minimized" if is_minimized else "normal")
                if progress_callback:
                    progress_callback(f'Restoring window state: {process_name} ({state})')
                restore_window_state(hwnd, is_maximized, is_minimized)

            time.sleep(1)
            result["status"] = "restored"
        except Exception as e:
            result["status"] = f"error: {e}"
            if progress_callback:
                progress_callback(f'Failed to launch: {process_name} — {e}')

        results.append(result)

    n = sum(1 for r in results if r["status"] == "restored")
    if progress_callback:
        progress_callback(f'Restore complete — {n} apps restored')

    return results


# -----------------------------
# Window Helpers
# -----------------------------

def find_window_for_process(executable_path, window_title=None, process_name=None, timeout=10):
    target_path = os.path.normcase(os.path.abspath(executable_path)) if executable_path else None
    target_process_name = process_name.lower() if process_name else None
    start_time = time.time()

    while time.time() - start_time < timeout:
        best_match = None
        best_score = 0
        best_reasons = []

        try:
            def enum_callback(hwnd, _):
                nonlocal best_match, best_score, best_reasons

                if not win32gui.IsWindowVisible(hwnd):
                    return True

                title = win32gui.GetWindowText(hwnd)
                if not title:
                    return True

                try:
                    _, pid = win32process.GetWindowThreadProcessId(hwnd)
                    proc = psutil.Process(pid)
                    process_path = os.path.normcase(os.path.abspath(proc.exe()))
                    current_process_name = proc.name().lower()
                except Exception:
                    return True

                score = 0
                reasons = []

                if target_path and process_path == target_path:
                    score += 3
                    reasons.append("executable_path")

                if target_process_name and current_process_name == target_process_name:
                    score += 2
                    reasons.append("process_name")

                if window_title and (window_title in title or title in window_title):
                    score += 1
                    reasons.append("title")

                if score > best_score:
                    best_match = hwnd
                    best_score = score
                    best_reasons = reasons

                return True

            win32gui.EnumWindows(enum_callback, None)

            if best_match:
                if "executable_path" in best_reasons:
                    write_log("Matched by executable_path")
                if "process_name" in best_reasons:
                    write_log("Matched by process_name")
                if "title" in best_reasons:
                    write_log("Matched by title")
                return best_match
        except Exception:
            pass

        time.sleep(0.5)

    return None


def move_window(hwnd, x, y, width, height):
    try:
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.MoveWindow(hwnd, x, y, width, height, True)
        return True
    except Exception:
        return False


def restore_window_state(hwnd, is_maximized=False, is_minimized=False):
    try:
        if is_maximized:
            win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
        elif is_minimized:
            win32gui.ShowWindow(hwnd, win32con.SW_MINIMIZE)
        else:
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)

        return True
    except Exception:
        return False


# -----------------------------
# Restore Logic
# -----------------------------

def restore_session():
    setup_restore_log()
    write_log(f"Restore log created: {RESTORE_LOG_PATH}")

    sessions = get_sessions()

    if not sessions:
        write_log("No saved sessions found.")
        return

    print("\nAvailable Sessions:")
    for i, session in enumerate(sessions):
        print(f"{i + 1}. {session[1]} ({session[2]})")

    choice = int(input("\nSelect session: ")) - 1

    session_id = sessions[choice][0]
    session_name = sessions[choice][1]
    session_created_at = sessions[choice][2] if len(sessions[choice]) > 2 else None

    write_log(f"Selected session ID: {session_id}")
    write_log(f"Selected session name: {session_name}")
    write_log(f"Selected session created_at: {session_created_at}")
    write_log(f"Restoring session: {session_name}")

    apps = get_applications(session_id)
    write_log(f"Applications found: {len(apps)}")

    if not apps:
        write_log("No applications found for this session.")
        return

    plugin_manager = PluginManager()

    for app in apps:
        exe_path = app["executable_path"]
        launch_args = app["launch_args"]
        window_title = app["window_title"]
        pos_x = app["pos_x"]
        pos_y = app["pos_y"]
        width = app["width"]
        height = app["height"]
        process_name = app.get("process_name")
        launch_type = app.get("launch_type", "default")
        is_maximized = bool(app.get("is_maximized", False))
        is_minimized = bool(app.get("is_minimized", False))
        plugin_data = app.get("plugin_data") or {}

        write_log("Starting application restore")
        write_log(f"Executable path: {exe_path}")
        write_log(f"Process name: {process_name}")
        write_log(f"Window title: {window_title}")
        write_log(f"Launch type: {launch_type}")
        write_log(f"Launch args: {launch_args}")
        write_log(f"Plugin data found: {bool(plugin_data)}")

        if not os.path.exists(exe_path):
            write_log(f"Skipped invalid path: {exe_path}")
            write_log(f"Failed to open app: {exe_path} | Error: invalid executable path")
            continue

        try:
            write_log("Plugin restore attempted")

            opened_by_plugin = plugin_manager.restore_application(app)

            if opened_by_plugin:
                write_log("Plugin restore succeeded")

            if not opened_by_plugin:
                write_log("Plugin restore did not open application")
                write_log("Fallback restore used")

                if launch_args:
                    subprocess.Popen([exe_path] + launch_args.split())
                else:
                    subprocess.Popen([exe_path])

            write_log(f"Application opened successfully: {exe_path} | launch_type: {launch_type}")
            write_log(f"Restoring process_name: {process_name}")
            write_log(f"Saved state: maximized={is_maximized}, minimized={is_minimized}")

            hwnd = find_window_for_process(
                exe_path,
                window_title=window_title,
                process_name=process_name,
            )

            if hwnd:
                write_log(f"Matching window found: {window_title or exe_path}")

                if None not in (pos_x, pos_y, width, height):
                    if move_window(hwnd, pos_x, pos_y, width, height):
                        write_log(f"Window move/resize succeeded: {window_title or exe_path}")
                    else:
                        write_log(f"Window move/resize failed: {window_title or exe_path}")

                if restore_window_state(hwnd, is_maximized, is_minimized):
                    if is_maximized:
                        write_log("Window state restored: maximized")
                    elif is_minimized:
                        write_log("Window state restored: minimized")
                    else:
                        write_log("Window state restored: normal")
                else:
                    write_log("Window state restoration failed")
            else:
                write_log(f"Matching window not found: {window_title or exe_path}")

            time.sleep(1)
        except Exception as e:
            write_log(f"Failed to open app: {exe_path} | Error: {e}")


# -----------------------------

if __name__ == "__main__":
    restore_session()
