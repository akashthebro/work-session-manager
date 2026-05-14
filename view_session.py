import os
import sqlite3
import sys


def get_data_dir():
    if getattr(sys, 'frozen', False):
        appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
        return os.path.join(appdata, 'WorkSessionManager')
    return os.path.dirname(os.path.abspath(__file__))

DB_PATH = os.path.join(get_data_dir(), 'database', 'session_manager.db')


def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    return any(column[1] == column_name for column in cursor.fetchall())


def get_sessions():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT session_id, name, created_at
        FROM sessions
        ORDER BY created_at DESC
    """)

    sessions = cursor.fetchall()
    conn.close()
    return sessions


def get_applications(session_id):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    optional_columns = [
        "process_name",
        "launch_type",
        "is_maximized",
        "is_minimized",
        "plugin_data",
    ]

    columns = [
        "executable_path",
        "window_title",
        "launch_args",
        "pos_x",
        "pos_y",
        "width",
        "height",
    ]

    available_optional_columns = [
        column for column in optional_columns
        if column_exists(cursor, "applications", column)
    ]
    columns.extend(available_optional_columns)

    cursor.execute(f"""
        SELECT {", ".join(columns)}
        FROM applications
        WHERE session_id = ?
    """, (session_id,))

    applications = cursor.fetchall()
    conn.close()
    return applications


def has_plugin_data(app):
    plugin_data = app["plugin_data"] if "plugin_data" in app.keys() else None
    return bool(plugin_data and plugin_data.strip() and plugin_data.strip() != "{}")


def print_application(index, app):
    process_name = app["process_name"] if "process_name" in app.keys() else None
    launch_type = app["launch_type"] if "launch_type" in app.keys() else "default"
    is_maximized = app["is_maximized"] if "is_maximized" in app.keys() else False
    is_minimized = app["is_minimized"] if "is_minimized" in app.keys() else False

    print(f"\nApplication {index}")
    print("-" * 40)
    print(f"process_name: {process_name}")
    print(f"window_title: {app['window_title']}")
    print(f"executable_path: {app['executable_path']}")
    print(f"launch_type: {launch_type}")
    print(f"launch_args: {app['launch_args']}")
    print(f"position: x={app['pos_x']}, y={app['pos_y']}")
    print(f"size: width={app['width']}, height={app['height']}")
    print(f"is_maximized: {bool(is_maximized)}")
    print(f"is_minimized: {bool(is_minimized)}")
    print(f"plugin_data: {'yes' if has_plugin_data(app) else 'no'}")


def view_session():
    if not os.path.exists(DB_PATH):
        print(f"Database not found: {DB_PATH}")
        return

    try:
        sessions = get_sessions()
    except sqlite3.Error as e:
        print(f"Failed to read sessions: {e}")
        return

    if not sessions:
        print("No saved sessions found.")
        return

    print("\nSaved Sessions:")
    for i, session in enumerate(sessions, start=1):
        session_id, name, created_at = session
        print(f"{i}. ID: {session_id} | {name} | {created_at}")

    try:
        choice = int(input("\nSelect session to view: ")) - 1
    except ValueError:
        print("Invalid input.")
        return

    if choice < 0 or choice >= len(sessions):
        print("Invalid selection.")
        return

    session_id, name, created_at = sessions[choice]

    print("\nSESSION DETAILS")
    print("=" * 40)
    print(f"session_id: {session_id}")
    print(f"name: {name}")
    print(f"created_at: {created_at}")

    try:
        applications = get_applications(session_id)
    except sqlite3.Error as e:
        print(f"Failed to read applications: {e}")
        return

    if not applications:
        print("\nNo applications found for this session.")
        return

    print(f"\nAPPLICATIONS ({len(applications)})")
    print("=" * 40)

    for index, app in enumerate(applications, start=1):
        print_application(index, app)


if __name__ == "__main__":
    view_session()
