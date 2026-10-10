"""Exercise the selected Gas City binary against actual isolated Git resources."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


@unittest.skipUnless(shutil.which('gc'), 'Gas City binary not prepared')
class NativeWorktreeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='dalph-gc-worktree-')
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.call('git', 'init', '-b', 'master', str(self.repo))
        self.call('git', '-C', str(self.repo), 'config', 'user.name', 'Fixture')
        self.call('git', '-C', str(self.repo), 'config', 'user.email', 'fixture@local')
        (self.repo / 'seed').write_text('seed\n')
        self.call('git', '-C', str(self.repo), 'add', 'seed')
        self.call('git', '-C', str(self.repo), '-c', 'commit.gpgsign=false', 'commit', '-m', 'seed')
        self.base = self.call('git', '-C', str(self.repo), 'rev-parse', 'HEAD')
        self.path = self.root / 'worktrees/attempt'
        self.args = ['--repo', str(self.repo), '--root', str(self.path.parent), '--path', str(self.path),
                     '--branch', 'dalph/fixture', '--base', 'refs/heads/master', '--base-sha', self.base,
                     '--bead', 'fixture-1', '--store-ref', 'rig:fixture', '--creator', 'dalph-pack',
                     '--owner', 'fixture-owner', '--generation', '1', '--json']
        self.prepared = json.loads(self.call('gc', 'worktree', 'ensure', *self.args))

    def tearDown(self):
        self.temp.cleanup()

    def call(self, *args):
        return subprocess.check_output(args, text=True, stderr=subprocess.PIPE, timeout=20).strip()

    def cleanup_report(self, extra_args=None):
        args = list(self.args)
        if extra_args:
            args[args.index(extra_args[0]) + 1] = extra_args[1]
        result = subprocess.run(['gc', 'worktree', 'cleanup', *args, '--attempt-id',
                                 self.prepared['provenance']['attempt_id']],
                                capture_output=True, text=True, timeout=20)
        return json.loads(result.stdout)

    def test_dirty_worktree_is_preserved_then_exact_cleanup_is_idempotent(self):
        dirty = self.path / 'untracked'
        dirty.write_text('owned fixture edit\n')
        report = self.cleanup_report()
        self.assertTrue(report['cleanup_pending'])
        self.assertEqual(report['error']['code'], 'dirty_worktree')
        self.assertTrue(dirty.exists())
        dirty.unlink()
        self.assertTrue(self.cleanup_report()['removed'])
        self.assertTrue(self.cleanup_report()['already_absent'])

    def test_lost_cleanup_response_reconciles_absence_without_recreating(self):
        command = ['gc', 'worktree', 'cleanup', *self.args, '--attempt-id',
                   self.prepared['provenance']['attempt_id']]
        # The child loses its parent-facing response only after the real GC
        # operation ends. The parent receives no cleanup report to trust.
        program = 'import os,subprocess,sys; subprocess.check_output(sys.argv[1:]); os._exit(91)'
        interrupted = subprocess.run([sys.executable, '-c', program, *command],
                                     capture_output=True, timeout=25)
        self.assertEqual(interrupted.returncode, 91)
        self.assertEqual(interrupted.stdout, b'')
        self.assertFalse(self.path.exists())
        reconciled = self.cleanup_report()
        self.assertTrue(reconciled['already_absent'])
        self.assertFalse(self.path.exists())

    def test_foreign_owner_is_refused_without_touching_resources(self):
        report = self.cleanup_report(('--owner', 'foreign-owner'))
        self.assertTrue(report['cleanup_pending'])
        self.assertEqual(report['error']['code'], 'ownership_mismatch')
        self.assertTrue(self.path.exists())
        self.assertTrue(self.cleanup_report()['removed'])

    def test_stale_attempt_cannot_remove_the_current_worktree(self):
        result = subprocess.run(['gc', 'worktree', 'cleanup', *self.args, '--attempt-id', 'stale'],
                                capture_output=True, text=True, timeout=20)
        report = json.loads(result.stdout)
        self.assertEqual(report['error']['code'], 'stale_attempt')
        self.assertTrue(self.path.exists())
        self.assertTrue(self.cleanup_report()['removed'])

    def test_original_base_sha_survives_target_advance_and_allows_merged_cleanup(self):
        (self.path / 'result').write_text('task result\n')
        self.call('git', '-C', str(self.path), 'add', 'result')
        self.call('git', '-C', str(self.path), '-c', 'commit.gpgsign=false', 'commit', '-m', 'result')
        refused = self.cleanup_report()
        self.assertEqual(refused['error']['code'], 'unmerged_commits')
        self.call('git', '-C', str(self.repo), 'merge', '--ff-only', 'dalph/fixture')
        verified = json.loads(self.call('gc', 'worktree', 'verify', *self.args))
        self.assertEqual(verified['provenance']['base_sha'], self.base)
        self.assertTrue(self.cleanup_report()['removed'])


if __name__ == '__main__':
    unittest.main()
