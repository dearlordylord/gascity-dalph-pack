"""Pure admission decisions; external facts are supplied by the boundary owner."""


def exact_parents(parents, target, result):
    """A delivery candidate joins the fixed target and immutable task result."""
    return parents == [target, result]


def worktree_action(prepared, exists):
    """A previously prepared but missing worktree is lost, never fresh work."""
    if prepared and not exists:
        raise RuntimeError('prepared attempt worktree lost; preserve the attempt')
    return 'verify' if exists else 'ensure'


def model_action(command_state, writer_live, result_observed):
    """Command ambiguity requires substrate/provider reconciliation before begin."""
    if result_observed:
        return 'accept'
    if writer_live:
        return 'observe'
    if command_state is not None:
        raise RuntimeError('reconcile the exact model command before further execution')
    return 'begin'


def authorize_cleanup(published, stopped):
    """Git provenance checks supplement, never replace, stopped-writer proof."""
    if not published or not stopped:
        raise RuntimeError('cleanup retains resources until publication and stopped-writer proof')
