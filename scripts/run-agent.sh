#!/bin/sh
set -eu
role=$1
case "$role" in worker|integrator) ;; *) exit 64;; esac
mkdir -p "${DALPH_TRIAL_ROOT}/evidence/sessions"
# Keep native tmux activity visible; delivery.py also retains its own output.
exec python3 -u "${DALPH_PACK_ROOT}/scripts/delivery.py" "$role"
