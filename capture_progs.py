import os
import json
import sys
import time
from datetime import datetime
from typing import Counter

import mss
import mss.tools
import psutil

import win32gui
import win32con

import win32process


def get_data_dir():
    if getattr(sys, 'frozen', False):
        appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
        return os.path.join(appdata, 'WorkSessionManager')
    return os.path.dirname(os.path.abspath(__file__))

DATA_DIR = get_data_dir()


def timestamp():
    return datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)

def capture_screenshot(output_path: str) -> None:
    with mss.mss() as sct:
        # Monitor 0 = all monitors combined
        monitor = sct.monitors[0]
        img = sct.grab(monitor)
        mss.tools.to_png(img.rgb, img.size, output=output_path)

def load_system_process_names(filename="system_processes.txt"):
    """
    Loads system process names from a text file.
    Returns a set of process names.
    """
    file_path = os.path.join(DATA_DIR, filename)

    if not os.path.exists(file_path):
        print("system_processes.txt not found. Using empty system list.")
        return set()

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Clean and remove empty lines/comments; lowercase so comparisons are case-insensitive
    processes = {
        line.strip().lower()
        for line in lines
        if line.strip() and not line.strip().startswith("#")
    }

    return processes


def _load_capture_filter_processes():
    """Loads excluded_processes from config/capture_filters.json, if present."""
    filters_path = os.path.join(DATA_DIR, "config", "capture_filters.json")
    print(f'[DEBUG] capture_progs DATA_DIR: {DATA_DIR}')
    print(f'[DEBUG] filters path: {filters_path}')
    print(f'[DEBUG] filters path exists: {os.path.exists(filters_path)}')
    if not os.path.exists(filters_path):
        print(f'[DEBUG] exclusions loaded: set()')
        return set()
    try:
        with open(filters_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        exclusion_set = {p.strip().lower() for p in data.get("excluded_processes", []) if p.strip()}
        print(f'[DEBUG] exclusions loaded: {exclusion_set}')
        return exclusion_set
    except Exception:
        print(f'[DEBUG] exclusions loaded: set() (exception)')
        return set()


SYSTEM_PROCESS_NAMES = load_system_process_names() | _load_capture_filter_processes()


def classify_window(pid, process_name, hwnd):
    """
    Returns:
        (True, None)  → keep window
        (False, reason_string) → exclude window with reason
    """

    # 1. System process blocklist
    print(f'[filter] Checking: {process_name} | Excluded: {SYSTEM_PROCESS_NAMES}')
    if process_name.lower() in SYSTEM_PROCESS_NAMES:
        print(f'[filter] EXCLUDED: {process_name}')
        return False, "blocked_system_process"

    # 2. Executable path check
    try:
        proc = psutil.Process(pid)
        exe_path = proc.exe()

        if exe_path and exe_path.lower().startswith("c:\\windows"):
            # Allow explorer explicitly if you want
            if process_name.lower() == "explorer.exe":
                return True, None

            print(f'[filter] EXCLUDED: {process_name}')
            return False, "windows_directory_process"

    except Exception:
        print(f'[filter] EXCLUDED: {process_name}')
        return False, "process_access_error"

    # 3. Window size check
    try:
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        width = right - left
        height = bottom - top

        if width < 200 or height < 150:
            print(f'[filter] EXCLUDED: {process_name}')
            return False, "too_small_window"

    except Exception:
        print(f'[filter] EXCLUDED: {process_name}')
        return False, "geometry_error"

    # 4. Minimized check
    if win32gui.IsIconic(hwnd):
        print(f'[filter] EXCLUDED: {process_name}')
        return False, "minimized_window"

    return True, None

def list_visible_windows():
    kept_windows = []
    excluded_windows = []

    def enum_handler(hwnd, _):
        if not win32gui.IsWindowVisible(hwnd):
            return

        title = win32gui.GetWindowText(hwnd)
        if not title.strip():
            return

        _, pid = win32process.GetWindowThreadProcessId(hwnd)

        try:
            proc= psutil.Process(pid)
            process_name = proc.name()
        except Exception:
            excluded_windows.append({
                "title": title,
                "pid": pid,
                "reason": "process_access_error"
            })
            return

        try:
            exe_path = proc.exe()
        except Exception:
            exe_path = None

        if not exe_path:
            excluded_windows.append({
                "title": title,
                "pid": pid,
                "reason": "missing_executable_path"
            })
            return

        keep, reason = classify_window(pid, process_name, hwnd)

        window_data = {
            "title": title,
            "pid": pid,
            "process_name": process_name,
            "executable_path": exe_path
        }

        if keep:
            left, top, right, bottom = win32gui.GetWindowRect(hwnd)
            placement = win32gui.GetWindowPlacement(hwnd)
            show_cmd = placement[1]
            is_maximized = show_cmd == win32con.SW_SHOWMAXIMIZED
            is_minimized = win32gui.IsIconic(hwnd)

            window_data.update({
                "position": {"x": left, "y": top},
                "size": {
                    "width": right - left,
                    "height": bottom - top
                },
                "is_maximized": bool(is_maximized),
                "is_minimized": bool(is_minimized)
            })

            kept_windows.append(window_data)
        else:
            window_data["reason"] = reason
            excluded_windows.append(window_data)

    win32gui.EnumWindows(enum_handler, None)

    return kept_windows, excluded_windows

def list_top_processes(limit=60):
    """
    Optional: snapshot of running processes (not just visible windows).
    This can help later for context detection.
    """
    procs = []
    for p in psutil.process_iter(["pid", "name", "exe", "username"]):
        try:
            info = p.info
            procs.append(
                {
                    "pid": info.get("pid"),
                    "name": info.get("name"),
                    "exe": info.get("exe"),
                    "username": info.get("username"),
                }
            )
        except Exception:
            continue

    # Sort for consistent output
    procs.sort(key=lambda x: (x["name"] or "", x["pid"] or 0))
    return procs[:limit]


def main():
    print("CONTEXT CAPTURE - BASELINE")
    print("This script will capture a snapshot of your current desktop context, including:Open Windows, Processes, and a Screenshot.")
    print("")
    print("")


    base = os.path.join(DATA_DIR, "captures", timestamp())
    ensure_dir(base)

    screenshot_path = os.path.join(base, "screenshot.png")
    windows_path = os.path.join(base, "open_windows.json")
    processes_path = os.path.join(base, "processes.json")
    summary_path = os.path.join(base, "summary.txt")

    # 1) Screenshot
    capture_screenshot(screenshot_path)

    # 2) Visible windows snapshot
    kept, excluded = list_visible_windows()

    # Save kept windows (normal file)
    with open(os.path.join(base, "open_windows.json"), "w", encoding="utf-8") as f:
        json.dump(kept, f, indent=2)

    # Save excluded log
    with open(os.path.join(base, "filter_log.json"), "w", encoding="utf-8") as f:
        json.dump(excluded, f, indent=2)

    # 3) Optional: running processes snapshot
    processes = list_top_processes()
    with open(processes_path, "w", encoding="utf-8") as f:
        json.dump(processes, f, indent=2, ensure_ascii=False)

    # 4) Human-readable summary
    with open(summary_path, "w", encoding="utf-8") as f:
        f.write(f"Capture time: {datetime.now().isoformat()}\n")
        f.write(f"Screenshot: {screenshot_path}\n")
        f.write(f"Visible windows captured: {len(kept)}\n\n")

        f.write("Visible windows:\n")
        for w in kept:
            f.write(f"- [{w['process_name']}] (PID {w['pid']}): {w['title']}\n")

    print("✅ Capture complete!")
    print(f"Saved to: {base}")
    print(f"- screenshot.png")
    print(f"- open_windows.json")
    print(f"- processes.json")
    print(f"- summary.txt")

    print(f"Kept windows: {len(kept)}")
    print(f"Excluded windows: {len(excluded)}")

    # Optional breakdown
    from collections import Counter
    reasons = Counter(w["reason"] for w in excluded if "reason" in w)

    if reasons:
        print("\nExclusion breakdown:")
        for r, count in reasons.items():
            print(f"  {r}: {count}")


if __name__ == "__main__":
    main()
