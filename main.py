from capture_progs import main as capture_workspace
from delete_session import main as delete_saved_session
from restore_session import restore_session
from save_session import save_session
from view_session import view_session


def show_menu():
    print("\nWORK SESSION MANAGER")
    print("1. Capture current workspace")
    print("2. Save captured session")
    print("3. Restore saved session")
    print("4. Delete saved session")
    print("5. View session details")
    print("6. Exit")


def run_action(label, action):
    try:
        print(f"\n{label}")
        action()
    except Exception as e:
        print(f"Error while running '{label}': {e}")


def main():
    while True:
        show_menu()
        choice = input("\nSelect an option: ").strip()

        if choice == "1":
            run_action("Capture current workspace", capture_workspace)
        elif choice == "2":
            run_action("Save captured session", save_session)
        elif choice == "3":
            run_action("Restore saved session", restore_session)
        elif choice == "4":
            run_action("Delete saved session", delete_saved_session)
        elif choice == "5":
            run_action("View session details", view_session)
        elif choice == "6":
            print("Exiting Work Session Manager.")
            break
        else:
            print("Invalid option. Please choose 1, 2, 3, 4, 5, or 6.")


if __name__ == "__main__":
    main()
