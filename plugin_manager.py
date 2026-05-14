import importlib.util
import inspect
import os

from plugins.base_plugin import BasePlugin


class PluginManager:
    def __init__(self, plugins_dir="plugins"):
        self.plugins_dir = plugins_dir
        self.plugins = []
        self.load_plugins()

    def load_plugins(self):
        if not os.path.isdir(self.plugins_dir):
            print(f"Plugins folder not found: {self.plugins_dir}")
            return

        for filename in os.listdir(self.plugins_dir):
            if filename in ("__init__.py", "base_plugin.py"):
                continue

            if not filename.endswith(".py"):
                continue

            path = os.path.join(self.plugins_dir, filename)
            module_name = f"plugins.{filename[:-3]}"

            try:
                spec = importlib.util.spec_from_file_location(module_name, path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                for _, plugin_class in inspect.getmembers(module, inspect.isclass):
                    if plugin_class is BasePlugin:
                        continue

                    if issubclass(plugin_class, BasePlugin):
                        plugin = plugin_class()
                        self.plugins.append(plugin)
                        print(f"Loaded plugin: {plugin.plugin_name}")
            except Exception as e:
                print(f"Failed to load plugin {filename}: {e}")

    def get_default_restore_instruction(self, window):
        return {
            "executable_path": window.get("executable_path"),
            "launch_args": None,
            "launch_type": "default",
        }

    def validate_restore_instruction(self, instruction, window):
        original_path = window.get("executable_path")

        if not isinstance(instruction, dict):
            instruction = {}

        executable_path = instruction.get("executable_path") or original_path

        if (
            executable_path
            and original_path
            and executable_path != original_path
            and not os.path.exists(executable_path)
            and os.path.exists(original_path)
        ):
            print(f"Plugin returned invalid path, falling back to captured path: {original_path}")
            executable_path = original_path

        return {
            "executable_path": executable_path,
            "launch_args": instruction.get("launch_args"),
            "launch_type": instruction.get("launch_type", "default"),
        }

    def get_restore_instruction(self, window, plugin_data=None) -> dict:
        for plugin in self.plugins:
            try:
                if plugin.can_handle(window):
                    if type(plugin).generate_restore_instruction is not BasePlugin.generate_restore_instruction:
                        instruction = plugin.generate_restore_instruction(window, plugin_data)
                    else:
                        instruction = {
                            "executable_path": window.get("executable_path"),
                            "launch_args": plugin.generate_launch_args(window),
                            "launch_type": "plugin",
                        }

                    instruction = self.validate_restore_instruction(instruction, window)
                    print(f"{plugin.plugin_name} handled: {window.get('process_name') or window.get('title')}")
                    return instruction
            except Exception as e:
                print(f"Plugin failed: {plugin.plugin_name} | Error: {e}")

        return self.get_default_restore_instruction(window)

    def get_launch_args(self, window):
        instruction = self.get_restore_instruction(window)
        return instruction.get("launch_args")

    def capture_state(self, window) -> dict:
        for plugin in self.plugins:
            try:
                if not plugin.can_handle(window):
                    continue

                state = plugin.capture_state(window)
                if isinstance(state, dict):
                    print(f"Plugin captured state: {plugin.plugin_name}")
                    return state

                print(f"Plugin capture failed: {plugin.plugin_name} returned non-dict state")
                return {}
            except Exception as e:
                print(f"Plugin capture failed: {plugin.plugin_name} | Error: {e}")
                return {}

        print("No plugin matched for capture state")
        return {}

    def restore_application(self, app_data) -> bool:
        for plugin in self.plugins:
            try:
                if not plugin.can_handle(app_data):
                    continue

                print(f"Plugin selected for restore: {plugin.plugin_name}")

                if plugin.restore(app_data):
                    print(f"Plugin restore succeeded: {plugin.plugin_name}")
                    return True

                print(f"Plugin restore failed: {plugin.plugin_name}")
            except Exception as e:
                print(f"Plugin restore failed: {plugin.plugin_name} | Error: {e}")

        print("Falling back to default restore")
        return False
