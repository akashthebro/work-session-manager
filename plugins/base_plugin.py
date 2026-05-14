class BasePlugin:
    plugin_name = "Base Plugin"

    def can_handle(self, window) -> bool:
        return False

    def generate_restore_instruction(self, window, plugin_data=None) -> dict:
        return {
            "executable_path": window.get("executable_path"),
            "launch_args": None,
            "launch_type": "default",
        }

    def generate_launch_args(self, window) -> str | None:
        return None

    def restore(self, app_data) -> bool:
        return False

    def capture_state(self, window) -> dict:
        return {}
