"""Exercise command recovery against real process state and retained receipts."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
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
    def test_real_live_marked_process_holds_and_zombie_cannot_write(self):
        attempt = 'custody-fixture-' + str(os.getpid())
        birth = int(time.clock_gettime(time.CLOCK_BOOTTIME) * os.sysconf('SC_CLK_TCK'))
        child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(20)'],
                                 env=dict(os.environ, DALPH_ATTEMPT=attempt))
        try:
            self.assertIn(child.pid, delivery.marked_writers(attempt, birth))
            child.terminate()
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                fields = Path(f'/proc/{child.pid}/stat').read_text().rsplit(')', 1)[1].split()
                if fields[0] == 'Z':
                    break
                time.sleep(0.01)
            self.assertEqual(fields[0], 'Z', 'fixture must remain unreaped')
            self.assertNotIn(child.pid, delivery.marked_writers(attempt, birth))
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


if __name__ == '__main__':
    unittest.main()
