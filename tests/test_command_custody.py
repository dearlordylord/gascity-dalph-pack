"""Exercise command recovery against real process state and retained receipts."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

PACK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACK / 'scripts'))
os.environ.setdefault('DALPH_TRIAL_ROOT', str(PACK.parent))
os.environ.setdefault('DALPH_PACK_ROOT', str(PACK))
spec = importlib.util.spec_from_file_location('delivery', PACK / 'scripts/delivery.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


class CustodyTests(unittest.TestCase):
    def test_permission_race_with_exit_is_rechecked_but_live_unknown_holds(self):
        with tempfile.TemporaryDirectory() as directory:
            entry = Path(directory) / '1000000000'
            entry.mkdir()
            def stat(state):
                return '1000000000 (fixture) ' + ' '.join([state] + ['0'] * 18 + ['100'])
            (entry / 'stat').write_text(stat('R'))
            (entry / 'environ').write_bytes(b'DALPH_BOUNDARY=fixture\0')
            def stopped_between_reads(path):
                (entry / 'stat').write_text(stat('Z'))
                raise PermissionError('process exited between observations')
            with patch.object(Path, 'read_bytes', stopped_between_reads):
                self.assertEqual(delivery.marked_processes('DALPH_BOUNDARY=fixture', 1, Path(directory)), [])
            (entry / 'stat').write_text(stat('R'))
            with patch.object(Path, 'read_bytes', side_effect=PermissionError('live unreadable')):
                with self.assertRaisesRegex(RuntimeError, 'unknown'):
                    delivery.marked_processes('DALPH_BOUNDARY=fixture', 1, Path(directory))

    def test_real_live_marked_process_holds_and_zombie_cannot_write(self):
        attempt = 'custody-fixture-' + str(os.getpid())
        birth = int(time.clock_gettime(time.CLOCK_BOOTTIME) * os.sysconf('SC_CLK_TCK'))
        child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(20)'],
                                 env=dict(os.environ, DALPH_ATTEMPT=attempt))
        with tempfile.TemporaryDirectory() as directory:
            # This fixture proves custody of this exact child. Other native
            # trial sessions may legitimately contain unreadable live writers.
            proc_root = Path(directory)
            (proc_root / str(child.pid)).symlink_to(Path('/proc') / str(child.pid))
            try:
                self.assertIn(child.pid, delivery.marked_processes('DALPH_ATTEMPT=' + attempt, birth, proc_root))
                child.terminate()
                deadline = time.monotonic() + 3
                while time.monotonic() < deadline:
                    fields = Path(f'/proc/{child.pid}/stat').read_text().rsplit(')', 1)[1].split()
                    if fields[0] == 'Z':
                        break
                    time.sleep(0.01)
                self.assertEqual(fields[0], 'Z', 'fixture must remain unreaped')
                self.assertNotIn(child.pid, delivery.marked_processes('DALPH_ATTEMPT=' + attempt, birth, proc_root))
            finally:
                child.wait(timeout=3)

    def receipt_fixture(self, values, writers):
        writes = []
        def record(bead, key, value):
            writes.append((key, value))
            values[key] = value
            return value
        self.enterContext(patch.object(delivery, 'facts', side_effect=lambda bead, key: values.get(key)))
        self.enterContext(patch.object(delivery, 'record', side_effect=record))
        self.enterContext(patch.object(delivery, 'marked_writers', return_value=writers))
        return writes

    def test_missing_exit_with_live_writer_forbids_another_execution(self):
        writes = self.receipt_fixture({'model_intent': {'birth_ticks': 1}}, [42])
        with self.assertRaisesRegex(RuntimeError, 'still active'):
            delivery.command_slot('task', {'attempt': 'attempt'}, 'model')
        self.assertEqual(writes, [])

    def test_stopped_ambiguous_execution_is_recorded_before_next_ordinal(self):
        values = {'model_intent': {'birth_ticks': 1}}
        writes = self.receipt_fixture(values, [])
        self.assertEqual(delivery.command_slot('task', {'attempt': 'attempt'}, 'model'), ('model_2', 2, False))
        self.assertEqual(writes[0][0], 'model_reconciled')
        self.assertEqual(writes[0][1]['state'], 'stopped_without_receipt')
        self.assertNotIn('model_finished', values)

    def test_three_failures_exhaust_budget_and_keep_all_receipts(self):
        values = {}
        for suffix in ('', '_2', '_3'):
            values['model' + suffix + '_intent'] = {'birth_ticks': 1}
            values['model' + suffix + '_finished'] = {'exit': 1}
        writes = self.receipt_fixture(values, [])
        with self.assertRaisesRegex(RuntimeError, 'budget exhausted'):
            delivery.command_slot('task', {'attempt': 'attempt'}, 'model')
        self.assertEqual(writes, [])

    def test_green_receipt_from_other_commit_cannot_qualify_current_candidate(self):
        self.receipt_fixture({'qualification_intent': {'birth_ticks': 1},
                              'qualification_finished': {'exit': 0, 'commit': 'old'}}, [])
        with self.assertRaisesRegex(RuntimeError, 'exact commit'):
            delivery.command_slot('task', {'attempt': 'attempt'}, 'qualification', 'new')

    def test_failed_qualification_cannot_be_repeated_blindly(self):
        writes = self.receipt_fixture({'qualification_intent': {'birth_ticks': 1},
                                      'qualification_finished': {'exit': 1, 'commit': 'candidate'}}, [])
        with self.assertRaisesRegex(RuntimeError, 'diagnose retained'):
            delivery.command_slot('task', {'attempt': 'attempt'}, 'qualification', 'candidate')
        self.assertEqual(writes, [])

    def test_ambiguous_close_reads_tracker_and_does_not_retry_mutation(self):
        statuses = iter([{'status': 'open'}, {'status': 'closed'}, {'status': 'closed'}])
        with patch.object(delivery, 'record') as record, \
             patch.object(delivery, 'bead', side_effect=lambda bead: next(statuses)), \
             patch.object(delivery, 'mutate', side_effect=subprocess.TimeoutExpired('fixture', 1)) as mutate:
            delivery.close('task', 'qualified result')
        record.assert_called_once()
        mutate.assert_called_once()

    def test_child_timeout_stops_exact_process_group(self):
        child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(20)'], start_new_session=True)
        try:
            self.assertEqual(delivery.wait_child(child, 0.05, 1), 124)
            self.assertIsNotNone(child.poll())
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()

    def test_escaped_boundary_descendant_retains_custody_until_stopped(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(delivery, 'ROOT', Path(directory)), \
             patch.object(delivery, 'CURRENT_ATTEMPT', 'fixture-attempt'):
            script = ('import subprocess,sys,time; '
                      'child=subprocess.Popen([sys.executable,"-c","import time;time.sleep(20)"],start_new_session=True); '
                      'print(child.pid,flush=True);time.sleep(20)')
            try:
                with self.assertRaisesRegex(RuntimeError, 'descendants still live'):
                    delivery.run([sys.executable, '-c', script], timeout=0.2)
                receipt_path = next((Path(directory) / 'evidence/boundaries').glob('*.json'))
                import json
                receipt = json.loads(receipt_path.read_text())
                child_pid = int(receipt_path.with_suffix('.stdout').read_text().strip())
                self.assertFalse(receipt['observation']['stopped_writers'])
                with self.assertRaisesRegex(RuntimeError, 'live writers'):
                    delivery.reconcile_commands('fixture-attempt')
            finally:
                if 'child_pid' in locals():
                    os.kill(child_pid, 9)
                    deadline = time.monotonic() + 3
                    while time.monotonic() < deadline:
                        if not delivery.marked_processes('DALPH_BOUNDARY=' + receipt['intent']['nonce'],
                                                         receipt['intent']['birth_ticks']):
                            break
                        time.sleep(0.01)
            delivery.reconcile_commands('fixture-attempt')
            receipt = json.loads(receipt_path.read_text())
            self.assertTrue(receipt['observation']['stopped_writers'])
            self.assertEqual(receipt['observation']['exit'], 124)
            self.assertEqual(receipt['reconciliation']['state'], 'stopped_without_success_receipt')

    def test_real_git_tree_must_match_the_qualified_commit(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(delivery, 'ROOT', Path(directory) / 'custody'):
            repo = Path(directory) / 'repo'
            repo.mkdir()
            def git(*args):
                return subprocess.check_output(['git', '-C', str(repo), *args], text=True).strip()
            git('init', '-b', 'master')
            (repo / 'app.txt').write_text('accepted\n')
            git('add', 'app.txt')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@local', '-c', 'commit.gpgsign=false',
                'commit', '-m', 'fixture')
            commit = git('rev-parse', 'HEAD')
            plan = {'path': str(repo)}
            delivery.qualified_tree(plan, commit)
            (repo / 'app.txt').write_text('modified by tests\n')
            with self.assertRaisesRegex(RuntimeError, 'tree differs'):
                delivery.qualified_tree(plan, commit)
            git('add', 'app.txt')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@local', '-c', 'commit.gpgsign=false',
                'commit', '-m', 'changed head')
            with self.assertRaisesRegex(RuntimeError, 'changed HEAD'):
                delivery.qualified_tree(plan, commit)


if __name__ == '__main__':
    unittest.main()
