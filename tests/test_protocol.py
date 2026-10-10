import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('protocol', Path(__file__).parents[1] / 'scripts/protocol.py')
protocol = importlib.util.module_from_spec(spec)
spec.loader.exec_module(protocol)


class ProtocolTests(unittest.TestCase):
    def test_candidate_requires_exact_ordered_parents(self):
        h, c = 'a' * 40, 'b' * 40
        self.assertTrue(protocol.exact_parents([h, c], h, c))
        for parents in ([c, h], [h], [h, c, h], []):
            self.assertFalse(protocol.exact_parents(parents, h, c))

    def test_recovery_of_prepared_missing_worktree_does_not_recreate(self):
        self.assertEqual(protocol.worktree_action(False, False), 'ensure')
        self.assertEqual(protocol.worktree_action(False, True), 'verify')
        self.assertEqual(protocol.worktree_action(True, True), 'verify')
        with self.assertRaisesRegex(RuntimeError, 'lost'):
            protocol.worktree_action(True, False)

    def test_cleanup_needs_published_commit_and_stopped_writers(self):
        for published, stopped in [(False, False), (True, False), (False, True)]:
            with self.assertRaises(RuntimeError):
                protocol.authorize_cleanup(published, stopped)
        protocol.authorize_cleanup(True, True)


if __name__ == '__main__':
    unittest.main()
