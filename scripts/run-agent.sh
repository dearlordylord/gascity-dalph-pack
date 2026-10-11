#!/bin/sh
set -eu
role=$1
case "$role" in worker|integrator) ;; *) exit 64;; esac
mkdir -p "${DALPH_TRIAL_ROOT}/evidence/sessions"
# Generated runtime comes from the maintained TypeScript entrypoint.
exec mise exec node@24.20.0 -- node "${DALPH_PACK_ROOT}/dist/delivery.js" "$role"
