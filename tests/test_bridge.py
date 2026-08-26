import unittest
from dsh_opencode_bridge import is_openocode_available

class BridgeTests(unittest.TestCase):
    def test_opencode_available(self):
        # In this environment opencode is expected on PATH.
        self.assertTrue(is_openocode_available())

if __name__ == "__main__":
    unittest.main()
