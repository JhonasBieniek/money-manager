# CD Build/Retag Baseline Tracking — Design

**Goal:** Make `resolve-matrix`'s build-vs-retag decision in
`.github/workflows/cd.yml` robust to streaks of failed/skipped CI runs, so a
service can never be silently retagged (reusing a stale `:latest` image)
when it actually has unbuilt changes queued up.

**Incident that motivated this:** web's `:latest` image was last actually
built 2026-07-27T20:59 UTC. Commit `9c478f4` (investments-nav frontend
change) landed 2026-07-28T11:10 UTC. Every push after that had red CI until
`f434c9d` (2026-07-29), which only touched `apps/api/**`. When CI finally
went green, CD correctly rebuilt `api` but retagged `web` — reusing the
pre-nav image — so the deploy reported success while production kept
serving frontend code from over a day earlier. Fixed at the time by forcing
a full rebuild via `workflow_dispatch`.

**Root cause:** `resolve-matrix`'s diff base is always computed relative to
*the immediately preceding push* — either the push-range artifact's
`before` SHA, or `deploy_sha~1` as a fallback (`cd.yml:73-101`). Under a
streak of red CI, each failing push's base is its own immediate parent, and
CD's jobs never run for those pushes at all (gated on
`workflow_run.conclusion == 'success'`, `cd.yml:24-26` / `45-47`). The first
push that finally goes green only diffs against *its own* immediate
predecessor — not against the last commit that was actually built into
`:latest` — so any service whose real last change happened earlier in the
failure streak is invisible to that diff and gets retagged instead of
rebuilt.

**Fix, in one sentence:** stop diffing against "the previous push" and
instead diff each service against the commit SHA actually baked into that
service's own current `:latest` image, recovered by reading a label off the
image in GHCR.

**Explicit decisions made during design:**

- **No new secrets.** `GITHUB_TOKEN` cannot write repository Actions
  variables (confirmed — GitHub blocks that API endpoint for the
  auto-generated token regardless of `permissions:`), which would require a
  new fine-grained PAT with its own rotation burden. Ruled out in favor of
  reading the baseline back from GHCR, which the pipeline already has
  read/write access to via the existing `packages: write` token permission.
- **Fail toward building, never toward silence.** If a service's baseline
  can't be determined (missing label, unreachable GHCR, unreachable SHA in
  history), that service is treated as changed and gets built. Worst case
  is an unnecessary rebuild; it can never reproduce this incident's failure
  mode of silently shipping stale content.
- **Per-service baseline, not one shared base.** Today's single shared
  `SHARED_CHANGED`/`WORKFLOW_CHANGED` flags (computed once against one
  base) are folded into each service's own diff instead — more correct, not
  just simpler: a shared-file change is relevant to a service exactly back
  to *that service's* last real build, which can differ per service.

---

## 1. Job structure

`detect-changes` is renamed to `resolve-baselines` — its purpose changes
from "what changed since the previous push" to "what changed since each
service's last real build," and the old name would mislead future readers.

Pipeline: `meta` → `resolve-baselines` → `resolve-matrix` → `build` (+ label
write) → `retag` (unchanged) → `deploy` (unchanged).

## 2. `resolve-baselines`

Checks out at `deploy_sha` with `fetch-depth: 0` (as `detect-changes` does
today). Logs into GHCR (`docker/login-action`, same credentials `build`
already uses). For each of `api web bot stt`:

1. **Resolve the baseline.** Query that service's `:latest` image for the
   label `org.opencontainers.image.revision` via `docker buildx imagetools
   inspect` (manifest + config only, no layer pull):

   ```bash
   docker buildx imagetools inspect "${IMAGE_PREFIX}-${service}:latest" \
     --format '{{json .Config.Labels}}' 2>/dev/null \
     | jq -r '.["org.opencontainers.image.revision"] // empty'
   ```

   Exact `--format` syntax against this repo's images (single-platform
   `linux/arm64`, not a multi-arch index — see `cd.yml:298`) gets verified
   against a real pushed image during implementation; falls back to the
   "no baseline" path below if the call errors for any reason.

2. **Validate it.** `git cat-file -e "${label}^{commit}"` against the
   full-history checkout. Guards against a corrupted label or (rare)
   history rewrite on `master` leaving a baseline that no longer exists.

3. **No valid baseline** (label missing, image doesn't exist yet, GHCR
   query failed, or SHA unreachable) → that service is "changed," skip
   straight to build — no diff attempted.

4. **Valid baseline** → `git diff --quiet "$BASELINE" "$DEPLOY_SHA" --
   <service's pathspec>`; non-zero exit means changed.

**On `workflow_dispatch`:** skip the GHCR queries entirely and mark all
four services changed directly — matches today's behavior (`cd.yml:169`)
and avoids pointless queries when everything is being rebuilt anyway.

**Per-service pathspec** (service-specific globs, unchanged from today's
`paths-filter` filters at `cd.yml:109-136`, plus shared plus workflow —
folded together per service rather than tracked as separate flags):

| Service | Globs |
|---|---|
| `api` | `apps/api/** packages/db/** packages/types/** packages/utils/** apps/api/Dockerfile` + shared + workflow |
| `web` | `apps/web/** packages/types/** packages/utils/** apps/web/Dockerfile` + shared + workflow |
| `bot` | `apps/bot/** apps/bot/Dockerfile` + shared + workflow |
| `stt` | `apps/stt/**` + workflow *(no shared — matches today's exclusion, `cd.yml:173`)* |

- shared = `package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs`
- workflow = `.github/workflows/cd.yml .github/workflows/ci.yml`

`dorny/paths-filter` is dropped in favor of a plain `git diff --quiet` loop:
paths-filter's model is one shared base for all filters in a single call,
which doesn't fit once each service needs a different base. The hand-rolled
loop lives alongside the `should_build` logic that already exists in
`resolve-matrix` (`cd.yml:166-184`), just one job earlier.

Outputs: `api`, `web`, `bot`, `stt` — each `"true"`/`"false"`, already fully
resolved (shared/workflow considered).

## 3. `resolve-matrix`

Shrinks to pure partitioning — no more `EVENT_NAME` / `WORKFLOW_CHANGED` /
`SHARED_CHANGED` branching, all of that is resolved upstream now:

```bash
for service in api web bot stt; do
  if [[ "<resolve-baselines output for $service>" == "true" ]]; then
    build+=("$service")
  else
    retag+=("$service")
  fi
done
```

## 4. `build`

One addition: a `labels:` input on the existing `docker/build-push-action`
step (`cd.yml:293-305`), stamping the exact commit onto the image:

```yaml
labels: |
  org.opencontainers.image.revision=${{ needs.meta.outputs.deploy_sha }}
```

Applies to both tags pushed in that step (`:${deploy_sha}` and `:latest` —
`cd.yml:301-303`), since they're the same manifest.

## 5. `retag` / `deploy`

No changes. `docker buildx imagetools create` (`cd.yml:339-341`) copies the
referenced manifest verbatim onto the new tag, so the label — and thus the
next run's baseline for that service — travels automatically with it. This
is the mechanism that makes an unchanged service's baseline correctly
"stay put" across a retag rather than advancing.

## 6. Error handling summary

| Situation | Behavior |
|---|---|
| No label on `:latest` (bootstrap, or image never built under this scheme) | Force build |
| GHCR query fails/times out for one service | Force build for that service only; other services unaffected |
| `docker login` itself fails | Job fails outright — not new, `build`/`retag` already hard-depend on this login succeeding today |
| Labeled SHA unreachable in history (rare `master` rewrite) | Force build |
| `workflow_dispatch` | All four forced, no GHCR query attempted |

**Bootstrap:** the first deploy after this ships, no service has the label
yet, so all four force-build once — same one-time cost as the manual
`workflow_dispatch` rebuild already used to resolve the incident, but
automatic. Each service's baseline then self-heals independently: if only
`bot` gets rebuilt in the next cycle, only `bot` carries the label forward;
`stt` keeps force-building until its own turn comes up.

## 7. Removed code

- `ci.yml`: "Record push range for CD" and "Upload push range artifact"
  steps (`ci.yml:63-77`) — confirmed via repo-wide search these have no
  consumer besides the mechanism being replaced.
- `cd.yml`: "Download push range from CI" step (`cd.yml:63-71`); "Resolve
  diff base" step's push-range/zero-before/parent-fallback logic
  (`cd.yml:73-101`), replaced by §2; the `dorny/paths-filter` step
  (`cd.yml:103-136`), replaced by the per-service loop in §2.

Net: less code than today, one fewer third-party action dependency, and the
"before is all zeroes" special case disappears because nothing depends on
push-event payloads anymore.

## 8. Validation plan

No unit-test framework applies to workflow YAML/bash directly, so:

1. **Shape check:** GitHub validates workflow YAML on push (malformed YAML
   or unknown keys surface as a parse error in the Actions tab). Careful
   review of the diff otherwise.
2. **Local dry-run of the pure-bash logic:** the baseline/pathspec/`git
   diff --quiet` loop is plain git + bash — exercisable directly against
   this repo's real history before merging, no GHCR involved.
3. **Regression check specific to this incident:** using the real SHAs from
   the postmortem (web's last actual build, `9c478f4`, `f434c9d`), manually
   run `git diff --quiet <old-web-baseline> f434c9d -- apps/web/** ...` and
   confirm it reports changed. Directly proves the fix would have caught
   the exact case that slipped through.
4. **What can only be validated live:** the GHCR label write/read
   round-trip needs real pushed images. Validated by watching
   `resolve-baselines`/`resolve-matrix` logs on the first 1-2 real deploys
   after merge: bootstrap force-builds all four once, then steady-state
   correctly retags unchanged services. Per §6, a mistake here degrades to
   "rebuilds too much," never back to this incident's failure mode.

---

## 9. Out of scope

- **Detecting drift from manual/out-of-band registry changes** (e.g.
  someone `docker push`-ing to GHCR outside this pipeline). Unrelated to
  the incident; the label is only ever written by `build`, so this isn't
  guarded against, but it also isn't today.
- **Reconciling GHCR `:latest` content against what's actually running on
  the VPS.** These can already diverge today (e.g. an automatic rollback on
  a failed health check leaves the VPS intentionally behind `:latest`) and
  that's unaffected by this change — this fix is scoped to the build/retag
  decision, not deploy-time drift.
- **`actionlint` or other workflow-linting CI step.** Would help catch
  YAML/syntax issues earlier, but is a separate improvement not required by
  this fix.

---

## Addendum — post-implementation note

Two bugs were found in the plan's own bash during code review of the
implementation (see `docs/superpowers/plans/2026-07-29-cd-image-baseline-tracking.md`
and commit `8c8a7cb`), both in code this document specified verbatim:

- The `--format '{{json .Config.Labels}}'` string in §2 above is invalid —
  `docker buildx imagetools inspect` has no top-level `.Config` field.
  `docker/build-push-action@v7`'s default provenance attestation makes even
  a single-platform push resolve to a multi-manifest index, and labels live
  under `.image.config.Labels` (flat) or `.image["linux/arm64"].config.Labels`
  (platform-keyed), depending on shape — confirmed against this repo's real
  production images. The shipped code tries both.
- The unquoted `$(service_globs "$service")` in the §2 loop let bash
  pathname-expand the `**` globs against the checked-out worktree instead
  of passing them to `git diff` as literal pathspecs — silently blind to
  path deletions. Fixed with `set -f`.

Left uncorrected above since this document records the design as approved;
the actual shipped behavior is the code in `cd.yml`, not this doc.
