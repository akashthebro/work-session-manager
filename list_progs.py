import os
import json
from datetime import datetime

CAPTURES_DIR = "captures"


def parse_timestamp(folder_name: str):
    try:
        return datetime.strptime(folder_name, "%Y-%m-%d_%H-%M-%S")
    except ValueError:
        return None


def get_sorted_captures():
    if not os.path.exists(CAPTURES_DIR):
        return []

    folders = []

    for name in os.listdir(CAPTURES_DIR):
        full_path = os.path.join(CAPTURES_DIR, name)
        if os.path.isdir(full_path):
            dt = parse_timestamp(name)
            if dt:
                folders.append((name, dt))

    folders.sort(key=lambda x: x[1], reverse=True)
    return folders


def select_capture():
    captures = get_sorted_captures()

    if not captures:
        print("No valid captures found.")
        return None

    print("\nAvailable Captures:\n")
    for idx, (name, _) in enumerate(captures, start=1):
        print(f"{idx}. {name}")

    while True:
        choice = input("Select capture number (or 'q' to quit): ").strip()

        if choice.lower() == "q":
            return None

        if choice.isdigit():
            index = int(choice) - 1
            if 0 <= index < len(captures):
                return os.path.join(CAPTURES_DIR, captures[index][0])

        print("Invalid selection.")


def load_capture_data(capture_path: str):
    open_file = os.path.join(capture_path, "open_windows.json")
    excluded_file = os.path.join(capture_path, "filter_log.json")

    kept = []
    excluded = []

    if os.path.exists(open_file):
        with open(open_file, "r", encoding="utf-8") as f:
            kept = json.load(f)

    if os.path.exists(excluded_file):
        with open(excluded_file, "r", encoding="utf-8") as f:
            excluded = json.load(f)

    return kept, excluded


if __name__ == "__main__":
    selected_capture = select_capture()

    if selected_capture:
        kept, excluded = load_capture_data(selected_capture)

        print("\nINCLUDED (Workspace Applications)")
        print("-" * 60)

        if kept:
            for idx, window in enumerate(kept, start=1):
                print(f"{idx}. [{window.get('process_name','?')}] {window.get('title','Untitled')}")
        else:
            print("None")

        print("\nEXCLUDED (System / Utility / Ignored)")
        print("-" * 60)

        if excluded:
            for idx, window in enumerate(excluded, start=1):
                reason = window.get("reason", "unknown")
                print(f"{idx}. [{window.get('process_name','?')}] {window.get('title','Untitled')}  →  {reason}")
        else:
            print("None")

    else:
        print("No capture selected.")