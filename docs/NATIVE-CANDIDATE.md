# Reproduce the matched native candidate

The operator uses this profile for isolated qualification of the native
workflow. The complete ten-minute native suite remains under qualification.
[The manifest](../patches/native-candidate.json) owns its exact source inputs;
[normal setup](SETUP.md) describes the target, city, harness and recovery steps.

The GC library and the `bd` CLI come from the same Beads revision. The CLI
reports version `1.3.0`; its full build/commit identity matters here. Release
`1.3.1` comes from another source line and lacks the required revision guards.
The linked library's schema cursors are main `69` and ignored `27`.

After setting an isolated `DALPH_TRIAL_ROOT` and sourcing `trial/env.sh`, build
the candidate with the pinned Go toolchain:

```sh
(
set -euo pipefail
candidate_manifest="$DALPH_PACK_ROOT/patches/native-candidate.json"
candidate_gc_ref=$(jq -r '.gc.revision' "$candidate_manifest")
candidate_bd_ref=$(jq -r '.bd.revision' "$candidate_manifest")
candidate_patch=$(jq -r '.gc.patch' "$candidate_manifest")
candidate_patch_sha=$(jq -r '.gc.patchSha256' "$candidate_manifest")
candidate_gc_version=$(jq -r '.gc.version' "$candidate_manifest")
candidate_gc_source="$DALPH_TRIAL_ROOT/sources/gascity-candidate"
candidate_bd_source="$DALPH_TRIAL_ROOT/sources/beads-candidate"
mkdir -p "$DALPH_TRIAL_ROOT/bin" "$DALPH_TRIAL_ROOT/sources"
printf '%s  %s\n' "$candidate_patch_sha" "$DALPH_PACK_ROOT/patches/$candidate_patch" | sha256sum --check
git clone https://github.com/gastownhall/gascity.git "$candidate_gc_source"
git -C "$candidate_gc_source" checkout --detach "$candidate_gc_ref"
git -C "$candidate_gc_source" apply --check "$DALPH_PACK_ROOT/patches/$candidate_patch"
git -C "$candidate_gc_source" apply "$DALPH_PACK_ROOT/patches/$candidate_patch"
(cd "$candidate_gc_source" && CGO_ENABLED=0 mise exec go@1.27.2 -- go build -buildvcs=false -trimpath -ldflags "-X main.version=$candidate_gc_version -X main.commit=$candidate_gc_ref" -o "$DALPH_TRIAL_ROOT/bin/gc" ./cmd/gc)
git clone https://github.com/gastownhall/beads.git "$candidate_bd_source"
git -C "$candidate_bd_source" checkout --detach "$candidate_bd_ref"
(cd "$candidate_bd_source" && CGO_ENABLED=0 mise exec go@1.27.2 -- go build -tags gms_pure_go -ldflags "-X main.Build=$candidate_bd_ref" -o "$DALPH_TRIAL_ROOT/bin/bd" ./cmd/bd)
gc version --json
bd version --json
mise exec go@1.27.2 -- go version -m "$DALPH_TRIAL_ROOT/bin/gc"
)
```

Verify the GC build identifier, the CLI's full commit, and the linked Beads
module version and checksum against the manifest before creating task writers.
Keep the executable physically named `gc`: native control-agent liveness matches
that process name. A symlink to an executable with another basename changes
that observation.

The candidate adds the existing admitted proxied reader to control readiness
scans. Control mutations keep the guarded CLI write leaf. `native_transport =
"off"` retains that fallback; the ordinary direct-native backend is unchanged.
Native read rollout and idle settings are explicit operator choices. A
long-lived proxied reader requires idle timeout `0`; the controller and native
check launchers must receive the same choices through the city's workspace
environment. Fresh scope initialization owns the persisted proxy policy. Before rendering
and initializing the fresh city in normal setup, select the candidate profile:

```sh
export GC_BEADS_PROXIED_NATIVE=1
export GC_BEADS_PROXIED_IDLE_TIMEOUT=0
```

The renderer writes both choices into workspace.env. Continue normal setup
with these exports present; changing an existing scope's shell environment
does not replace its persisted proxy initialization policy.

The qualified checks cover native/Bd frontier equality for persistent and
ephemeral rows, dependencies and closed work, unchanged HEAD, owned reader
closure, actual operator-off fallback, and composed review convergence.
Qualification of the full installation/recovery/maintenance composition and
the complete native suite is still required before adopting this profile.
