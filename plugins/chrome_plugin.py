import subprocess
import urllib.request
import urllib.error
import json

from plugins.base_plugin import BasePlugin

CHROME_DEBUG_PORT = 9222

class ChromePlugin(BasePlugin):
    plugin_name = "Chrome Plugin"

    def can_handle(self, window) -> bool:
        process_name = (window.get("process_name") or "").lower()
        executable_path = (window.get("executable_path") or "").lower()
        return "chrome" in process_name or "chrome" in executable_path

    def _get_tabs(self) -> list:
        try:
            url = f"http://localhost:{CHROME_DEBUG_PORT}/json"
            with urllib.request.urlopen(url, timeout=2) as response:
                tabs_data = json.loads(response.read().decode())
            urls = []
            seen = set()
            for tab in tabs_data:
                if tab.get("type") != "page":
                    continue
                tab_url = tab.get("url", "")
                if not tab_url or tab_url.startswith("chrome://") or tab_url.startswith("chrome-extension://"):
                    continue
                if tab_url not in seen:
                    seen.add(tab_url)
                    urls.append(tab_url)
            return urls
        except Exception as e:
            print(f"[ChromePlugin] Could not connect to Chrome debug port: {e}")
            return []

    def capture_state(self, window) -> dict:
        tabs = self._get_tabs()
        if tabs:
            print(f"[ChromePlugin] Captured {len(tabs)} tabs via remote debugging")
        else:
            print(f"[ChromePlugin] No tabs captured — Chrome may not be running with --remote-debugging-port={CHROME_DEBUG_PORT}")
        return {"tabs": tabs}

    def generate_restore_instruction(self, window, plugin_data=None) -> dict:
        tabs = (plugin_data or {}).get("tabs", [])
        if tabs:
            launch_args = "--new-window " + " ".join(tabs)
        else:
            launch_args = "--new-window"
        return {
            "executable_path": window.get("executable_path"),
            "launch_args": launch_args,
            "launch_type": "plugin",
        }

    def generate_launch_args(self, window) -> str | None:
        return "--new-window"

    def restore(self, app_data) -> bool:
        executable_path = app_data.get("executable_path")
        plugin_data = app_data.get("plugin_data", {})
        tabs = plugin_data.get("tabs", []) if isinstance(plugin_data, dict) else []

        try:
            if tabs:
                print(f"[ChromePlugin] Restoring {len(tabs)} tabs")
                subprocess.Popen([executable_path, "--new-window"] + tabs)
            else:
                print(f"[ChromePlugin] No tabs saved — opening Chrome with new window")
                subprocess.Popen([executable_path, "--new-window"])
            return True
        except Exception as e:
            print(f"[ChromePlugin] Restore failed: {e}")
            return False