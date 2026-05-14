import os
import json
import sqlite3
import sys
from datetime import datetime

from plugin_manager import PluginManager

def get_data_dir():
    if getattr(sys, 'frozen', False):
        appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
        return os.path.join(appdata, 'WorkSessionManager')
    return os.path.dirname(os.path.abspath(__file__))

DATA_DIR     = get_data_dir()
DB_PATH      = os.path.join(DATA_DIR, 'database', 'session_manager.db')
CAPTURES_DIR = os.path.join(DATA_DIR, 'captures')

# -----------------------------
# Database Functions
# -----------------------------

def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    return any(column[1] == column_name for column in cursor.fetchall())


def ensure_launch_type_column():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        if not column_exists(cursor, "applications", "launch_type"):
            cursor.execute("ALTER TABLE applications ADD COLUMN launch_type TEXT DEFAULT 'default'")
            conn.commit()
    finally:
        conn.close()


def applications_has_launch_type(cursor):
    return column_exists(cursor, "applications", "launch_type")

def insert_session(name):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        INSERT INTO sessions (name, created_at)
        VALUES (?, ?)
    """, (name, created_at))

    session_id = cursor.lastrowid

    conn.commit()
    conn.close()

    return session_id


def insert_application(
    session_id,
    executable_path,
    process_name,
    window_title,
    launch_args,
    pos_x,
    pos_y,
    width,
    height,
    is_maximized,
    is_minimized,
    launch_type="default",
    plugin_data="{}",
):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    columns = [
        "session_id",
        "executable_path",
        "window_title",
        "launch_args",
        "pos_x",
        "pos_y",
        "width",
        "height",
    ]
    values = [
        session_id,
        executable_path,
        window_title,
        launch_args,
        pos_x,
        pos_y,
        width,
        height,
    ]

    if column_exists(cursor, "applications", "process_name"):
        columns.append("process_name")
        values.append(process_name)

    if column_exists(cursor, "applications", "is_maximized"):
        columns.append("is_maximized")
        values.append(is_maximized)

    if column_exists(cursor, "applications", "is_minimized"):
        columns.append("is_minimized")
        values.append(is_minimized)

    if applications_has_launch_type(cursor):
        columns.append("launch_type")
        values.append(launch_type)

    if column_exists(cursor, "applications", "plugin_data"):
        columns.append("plugin_data")
        values.append(plugin_data)

    placeholders = ", ".join("?" for _ in columns)
    cursor.execute(f"""
        INSERT INTO applications ({", ".join(columns)})
        VALUES ({placeholders})
    """, values)

    conn.commit()
    conn.close()


# -----------------------------
# Capture Handling
# -----------------------------

def list_captures():
    return [f for f in os.listdir(CAPTURES_DIR) if os.path.isdir(os.path.join(CAPTURES_DIR, f))]


def load_capture(capture_name):
    path = os.path.join(CAPTURES_DIR, capture_name, "open_windows.json")
    
    with open(path, "r") as file:
        return json.load(file)


# -----------------------------
# Main Save Logic
# -----------------------------

def save_session():
    captures = list_captures()

    if not captures:
        print("No captures found.")
        return

    print("\nAvailable Captures:")
    for i, cap in enumerate(captures):
        print(f"{i + 1}. {cap}")

    choice = int(input("\nSelect capture: ")) - 1

    selected_capture = captures[choice]
    windows = load_capture(selected_capture)

    print(f"\nSaving session: {selected_capture}")

    ensure_launch_type_column()
    session_id = insert_session(selected_capture)
    plugin_manager = PluginManager()

    saved_count = 0
    seen = set()

    for window in windows:
        exe_path = window.get("executable_path")
        title = window.get("title")

        if not exe_path:
            continue

        try:
            plugin_data = plugin_manager.capture_state(window)
            if not isinstance(plugin_data, dict):
                plugin_data = {}
            plugin_data_json = json.dumps(plugin_data)
        except Exception as e:
            print(f"Failed to capture plugin data for {title or exe_path}: {e}")
            plugin_data = {}
            plugin_data_json = "{}"

        instruction = plugin_manager.get_restore_instruction(window, plugin_data)
        restore_executable_path = instruction.get("executable_path") or exe_path
        process_name = window.get("process_name")
        launch_args = instruction.get("launch_args")
        launch_type = instruction.get("launch_type", "default")

        # Avoid duplicates
        if restore_executable_path in seen:
            continue

        seen.add(restore_executable_path)

        position = window.get("position", {})
        size = window.get("size", {})

        pos_x = position.get("x")
        pos_y = position.get("y")
        width = size.get("width")
        height = size.get("height")
        is_maximized = int(bool(window.get("is_maximized", False)))
        is_minimized = int(bool(window.get("is_minimized", False)))

        insert_application(
            session_id,
            restore_executable_path,
            process_name,
            title,
            launch_args,
            pos_x,
            pos_y,
            width,
            height,
            is_maximized,
            is_minimized,
            launch_type,
            plugin_data_json,
        )
        saved_count += 1

    print(f"Saved {saved_count} applications.")

# -----------------------------

if __name__ == "__main__":
    save_session()
