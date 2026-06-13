from __future__ import annotations



import logging

import threading

from collections.abc import Callable



logger = logging.getLogger(__name__)





def start_global_hotkey(on_toggle: Callable[[], None]) -> None:

    """Register Ctrl+Shift+Space system-wide (Windows)."""



    def _run() -> None:

        try:

            import keyboard



            keyboard.add_hotkey(

                "ctrl+shift+space",

                on_toggle,

                suppress=False,

                trigger_on_release=False,

            )

            logger.info("Global hotkey registered: Ctrl+Shift+Space (toggle listen)")

            keyboard.wait()

        except Exception as e:

            logger.warning(

                "Global hotkey unavailable (%s). Use overlay focus or run voice-service as admin.",

                e,

            )



    threading.Thread(target=_run, daemon=True, name="global-hotkey").start()


