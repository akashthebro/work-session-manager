import sqlite3, os
db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'database', 'session_manager.db')
conn = sqlite3.connect(db)
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(applications)")
cols = [r[1] for r in cursor.fetchall()]
print('Current columns:', cols)
if 'restore_order' not in cols:
    cursor.execute('ALTER TABLE applications ADD COLUMN restore_order INTEGER')
    conn.commit()
    print('restore_order column added')
else:
    print('restore_order column already exists')
conn.close()
