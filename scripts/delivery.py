"""One native GC turn: execute one admitted result or deliver one result.

There is no task selection loop. GC owns the graph, claim CAS, role capacity,
and session lifecycle. Every effect below belongs to the exact claimed bead.
"""
from pathlib import Path
import json
import contextlib
import fcntl
import os
import signal
import subprocess
import sys
import time
import traceback
import uuid

from protocol import exact_parents, worktree_action, authorize_cleanup

ROOT = Path(os.environ['DALPH_TRIAL_ROOT'])
PACK = Path(os.environ['DALPH_PACK_ROOT'])
CITY = Path(os.environ.get('DALPH_CITY_ROOT', str(ROOT / 'city')))
RIG = os.environ.get('DALPH_RIG', 'expenses')
REPO = Path(os.environ.get('DALPH_TARGET_REPO', str(ROOT / RIG)))
CITY_NAME = os.environ.get('DALPH_CITY_NAME', 'dalph-expenses')
API_ENDPOINT = os.environ.get('DALPH_TRACKER_ENDPOINT', 'http://127.0.0.1:8372')
TARGET_BRANCH = os.environ.get('DALPH_TARGET_BRANCH', 'master')
TARGET_REF = 'refs/heads/' + TARGET_BRANCH
REMOTE_TRACKING_REF = 'refs/remotes/origin/' + TARGET_BRANCH
WORKTREES = Path(os.environ.get('DALPH_WORKTREE_ROOT', str(ROOT / 'worktrees')))
GC = ['gc', '--city', str(CITY), '--rig', RIG]
CURRENT_ATTEMPT = None


class RetainedOutput:
    """Native terminal activity and retained evidence receive identical output."""
    def __init__(self, terminal, evidence):
        self.terminal, self.evidence = terminal, evidence

    def write(self, text):
        self.terminal.write(text)
        self.evidence.write(text)
        self.flush()
        return len(text)

    def flush(self):
        self.terminal.flush()
        self.evidence.flush()

    def fileno(self):
        # External child diagnostics go to the native terminal, where tmux
        # retains them; the bounded child also owns a separate evidence log.
        return self.terminal.fileno()


def run(args, cwd=None, timeout=30):
    """Every CLI child owns a process group and retained execution custody.

    These receipts are execution evidence, not tracker or Git state. A missing
    exit is never success. Semantic recovery still reads the owning authority.
    """
    directory = ROOT / 'evidence' / 'boundaries'
    directory.mkdir(parents=True, exist_ok=True)
    nonce = uuid.uuid4().hex
    path = directory / (nonce + '.json')
    output_path = directory / (nonce + '.stdout')
    error_path = directory / (nonce + '.stderr')
    birth = int(time.clock_gettime(time.CLOCK_BOOTTIME) * os.sysconf('SC_CLK_TCK'))
    owner_birth = Path('/proc/self/stat').read_text().rsplit(')', 1)[1].split()[19]
    receipt = {'intent': {'attempt': CURRENT_ATTEMPT, 'nonce': nonce, 'birth_ticks': birth,
                         'owner_pid': os.getpid(), 'owner_birth': owner_birth,
                         'args': list(args), 'cwd': str(cwd) if cwd else None,
                         'timeout_seconds': timeout, 'started': time.time()}}
    persist_receipt(path, receipt)
    environment = dict(os.environ, DALPH_BOUNDARY=nonce)
    with output_path.open('w') as output, error_path.open('w') as error:
        child = subprocess.Popen(args, cwd=cwd, env=environment, text=True,
                                 stdout=output, stderr=error, start_new_session=True)
        code = wait_child(child, timeout, 5)
    writers = stopped_boundary_writers('DALPH_BOUNDARY=' + nonce, birth)
    receipt['observation'] = {'exit': code, 'stopped_writers': not writers,
                              'writer_pids': writers, 'observed': time.time()}
    persist_receipt(path, receipt)
    if writers:
        raise RuntimeError('boundary descendants still live; retain custody: ' + str(path))
    stdout = output_path.read_text()
    if code:
        stderr = error_path.read_text()
        print(f"boundary command failed ({code}): {args!r}; stdout={stdout}; stderr={stderr}", file=sys.stderr)
        raise subprocess.CalledProcessError(code, args, stdout, stderr)
    return stdout.strip()


def persist_receipt(path, value):
    temporary = path.with_suffix('.pending')
    with temporary.open('w') as output:
        json.dump(value, output, sort_keys=True)
        output.flush()
        os.fsync(output.fileno())
    temporary.replace(path)
    descriptor = os.open(str(path.parent), os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def reconcile_commands(attempt, only_orphans=False):
    """An interrupted CLI may have left descendants after its owner stopped."""
    for path in (ROOT / 'evidence' / 'boundaries').glob('*.json'):
        receipt = json.loads(path.read_text())
        intent = receipt['intent']
        if intent['attempt'] != attempt or receipt.get('observation', {}).get('stopped_writers'):
            continue
        if only_orphans:
            owner = Path('/proc') / str(intent['owner_pid'])
            try:
                fields = (owner / 'stat').read_text().rsplit(')', 1)[1].split()
                if fields[0] not in ('Z', 'X') and fields[19] == intent['owner_birth']:
                    continue
            except FileNotFoundError:
                pass
        if marked_processes('DALPH_BOUNDARY=' + intent['nonce'], intent['birth_ticks']):
            raise RuntimeError('uncertain boundary has live writers; retain custody: ' + str(path))
        receipt['reconciliation'] = {'state': 'stopped_without_success_receipt', 'observed': time.time()}
        receipt.setdefault('observation', {})['stopped_writers'] = True
        persist_receipt(path, receipt)


def git(*args, cwd=REPO):
    return run(['git', '-C', str(cwd), *args])


def bead(bead_id):
    rows = json.loads(run(['bd', '-C', str(REPO), 'show', bead_id, '--json']))
    if len(rows) != 1 or rows[0]['id'] != bead_id:
        raise RuntimeError('tracker did not return the exact bead')
    return rows[0]


def facts(bead_id, key):
    value = bead(bead_id).get('metadata', {}).get('dalph.' + key)
    return json.loads(value) if value else None


def record(bead_id, key, value):
    """A fact is immutable. Ambiguous append is reconciled by exact readback."""
    encoded = json.dumps(value, sort_keys=True, separators=(',', ':'))
    current = bead(bead_id).get('metadata', {}).get('dalph.' + key, '')
    if current:
        if current != encoded:
            raise RuntimeError('contradictory durable fact: ' + key)
        return value
    run([*GC, 'beads', 'metadata-cas', bead_id, '--store-ref=rig:' + RIG,
         '--key=dalph.' + key, '--expected=', '--next=' + encoded, '--json'], timeout=60)
    actual = bead(bead_id).get('metadata', {}).get('dalph.' + key)
    if actual != encoded:
        raise RuntimeError('durable fact not acknowledged: ' + key)
    return value


def mutate(bead_id, action, body):
    request = {'endpoint': API_ENDPOINT, 'city': CITY_NAME,
               'id': bead_id, 'action': action, 'body': body}
    return json.loads(run(['mise', 'exec', 'node@24.20.0', '--', 'node',
                          str(PACK / 'scripts/beads-http.mjs'), json.dumps(request)], timeout=70))


def owned_spec(plan):
    args = ['--repo', str(REPO), '--root', str(WORKTREES), '--path', plan['path'],
            '--branch', plan['branch'], '--base', REMOTE_TRACKING_REF, '--base-sha', plan['base'],
            '--bead', plan['bead'], '--store-ref', 'rig:' + RIG, '--creator', 'dalph-pack',
            '--owner', plan['attempt'], '--generation', '1', '--json']
    return args


@contextlib.contextmanager
def target_guard():
    """One bounded cooperative Git guard; the file contains no runtime state."""
    common_dir = Path(git('rev-parse', '--path-format=absolute', '--git-common-dir'))
    with (common_dir / 'dalph-target.guard').open('a') as handle:
        for index in range(1201):
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if index == 1200:
                    raise RuntimeError('target Git guard unavailable; retain attempt')
                time.sleep(0.1)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def prepare(bead_id, kind, base):
    with target_guard():
        return prepare_inside_guard(bead_id, kind, base)


def prepare_inside_guard(bead_id, kind, base):
    global CURRENT_ATTEMPT
    key = kind + '_plan'
    plan = facts(bead_id, key)
    if plan is None:
        attempt = uuid.uuid4().hex
        plan = {'bead': bead_id, 'attempt': attempt, 'base': base,
                'branch': 'dalph/' + kind + '/' + bead_id,
                'path': str(WORKTREES / (kind + '-' + bead_id))}
        CURRENT_ATTEMPT = plan['attempt']
        record(bead_id, key, plan)
    CURRENT_ATTEMPT = plan['attempt']
    reconcile_commands(CURRENT_ATTEMPT)
    ready = facts(bead_id, kind + '_prepared')
    action = worktree_action(ready is not None, Path(plan['path']).exists())
    if action == 'ensure' and git('rev-parse', REMOTE_TRACKING_REF) != plan['base']:
        raise RuntimeError('declared attempt Base no longer matches preparation ref; retain plan')
    record(bead_id, kind + '_prepare_intent', {'plan': plan})
    report = json.loads(run(['gc', 'worktree', action, *owned_spec(plan)]))
    if ready is not None and report['provenance']['attempt_id'] != ready['provenance']['attempt_id']:
        raise RuntimeError('worktree provisioning attempt changed')
    if ready is None:
        record(bead_id, kind + '_prepared', report)
    return plan


def marked_processes(marker_text, birth_ticks, proc_root=Path('/proc')):
    """Observe actual process environment, never a retained PID/status file.

Same-user unreadable processes retain custody. Other users cannot inherit the
pack's child-only marker and do not belong to its execution authority.
"""
    marker = marker_text.encode()
    found = []
    for entry in proc_root.iterdir():
        if not entry.name.isdigit() or int(entry.name) == os.getpid():
            continue
        try:
            if entry.stat().st_uid != os.getuid():
                continue
            # Only children spawned after the intent can inherit its private
            # marker. Pre-existing protected processes cannot be these writers.
            stat = (entry / 'stat').read_text()
            process_fields = stat[stat.rfind(')') + 2:].split()
            # A zombie has exited and cannot write. Descendants are inspected
            # independently; skipping this corpse never skips its children.
            if process_fields[0] in ('Z', 'X'):
                continue
            started_ticks = int(process_fields[19])
            if started_ticks < birth_ticks:
                continue
            fields = (entry / 'environ').read_bytes().split(b'\0')
            if marker in fields:
                found.append(int(entry.name))
        except (FileNotFoundError, ProcessLookupError):
            continue
        except PermissionError as error:
            # The process can exit between reading stat and environ. Re-read
            # its substrate state before calling that race unknown liveness.
            resolved = False
            for pause in (0, 0.01, 0.03, 0.1):
                if pause:
                    time.sleep(pause)
                try:
                    current = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
                    if current[0] in ('Z', 'X'):
                        resolved = True
                        break
                    fields = (entry / 'environ').read_bytes().split(b'\0')
                    if marker in fields:
                        found.append(int(entry.name))
                    resolved = True
                    break
                except (FileNotFoundError, ProcessLookupError):
                    resolved = True
                    break
                except PermissionError:
                    pass
            if not resolved:
                raise RuntimeError('writer absence unknown after bounded observation: ' + str(entry)) from error
    return found


def stopped_boundary_writers(marker, birth_ticks, grace=5):
    """A returned leader may leave descendants finishing their own exits.

    Wait finitely for fresh substrate proof; elapsed grace never proves absence.
    Unreadable live processes still fail closed in marked_processes.
    """
    deadline = time.monotonic() + grace
    while True:
        writers = marked_processes(marker, birth_ticks)
        if not writers or time.monotonic() >= deadline:
            return writers
        time.sleep(min(0.05, max(0, deadline - time.monotonic())))


def marked_writers(attempt, birth_ticks):
    return marked_processes('DALPH_ATTEMPT=' + attempt, birth_ticks)


def command_slot(bead_id, plan, kind, commit=None):
    """At most three command executions; never overwrite a prior outcome.

    A lost receipt is reconciled only by the execution substrate proving all
    marked writers stopped. That observation is not a fabricated success exit.
    Models may resume their exact retained worktree; qualification reruns the
    exact commit. An unresolved live or unreadable writer retains custody.
    """
    for ordinal in range(1, 4):
        prefix = kind if ordinal == 1 else kind + '_' + str(ordinal)
        intent = facts(bead_id, prefix + '_intent')
        finished = facts(bead_id, prefix + '_finished')
        reconciled = facts(bead_id, prefix + '_reconciled')
        if intent and marked_writers(plan['attempt'], intent['birth_ticks']):
            raise RuntimeError('exact ' + kind + ' writers still active; retain attempt')
        if finished is not None:
            if finished['exit'] == 0:
                if commit is not None and finished['commit'] != commit:
                    raise RuntimeError('qualification receipt does not accept this exact commit')
                return prefix, ordinal, True
            if kind == 'qualification':
                raise RuntimeError('qualification failed; diagnose retained gate evidence before repair')
            continue
        if reconciled is not None:
            continue
        if intent is not None:
            record(bead_id, prefix + '_reconciled', {
                'state': 'stopped_without_receipt', 'attempt': plan['attempt'],
                'birth_ticks': intent['birth_ticks'], 'observed': time.time()})
            continue
        return prefix, ordinal, False
    raise RuntimeError(kind + ' command budget exhausted; retain task and evidence')


def wait_child(child, timeout, grace):
    """Observe the exact live child and expose activity to native tmux timers."""
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            return child.wait(timeout=min(15, remaining))
        except subprocess.TimeoutExpired:
            print(f'Exact child {child.pid} is live; remaining budget {max(0, int(deadline-time.monotonic()))}s', flush=True)
    os.killpg(child.pid, signal.SIGTERM)
    try:
        child.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=grace)
    # The leader may have exited on TERM while a descendant ignored it.
    # Kill only this exact spawned group; escaped descendants remain fenced
    # by the marker observation at the caller's stopped-writer boundary.
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    return 124


def model(bead_id, plan, prompt):
    prefix, ordinal, accepted = command_slot(bead_id, plan, 'model')
    if accepted:
        return
    logdir = ROOT / 'evidence' / plan['attempt']
    if ordinal > 1:
        logdir = logdir / ('model-' + str(ordinal))
    logdir.mkdir(parents=True, exist_ok=True)
    record(bead_id, prefix + '_intent', {'attempt': plan['attempt'], 'model': 'gpt-6-luna',
                                  'effort': 'max', 'timeout_seconds': 600,
                                  'birth_ticks': int(time.clock_gettime(time.CLOCK_BOOTTIME) * os.sysconf('SC_CLK_TCK')),
                                  'logdir': str(logdir), 'started': time.time()})
    environment = dict(os.environ, DALPH_ATTEMPT=plan['attempt'])
    with (logdir / 'codex.jsonl').open('w') as output, (logdir / 'codex.stderr').open('w') as stderr:
        child = subprocess.Popen(['codex', 'exec', '-C', plan['path'], '-m', 'gpt-6-luna',
                                  '-c', 'model_reasoning_effort="max"', '--json',
                                  '--dangerously-bypass-approvals-and-sandbox', prompt],
                                 env=environment, stdout=output, stderr=stderr, start_new_session=True)
        code = wait_child(child, 600, 10)
    intent = facts(bead_id, prefix + '_intent')
    if marked_writers(plan['attempt'], intent['birth_ticks']):
        raise RuntimeError('model exit did not stop all marked writers')
    record(bead_id, prefix + '_finished', {'attempt': plan['attempt'], 'exit': code,
                                    'stopped': time.time(), 'logdir': str(logdir)})
    if code != 0:
        raise RuntimeError('bounded model turn failed')


def qualify(bead_id, plan):
    path = plan['path']
    commit = git('rev-parse', 'HEAD', cwd=path)
    prefix, ordinal, accepted = command_slot(bead_id, plan, 'qualification', commit)
    suffix = '' if ordinal == 1 else '-qualification-' + str(ordinal)
    logfile = ROOT / 'evidence' / ('tests-' + commit + suffix + '.log')
    if accepted:
        qualified_tree(plan, commit)
        return {'commit': commit, 'exit': 0, 'logfile': str(logfile)}
    record(bead_id, prefix + '_intent', {
        'commit': commit, 'attempt': plan['attempt'], 'logfile': str(logfile),
        'birth_ticks': int(time.clock_gettime(time.CLOCK_BOOTTIME) * os.sysconf('SC_CLK_TCK')),
        'command': ['mise', 'exec', 'node@24.20.0', '--', 'pnpm', 'test'],
        'timeout_seconds': 90})
    environment = dict(os.environ, DALPH_ATTEMPT=plan['attempt'])
    with logfile.open('w') as output:
        child = subprocess.Popen(['mise', 'exec', 'node@24.20.0', '--', 'pnpm', 'test'],
                                 cwd=path, stdout=output, stderr=subprocess.STDOUT,
                                 env=environment, start_new_session=True)
        code = wait_child(child, 90, 5)
    intent = facts(bead_id, prefix + '_intent')
    if marked_writers(plan['attempt'], intent['birth_ticks']):
        raise RuntimeError('qualification exit did not stop its writers')
    if code == 0:
        qualified_tree(plan, commit)
    record(bead_id, prefix + '_finished', {'commit': commit, 'exit': code, 'stopped': time.time()})
    if code != 0:
        raise RuntimeError('exact candidate qualification failed; retained evidence: ' + str(logfile))
    return {'commit': commit, 'exit': 0, 'logfile': str(logfile)}


def qualified_tree(plan, commit):
    if git('rev-parse', 'HEAD', cwd=plan['path']) != commit:
        raise RuntimeError('qualification changed HEAD; refuse acceptance/publication')
    if git('status', '--porcelain', cwd=plan['path']):
        raise RuntimeError('qualification tree differs from commit; refuse acceptance/publication')


def close(bead_id, reason):
    record(bead_id, 'close_intent', {'reason': reason})
    if bead(bead_id)['status'] != 'closed':
        try:
            mutate(bead_id, 'close', {'reason': reason})
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            # A timed-out response is not a failed write. Read the native
            # tracker before deciding whether the exact close was observed.
            if bead(bead_id)['status'] != 'closed':
                raise
    if bead(bead_id)['status'] != 'closed':
        raise RuntimeError('tracker completion not observed')


def worker(current):
    bead_id = current['id']
    plan = facts(bead_id, 'work_plan')
    if plan is None:
        git('fetch', 'origin', TARGET_REF + ':' + REMOTE_TRACKING_REF)
    plan = prepare(bead_id, 'work', plan['base'] if plan else git('rev-parse', REMOTE_TRACKING_REF))
    prompt = current['description'] + '\n\n' + (
        'You own this exact isolated attempt. Implement the assigned task, add meaningful tests, '
        'run mise exec -- pnpm test, review against the requested behavior and code quality, '
        'fix findings and commit all owned changes with a conventional commit. '
        'Do not push, merge, touch other worktrees, close tracker records, or launch other agents. '
        'Your task is ready because its prerequisite delivery beads are closed. '
        'Repository identity: use git -c user.name="Dalph Trial" '
        '-c user.email="dalph-trial@local" -c commit.gpgsign=false commit if needed.')
    contract_path = os.environ.get('DALPH_PROJECT_CONTRACT_PATH')
    if contract_path:
        prompt += '\n\nProject contract:\n' + Path(contract_path).read_text()
    model(bead_id, plan, prompt)
    if git('status', '--porcelain', cwd=plan['path']):
        raise RuntimeError('accepted implementation must be committed and clean')
    result = git('rev-parse', 'HEAD', cwd=plan['path'])
    if result == plan['base']:
        raise RuntimeError('implementation produced no commit')
    git('merge-base', '--is-ancestor', plan['base'], result)
    tests = qualify(bead_id, plan)
    record(bead_id, 'result', {'commit': result, 'attempt': plan['attempt'], 'tests': tests})
    close(bead_id, 'Accepted implementation result; task delivery remains open')


def implementation_for(current):
    task = current['metadata']['dalph.task']
    root = current['metadata']['gc.root_bead_id']
    rows = json.loads(run([*GC, 'ready', '--status', 'closed', '--limit', '0', '--json']))
    matches = [b for b in rows if b.get('metadata', {}).get('dalph.task') == task
               and b.get('metadata', {}).get('dalph.phase') == 'work'
               and b.get('metadata', {}).get('gc.root_bead_id') == root]
    if len(matches) != 1:
        raise RuntimeError('delivery needs one exact closed implementation result')
    return matches[0]


def cleanup(delivery_id, source_id, kind):
    plan = facts(source_id, kind + '_plan')
    prepared = facts(source_id, kind + '_prepared')
    reconcile_commands(plan['attempt'])
    published = facts(delivery_id, 'published')
    intents = [facts(source_id, kind + suffix + '_intent')
               for kind in ('model', 'qualification') for suffix in ('', '_2', '_3')]
    births = [intent['birth_ticks'] for intent in intents if intent is not None]
    if not births:
        raise RuntimeError('cleanup has no stopped-writer qualification boundary')
    writers = marked_writers(plan['attempt'], min(births))
    authorize_cleanup(published is not None, not writers)
    record(delivery_id, kind + '_cleanup_intent', {'plan': plan,
           'attempt_id': prepared['provenance']['attempt_id']})
    args = owned_spec(plan)
    # The named target BaseRef retains its identity; its original exact BaseSHA
    # remains in provenance while cleanup verifies merge ancestry to its tip.
    report = json.loads(run(['gc', 'worktree', 'cleanup', *args,
                            '--attempt-id', prepared['provenance']['attempt_id']]))
    if report.get('cleanup_pending'):
        raise RuntimeError('safe cleanup refused: ' + json.dumps(report))
    record(delivery_id, kind + '_cleaned', {'path': plan['path'], 'attempt': plan['attempt']})
    # Compare-and-delete only the exact owned tip, after worktree disappearance.
    try:
        tip = git('rev-parse', '--verify', 'refs/heads/' + plan['branch'])
    except subprocess.CalledProcessError:
        return
    expected = facts(source_id, 'result')['commit'] if kind == 'work' else facts(source_id, 'candidate')['commit']
    if tip != expected:
        raise RuntimeError('owned branch moved; cleanup preserves it')
    git('update-ref', '-d', 'refs/heads/' + plan['branch'], expected)


def integrator(current):
    global CURRENT_ATTEMPT
    bead_id = current['id']
    source = implementation_for(current)
    result = facts(source['id'], 'result')
    if result is None:
        raise RuntimeError('missing exact accepted result')
    candidate = facts(bead_id, 'candidate')
    if candidate is not None:
        CURRENT_ATTEMPT = facts(bead_id, 'candidate_plan')['attempt']
        reconcile_commands(CURRENT_ATTEMPT)
    if candidate is None:
        git('fetch', 'origin', TARGET_REF + ':' + REMOTE_TRACKING_REF)
        head = git('rev-parse', REMOTE_TRACKING_REF)
        plan = prepare(bead_id, 'candidate', head)
        head = plan['base']
        record(bead_id, 'merge_intent', {'head': head, 'result': result['commit'], 'plan': plan})
        candidate_head = git('rev-parse', 'HEAD', cwd=plan['path'])
        if candidate_head == head:
            git('-c', 'user.name=Dalph Trial', '-c', 'user.email=dalph-trial@local',
                '-c', 'commit.gpgsign=false', 'merge', '--no-ff', '--no-edit', result['commit'], cwd=plan['path'])
            candidate_head = git('rev-parse', 'HEAD', cwd=plan['path'])
        parents = git('show', '-s', '--format=%P', candidate_head).split()
        if not exact_parents(parents, head, result['commit']):
            raise RuntimeError('candidate must have exact ordered parents [target, result]')
        tests = qualify(bead_id, plan)
        candidate = record(bead_id, 'candidate', {'commit': candidate_head,
                           'head': head, 'result': result['commit'], 'tests': tests})
    record(bead_id, 'push_intent', {'candidate': candidate['commit'], 'head': candidate['head'],
                                 'endpoint': git('remote', 'get-url', 'origin'), 'ref': TARGET_REF})
    git('fetch', 'origin', TARGET_REF + ':' + REMOTE_TRACKING_REF)
    remote = git('rev-parse', REMOTE_TRACKING_REF)
    if remote == candidate['head']:
        qualified_tree(facts(bead_id, 'candidate_plan'), candidate['commit'])
        # Ordinary, non-force publication. No retry on a failed/ambiguous push.
        git('push', 'origin', candidate['commit'] + ':' + TARGET_REF)
        if os.environ.get('DALPH_FAULT_AFTER_PUSH') == bead_id:
            raise RuntimeError('injected loss after remote push; intent retained')
        git('fetch', 'origin', TARGET_REF + ':' + REMOTE_TRACKING_REF)
        remote = git('rev-parse', REMOTE_TRACKING_REF)
    git('merge-base', '--is-ancestor', candidate['commit'], remote)
    record(bead_id, 'published', {'commit': candidate['commit']})
    record(bead_id, 'promotion_intent', {'head': candidate['head'], 'candidate': candidate['commit']})
    local = git('rev-parse', TARGET_REF)
    with target_guard():
        if git('symbolic-ref', '-q', 'HEAD') != TARGET_REF:
            raise RuntimeError('target checkout is on a different branch; promotion refused')
        local = git('rev-parse', TARGET_REF)
        if local == candidate['head']:
            if git('status', '--porcelain'):
                raise RuntimeError('target checkout dirty; promotion refused')
            git('merge', '--ff-only', candidate['commit'])
    git('merge-base', '--is-ancestor', candidate['commit'], TARGET_REF)
    record(bead_id, 'promoted', {'commit': candidate['commit']})
    # Run-owned cleanup precedes this trial's final close so finality cannot
    # conceal retained resources. Successors are released by native GC reads.
    cleanup(bead_id, source['id'], 'work')
    cleanup(bead_id, bead_id, 'candidate')
    close(bead_id, 'Exact result integrated, remote verified, promoted and owned resources cleaned')


def main():
    reconcile_commands(None, only_orphans=True)
    claimed = json.loads(run([*GC, 'hook', '--claim', '--json'], timeout=120))
    if claimed.get('action') != 'work' or not claimed.get('bead_id'):
        raise RuntimeError('turn did not receive an exact admitted work claim: ' + json.dumps(claimed))
    current = bead(claimed['bead_id'])
    expected_phase = 'work' if sys.argv[1] == 'worker' else 'deliver'
    if current.get('metadata', {}).get('dalph.phase') != expected_phase:
        raise RuntimeError('claimed bead belongs to a different workflow phase')
    (worker if expected_phase == 'work' else integrator)(current)


if __name__ == '__main__':
    logdir = ROOT / 'evidence' / 'sessions'
    logdir.mkdir(parents=True, exist_ok=True)
    with (logdir / (os.environ['GC_SESSION_ID'] + '.log')).open('a') as evidence:
        terminal_stdout, terminal_stderr = sys.stdout, sys.stderr
        sys.stdout = RetainedOutput(terminal_stdout, evidence)
        sys.stderr = RetainedOutput(terminal_stderr, evidence)
        try:
            main()
        except BaseException:
            # Print while evidence is still open. Restore terminals before
            # unwinding so an original failure cannot be hidden by logging.
            traceback.print_exc()
            raise
        finally:
            sys.stdout, sys.stderr = terminal_stdout, terminal_stderr
