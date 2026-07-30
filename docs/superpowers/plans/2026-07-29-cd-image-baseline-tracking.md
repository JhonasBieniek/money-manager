# CD Build/Retag Baseline Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `resolve-matrix` in `.github/workflows/cd.yml` decide build-vs-retag per service by diffing against the commit actually baked into that service's own `:latest` GHCR image, instead of against the previous push — so a streak of red/skipped CI can never cause a service to be silently retagged with stale content.

**Architecture:** `detect-changes` is renamed to `resolve-baselines` and rewritten to read each service's `org.opencontainers.image.revision` label off its current `ghcr.io/.../money-manager-<service>:latest` image (via `docker buildx imagetools inspect`) and diff against that SHA, instead of the old push-range-artifact/parent-fallback logic. `resolve-matrix`, `build`, and `retag` are updated to match. No new services, secrets, or files — the whole fix lives inside the two existing workflow files, `.github/workflows/cd.yml` and `.github/workflows/ci.yml`.

**Tech Stack:** GitHub Actions, Docker Buildx (`imagetools inspect` / `imagetools create`), GHCR, bash + `jq` — all already used by these two workflows today.

**Reference:** [docs/superpowers/specs/2026-07-29-cd-image-baseline-tracking-design.md](../specs/2026-07-29-cd-image-baseline-tracking-design.md)

---

### Task 1: Replace `detect-changes` with `resolve-baselines` in `cd.yml`

**Files:**
- Modify: `.github/workflows/cd.yml`

This is one task/one commit even though it touches four jobs (`resolve-baselines` itself, plus `resolve-matrix`, `build`, and `retag`'s references to it), because they're not independently valid: renaming the job and changing its outputs shape means every downstream reference must move in the same commit, or the workflow is broken (GitHub would reject it with "Job resolve-matrix depends on unknown job detect-changes"). Splitting this across commits would leave a broken workflow file in history.

- [ ] **Step 1: Reproduce today's bug against real repo history**

This repo's own history contains the exact incident described in the design doc: web's investments-nav commit (`9c478f4`, 2026-07-28) landed, then several pushes had red CI, until `f434c9d` (2026-07-29, `apps/api` only) finally went green. Confirm that diffing only against the *immediate parent* of the green commit — what today's fallback logic effectively does after a streak of skipped runs — misses the accumulated `apps/web` changes:

Run:
```bash
git diff --quiet f434c9d~1 f434c9d -- apps/web/** packages/types/** packages/utils/** apps/web/Dockerfile package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs .github/workflows/cd.yml .github/workflows/ci.yml; echo "exit=$?"
```
Expected: `exit=0` (git reports **no differences** — `web` would be wrongly retagged).

- [ ] **Step 2: Confirm the fix — diffing against the correct baseline catches it**

Same pathspec, but against the commit before `web` was actually last built (immediately before the investments-nav commit, simulating "the last commit actually baked into web's `:latest`"):

Run:
```bash
git diff --quiet 9c478f4~1 f434c9d -- apps/web/** packages/types/** packages/utils/** apps/web/Dockerfile package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs .github/workflows/cd.yml .github/workflows/ci.yml; echo "exit=$?"
```
Expected: `exit=1` (git reports differences — `web` correctly flagged as changed). This confirms the core mechanism this task implements: the fix is entirely about *which baseline* the diff runs against, not the diff logic itself.

- [ ] **Step 3: Remove the now-unused `actions: read` permission**

That permission exists only for `actions/download-artifact`, which is removed in this task (its sole use was downloading the push-range artifact this fix replaces).

In `.github/workflows/cd.yml`, find:
```yaml
permissions:
  contents: read
  packages: write
  actions: read
```
Replace with:
```yaml
permissions:
  contents: read
  packages: write
```

- [ ] **Step 4: Replace the `detect-changes` job with `resolve-baselines`**

Find the entire `detect-changes` job (from `  detect-changes:` through the end of its "Log detected changes" step — everything between the `meta` job and the `# matrix.* is not available...` comment above `resolve-matrix`):

```yaml
  detect-changes:
    needs: meta
    if: >-
      github.event_name == 'workflow_dispatch' ||
      github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    outputs:
      api: ${{ steps.filter.outputs.api }}
      web: ${{ steps.filter.outputs.web }}
      bot: ${{ steps.filter.outputs.bot }}
      stt: ${{ steps.filter.outputs.stt }}
      shared: ${{ steps.filter.outputs.shared }}
      workflow: ${{ steps.filter.outputs.workflow }}
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ needs.meta.outputs.deploy_sha }}
          fetch-depth: 0

      # CI records github.event.before/after on master pushes; CD has no push payload.
      - name: Download push range from CI
        if: github.event_name == 'workflow_run'
        continue-on-error: true
        uses: actions/download-artifact@v8
        with:
          name: deploy-range-${{ needs.meta.outputs.deploy_sha }}
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          path: deploy-range

      - name: Resolve diff base
        id: diff
        run: |
          DEPLOY_SHA="${{ needs.meta.outputs.deploy_sha }}"
          # paths-filter fetches `base` as a refspec, so it must be a real SHA —
          # "${DEPLOY_SHA}~1" is only valid rev-parse syntax, not a fetchable ref.
          PARENT_SHA="$(git rev-parse "${DEPLOY_SHA}~1" 2>/dev/null || echo "$DEPLOY_SHA")"

          if [[ -f deploy-range/before && -f deploy-range/after ]]; then
            BEFORE="$(tr -d '[:space:]' < deploy-range/before)"
            AFTER="$(tr -d '[:space:]' < deploy-range/after)"
            echo "Push range from CI: ${BEFORE}..${AFTER}"

            # GitHub sends 40 zeroes for before on the first push or a new branch.
            if [[ "$BEFORE" =~ ^0+$ ]]; then
              echo "base=${PARENT_SHA}" >> "$GITHUB_OUTPUT"
              echo "ref=${DEPLOY_SHA}" >> "$GITHUB_OUTPUT"
              echo "strategy=parent-fallback (zero before)" >> "$GITHUB_OUTPUT"
            else
              echo "base=${BEFORE}" >> "$GITHUB_OUTPUT"
              echo "ref=${DEPLOY_SHA}" >> "$GITHUB_OUTPUT"
              echo "strategy=push-range" >> "$GITHUB_OUTPUT"
            fi
          else
            # Fallback when artifact is missing (first deploy after this change) or workflow_dispatch.
            echo "base=${PARENT_SHA}" >> "$GITHUB_OUTPUT"
            echo "ref=${DEPLOY_SHA}" >> "$GITHUB_OUTPUT"
            echo "strategy=parent-fallback (no artifact)" >> "$GITHUB_OUTPUT"
          fi

      - name: Detect changed paths
        uses: dorny/paths-filter@v4
        id: filter
        with:
          base: ${{ steps.diff.outputs.base }}
          ref: ${{ steps.diff.outputs.ref }}
          filters: |
            shared:
              - package.json
              - pnpm-lock.yaml
              - pnpm-workspace.yaml
              - turbo.json
              - tsconfig.base.json
              - eslint.config.mjs
            api:
              - apps/api/**
              - packages/db/**
              - packages/types/**
              - packages/utils/**
              - apps/api/Dockerfile
            web:
              - apps/web/**
              - packages/types/**
              - packages/utils/**
              - apps/web/Dockerfile
            bot:
              - apps/bot/**
              - apps/bot/Dockerfile
            stt:
              - apps/stt/**
            workflow:
              - .github/workflows/cd.yml
              - .github/workflows/ci.yml

      - name: Log detected changes
        run: |
          echo "diff strategy=${{ steps.diff.outputs.strategy }} base=${{ steps.diff.outputs.base }} ref=${{ steps.diff.outputs.ref }}"
          echo "api=${{ steps.filter.outputs.api }} web=${{ steps.filter.outputs.web }} bot=${{ steps.filter.outputs.bot }} stt=${{ steps.filter.outputs.stt }}"
          echo "shared=${{ steps.filter.outputs.shared }} workflow=${{ steps.filter.outputs.workflow }}"
```

Replace it with:

```yaml
  resolve-baselines:
    needs: meta
    if: >-
      github.event_name == 'workflow_dispatch' ||
      github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    outputs:
      api: ${{ steps.resolve.outputs.api }}
      web: ${{ steps.resolve.outputs.web }}
      bot: ${{ steps.resolve.outputs.bot }}
      stt: ${{ steps.resolve.outputs.stt }}
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ needs.meta.outputs.deploy_sha }}
          fetch-depth: 0

      - uses: docker/setup-buildx-action@v4
        if: github.event_name != 'workflow_dispatch'

      - name: Log in to GHCR
        if: github.event_name != 'workflow_dispatch'
        uses: docker/login-action@v4
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # Each service's build/retag decision diffs against the commit actually baked
      # into its own :latest image (read back from a label on the image in GHCR) —
      # not the previous push. This stays correct across streaks of failed/skipped
      # CI, where "the previous push" and "the last commit actually built" diverge.
      - name: Resolve per-service baselines and detect changes
        id: resolve
        env:
          EVENT_NAME: ${{ github.event_name }}
          DEPLOY_SHA: ${{ needs.meta.outputs.deploy_sha }}
          IMAGE_PREFIX: ${{ needs.meta.outputs.image_prefix }}
        run: |
          SHARED_GLOBS="package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs"
          WORKFLOW_GLOBS=".github/workflows/cd.yml .github/workflows/ci.yml"

          service_globs() {
            case "$1" in
              api) echo "apps/api/** packages/db/** packages/types/** packages/utils/** apps/api/Dockerfile $SHARED_GLOBS $WORKFLOW_GLOBS" ;;
              web) echo "apps/web/** packages/types/** packages/utils/** apps/web/Dockerfile $SHARED_GLOBS $WORKFLOW_GLOBS" ;;
              bot) echo "apps/bot/** apps/bot/Dockerfile $SHARED_GLOBS $WORKFLOW_GLOBS" ;;
              stt) echo "apps/stt/** $WORKFLOW_GLOBS" ;;
            esac
          }

          baseline_sha() {
            local service="$1"
            local image="${IMAGE_PREFIX}-${service}"
            local label
            label="$(docker buildx imagetools inspect "${image}:latest" --format '{{json .Config.Labels}}' 2>/dev/null | jq -r '.["org.opencontainers.image.revision"] // empty' 2>/dev/null || true)"
            if [[ -n "$label" ]] && git cat-file -e "${label}^{commit}" 2>/dev/null; then
              echo "$label"
            fi
          }

          for service in api web bot stt; do
            if [[ "$EVENT_NAME" == "workflow_dispatch" ]]; then
              echo "==> ${service}: workflow_dispatch, forcing build"
              echo "${service}=true" >> "$GITHUB_OUTPUT"
              continue
            fi

            base="$(baseline_sha "$service")"
            if [[ -z "$base" ]]; then
              echo "==> ${service}: no valid baseline found, forcing build"
              echo "${service}=true" >> "$GITHUB_OUTPUT"
              continue
            fi

            if git diff --quiet "$base" "$DEPLOY_SHA" -- $(service_globs "$service"); then
              echo "==> ${service}: unchanged since ${base}"
              echo "${service}=false" >> "$GITHUB_OUTPUT"
            else
              echo "==> ${service}: changed since ${base}"
              echo "${service}=true" >> "$GITHUB_OUTPUT"
            fi
          done
```

Note the `baseline_sha` function's command substitution ends in `|| true`: GitHub Actions `run:` steps execute under `bash -e -o pipefail`, so without it, a single service whose image doesn't exist yet (e.g. `stt` never built before) would abort the *entire* step instead of gracefully falling back to "no baseline found."

- [ ] **Step 5: Update `resolve-matrix`'s `needs`/`if` and simplify its body**

Find:
```yaml
  resolve-matrix:
    needs: [meta, detect-changes]
    if: >-
      always() &&
      needs.meta.result == 'success' &&
      needs.detect-changes.result == 'success'
    runs-on: ubuntu-latest
```
Replace with:
```yaml
  resolve-matrix:
    needs: [meta, resolve-baselines]
    if: >-
      always() &&
      needs.meta.result == 'success' &&
      needs.resolve-baselines.result == 'success'
    runs-on: ubuntu-latest
```

Then find the `resolve-matrix` job's step body:
```yaml
    steps:
      - name: Resolve build and retag matrices
        id: resolve
        env:
          EVENT_NAME: ${{ github.event_name }}
          WORKFLOW_CHANGED: ${{ needs.detect-changes.outputs.workflow }}
          API_CHANGED: ${{ needs.detect-changes.outputs.api }}
          WEB_CHANGED: ${{ needs.detect-changes.outputs.web }}
          BOT_CHANGED: ${{ needs.detect-changes.outputs.bot }}
          STT_CHANGED: ${{ needs.detect-changes.outputs.stt }}
          SHARED_CHANGED: ${{ needs.detect-changes.outputs.shared }}
        run: |
          should_build() {
            local service="$1"

            if [[ "$EVENT_NAME" == "workflow_dispatch" || "$WORKFLOW_CHANGED" == "true" ]]; then
              return 0
            fi

            if [[ "$service" != "stt" && "$SHARED_CHANGED" == "true" ]]; then
              return 0
            fi

            case "$service" in
              api) [[ "$API_CHANGED" == "true" ]] ;;
              web) [[ "$WEB_CHANGED" == "true" ]] ;;
              bot) [[ "$BOT_CHANGED" == "true" ]] ;;
              stt) [[ "$STT_CHANGED" == "true" ]] ;;
              *) return 1 ;;
            esac
          }

          build=()
          retag=()

          for service in api web bot stt; do
            if should_build "$service"; then
              build+=("$service")
            elif [[ "$EVENT_NAME" != "workflow_dispatch" ]]; then
              retag+=("$service")
            fi
          done

          if [[ ${#build[@]} -eq 0 ]]; then
            echo "build_services=[]" >> "$GITHUB_OUTPUT"
          else
            echo "build_services=$(jq -nc --args '$ARGS.positional' "${build[@]}")" >> "$GITHUB_OUTPUT"
          fi

          if [[ ${#retag[@]} -eq 0 ]]; then
            echo "retag_services=[]" >> "$GITHUB_OUTPUT"
          else
            echo "retag_services=$(jq -nc --args '$ARGS.positional' "${retag[@]}")" >> "$GITHUB_OUTPUT"
          fi

          echo "Build: ${build[*]:-none}"
          echo "Retag: ${retag[*]:-none}"
```

Replace with (the `should_build` special-casing for `workflow_dispatch`/shared/workflow-file changes is gone because `resolve-baselines` already resolves all of that per-service now):

```yaml
    steps:
      - name: Partition services into build/retag matrices
        id: resolve
        env:
          API_CHANGED: ${{ needs.resolve-baselines.outputs.api }}
          WEB_CHANGED: ${{ needs.resolve-baselines.outputs.web }}
          BOT_CHANGED: ${{ needs.resolve-baselines.outputs.bot }}
          STT_CHANGED: ${{ needs.resolve-baselines.outputs.stt }}
        run: |
          build=()
          retag=()

          for service in api web bot stt; do
            case "$service" in
              api) changed="$API_CHANGED" ;;
              web) changed="$WEB_CHANGED" ;;
              bot) changed="$BOT_CHANGED" ;;
              stt) changed="$STT_CHANGED" ;;
            esac

            if [[ "$changed" == "true" ]]; then
              build+=("$service")
            else
              retag+=("$service")
            fi
          done

          if [[ ${#build[@]} -eq 0 ]]; then
            echo "build_services=[]" >> "$GITHUB_OUTPUT"
          else
            echo "build_services=$(jq -nc --args '$ARGS.positional' "${build[@]}")" >> "$GITHUB_OUTPUT"
          fi

          if [[ ${#retag[@]} -eq 0 ]]; then
            echo "retag_services=[]" >> "$GITHUB_OUTPUT"
          else
            echo "retag_services=$(jq -nc --args '$ARGS.positional' "${retag[@]}")" >> "$GITHUB_OUTPUT"
          fi

          echo "Build: ${build[*]:-none}"
          echo "Retag: ${retag[*]:-none}"
```

- [ ] **Step 6: Update `build`'s `needs`/`if` and add the revision label**

Find:
```yaml
    needs: [meta, detect-changes, resolve-matrix]
    if: >-
      always() &&
      needs.meta.result == 'success' &&
      needs.detect-changes.result == 'success' &&
      needs.resolve-matrix.result == 'success' &&
      needs.resolve-matrix.outputs.build_services != '[]'
```
Replace with:
```yaml
    needs: [meta, resolve-baselines, resolve-matrix]
    if: >-
      always() &&
      needs.meta.result == 'success' &&
      needs.resolve-baselines.result == 'success' &&
      needs.resolve-matrix.result == 'success' &&
      needs.resolve-matrix.outputs.build_services != '[]'
```

Then find the build-and-push step:
```yaml
      - name: Build and push ${{ matrix.service }} image (linux/arm64)
        uses: docker/build-push-action@v7
        with:
          context: ${{ steps.config.outputs.context }}
          file: ${{ steps.config.outputs.file }}
          platforms: linux/arm64
          push: true
          build-args: ${{ steps.buildargs.outputs.args != '' && steps.buildargs.outputs.args || '' }}
          tags: |
            ${{ needs.meta.outputs.image_prefix }}-${{ matrix.service }}:${{ needs.meta.outputs.deploy_sha }}
            ${{ needs.meta.outputs.image_prefix }}-${{ matrix.service }}:latest
          cache-from: type=gha,scope=${{ matrix.service }}
          cache-to: type=gha,mode=max,scope=${{ matrix.service }}
```
Replace with (adds `labels:` — everything else unchanged):
```yaml
      - name: Build and push ${{ matrix.service }} image (linux/arm64)
        uses: docker/build-push-action@v7
        with:
          context: ${{ steps.config.outputs.context }}
          file: ${{ steps.config.outputs.file }}
          platforms: linux/arm64
          push: true
          build-args: ${{ steps.buildargs.outputs.args != '' && steps.buildargs.outputs.args || '' }}
          labels: |
            org.opencontainers.image.revision=${{ needs.meta.outputs.deploy_sha }}
          tags: |
            ${{ needs.meta.outputs.image_prefix }}-${{ matrix.service }}:${{ needs.meta.outputs.deploy_sha }}
            ${{ needs.meta.outputs.image_prefix }}-${{ matrix.service }}:latest
          cache-from: type=gha,scope=${{ matrix.service }}
          cache-to: type=gha,mode=max,scope=${{ matrix.service }}
```

- [ ] **Step 7: Update `retag`'s `needs`/`if`**

Find:
```yaml
    needs: [meta, detect-changes, build, resolve-matrix]
    if: >-
      always() &&
      needs.meta.result == 'success' &&
      needs.detect-changes.result == 'success' &&
      needs.resolve-matrix.result == 'success' &&
      needs.build.result != 'failure' &&
      needs.build.result != 'cancelled' &&
      needs.resolve-matrix.outputs.retag_services != '[]'
```
Replace with:
```yaml
    needs: [meta, resolve-baselines, build, resolve-matrix]
    if: >-
      always() &&
      needs.meta.result == 'success' &&
      needs.resolve-baselines.result == 'success' &&
      needs.resolve-matrix.result == 'success' &&
      needs.build.result != 'failure' &&
      needs.build.result != 'cancelled' &&
      needs.resolve-matrix.outputs.retag_services != '[]'
```

`retag`'s own step body (the `docker buildx imagetools create` step) is untouched — it already copies the source manifest (and thus the revision label) verbatim onto the new tag.

- [ ] **Step 8: Confirm no stale references remain**

Run:
```bash
grep -n "detect-changes" .github/workflows/cd.yml
```
Expected: no output (empty match — every reference was renamed to `resolve-baselines`).

- [ ] **Step 9: Review the full diff**

Run:
```bash
git diff .github/workflows/cd.yml
```
Confirm: the only changes are the ones in Steps 3–7 above (permissions block, the `detect-changes` → `resolve-baselines` job, `resolve-matrix`'s needs/if/body, `build`'s needs/if + `labels:` addition, `retag`'s needs/if). `deploy` should show no diff at all — it never referenced `detect-changes`.

- [ ] **Step 10: Commit**

```bash
git add .github/workflows/cd.yml
git commit -m "fix(cd): track per-service build baselines via GHCR image labels instead of previous-push diff"
```

---

### Task 2: Remove now-dead push-range plumbing from `ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

Safe to do after Task 1: `cd.yml` no longer downloads or reads the `deploy-range-*` artifact, so nothing consumes what this task removes.

- [ ] **Step 1: Remove the artifact-recording steps**

Find (immediately after the "Test" step, before the `e2e` job):
```yaml
      - name: Test
        run: pnpm test

      # Persist push before/after so CD can diff multi-commit pushes (workflow_run has no push payload).
      - name: Record push range for CD
        if: github.event_name == 'push' && github.ref == 'refs/heads/master'
        run: |
          mkdir -p deploy-range
          echo "${{ github.event.before }}" > deploy-range/before
          echo "${{ github.event.after }}" > deploy-range/after

      - name: Upload push range artifact
        if: github.event_name == 'push' && github.ref == 'refs/heads/master'
        uses: actions/upload-artifact@v7
        with:
          name: deploy-range-${{ github.sha }}
          path: deploy-range/
          retention-days: 7

  e2e:
```
Replace with:
```yaml
      - name: Test
        run: pnpm test

  e2e:
```

- [ ] **Step 2: Confirm nothing else references the removed artifact**

Run:
```bash
grep -rn "deploy-range" .github/
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "chore(ci): remove push-range artifact, superseded by per-service GHCR baseline tracking"
```

---

### Task 3: Final review and rollout notes

**Files:** none (review-only; no commit unless it turns something up)

- [ ] **Step 1: Re-read the full `cd.yml` and check the job graph**

Confirm the dependency chain reads cleanly top to bottom: `meta` → `resolve-baselines` → `resolve-matrix` → `build` → `retag` → `deploy`, with no job left referencing `detect-changes` (already checked mechanically in Task 1 Step 8, this is a human sanity pass over the full file — indentation, stray duplicate keys, etc.).

- [ ] **Step 2: Note the expected rollout behavior for whoever merges this**

No file changes for this step — just carrying forward what the design doc (§6/§8) already establishes, so it doesn't get lost before the first real deploy:

- The first deploy after this merges will force-build **all four services once** — none of them have the `org.opencontainers.image.revision` label yet, so every baseline lookup comes back empty. This is expected and self-correcting; it's the same one-time cost as the manual `workflow_dispatch` rebuild already used to resolve the original incident.
- Worth watching the `resolve-baselines` and `resolve-matrix` job logs on the first 1-2 real deploys after merge, to confirm: bootstrap builds all four once, then steady-state runs correctly retag unchanged services and build changed ones (per-service `==>` log lines from Task 1 Step 4 make this directly readable).
- If a service's baseline lookup ever fails unexpectedly (GHCR hiccup, malformed label), the failure mode is "that service rebuilds unnecessarily" — never a silent stale retag. That's the property this whole fix is protecting.
