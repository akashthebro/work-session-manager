import sqlite3
import os

DB_PATH = os.path.join("database", "session_manager.db")

def create_database():
    os.makedirs("database", exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        session_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        created_at TEXT
    );
    """)

    # Create applications table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS applications (
        app_id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        executable_path TEXT,
        window_title TEXT,
        FOREIGN KEY(session_id) REFERENCES sessions(session_id)
    );
    """)

    conn.commit()
    conn.close()

    print("Database and tables created successfully.")

if __name__ == "__main__":
    create_database()