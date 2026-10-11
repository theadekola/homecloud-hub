import importlib.util
from pathlib import Path
import tempfile
import unittest
spec = importlib.util.spec_from_file_location("configure_https", Path(__file__).with_name("configure-https.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class MigrationTests(unittest.TestCase):
    def test_lan_migration_preserves_secrets_and_is_repeatable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            original = "WEB_ORIGIN=http://192.168.20.104:6002\nWEB_PORT=6002\nHTTPS_PORT=8443\nJWT_SECRET=keep-me\n"
            path.write_text(original)
            self.assertTrue(module.configure(path))
            result = path.read_text()
            self.assertIn("WEB_ORIGIN=https://192.168.20.104:6002", result)
            self.assertIn("WEB_PORT=6003", result)
            self.assertIn("HTTPS_PORT=6002", result)
            self.assertIn("JWT_SECRET=keep-me", result)
            self.assertEqual(path.with_name(".env.before-https-6002").read_text(), original)
            self.assertFalse(module.configure(path))
    def test_public_domain_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            original = "WEB_ORIGIN=https://cloud.example.com\nHTTPS_PORT=443\n"
            path.write_text(original)
            self.assertFalse(module.configure(path))
            self.assertEqual(path.read_text(), original)
if __name__ == "__main__":
    unittest.main()
