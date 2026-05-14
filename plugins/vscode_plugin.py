import json
import os
import subprocess

from plugins.base_plugin import BasePlugin


class VSCodePlugin(BasePlugin):
    plugin_name = "VS Code Plugin"
    project_map_path = os.path.join("config", "vscode_projects.json")

    def can_handle(self, window) -> bool:
        process_name = (window.get("process_name") or "").lower()
        executable_path = (window.get("executable_path") or "").lower()

        return (
            process_name in ("code.exe", "code - insiders.exe")
            or "microsoft vs code" in executable_path
            or "code.exe" in executable_path
        )

    def load_project_map(self):
        try:
            with open(self.project_map_path, "r", encoding="utf-8") as file:
                project_map = json.load(file)

            if isinstance(project_map, dict):
                return project_map
        except Exception:
            pass

        return {}

    def capture_state(self, window) -> dict:
        title = window.get("title", "") or ""
        project_hint = title

        if " - Visual Studio Code" in project_hint:
            project_hint = project_hint.replace(" - Visual Studio Code", "")
        elif " - Code" in project_hint:
            project_hint = project_hint.replace(" - Code", "")

        project_hint = project_hint.strip()
        project_map = self.load_project_map()
        project_path = project_map.get(project_hint)

        if project_path:
            print(f"VS Code project mapping found: {project_hint} -> {project_path}")
        else:
            print(f"No VS Code project mapping found for: {project_hint}")

        return {
            "workspace_type": "vscode",
            "window_title": title,
            "project_hint": project_hint,
            "project_path": project_path,
        }

    def generate_restore_instruction(self, window, plugin_data=None) -> dict:
        return {
            "executable_path": window.get("executable_path"),
            "launch_args": None,
            "launch_type": "plugin",
        }

    def restore(self, app_data) -> bool:
        executable_path = app_data.get("executable_path")
        plugin_data = app_data.get("plugin_data", {})
        project_path = None

        if isinstance(plugin_data, dict):
            project_path = plugin_data.get("project_path")

        try:
            if project_path and os.path.exists(project_path):
                # VS Code supports opening folders and workspace files from the CLI.
                print(f"Restoring VS Code project: {project_path}")
                subprocess.Popen([executable_path, project_path])
            else:
                print("No mapping found, opening normal VS Code")
                subprocess.Popen(executable_path)

            return True
        except Exception as e:
            print(f"VSCodePlugin restore failed: {e}")
            return False
