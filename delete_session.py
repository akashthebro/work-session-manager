import os
import sqlite3

DB_PATH = os.path.join("database", "session_manager.db")


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


def delete_session(session_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("DELETE FROM applications WHERE session_id = ?", (session_id,))
    cursor.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))

    conn.commit()
    conn.close()


def main():
    sessions = get_sessions()

    if not sessions:
        print("No saved sessions found.")
        return

    print("\nSaved Sessions:")
    for i, session in enumerate(sessions, start=1):
        session_id, name, created_at = session
        print(f"{i}. ID: {session_id} | {name} | {created_at}")

    try:
        choice = int(input("\nSelect session to delete: ")) - 1
    except ValueError:
        print("Invalid input.")
        return

    if choice < 0 or choice >= len(sessions):
        print("Invalid selection.")
        return

    session_id, name, _ = sessions[choice]

    confirm = input(f"Delete session '{name}'? This cannot be undone. (y/n): ")

    if confirm.lower() != "y":
        print("Delete cancelled.")
        return

    delete_session(session_id)
    print(f"Deleted session: {name}")


if __name__ == "__main__":
    main()