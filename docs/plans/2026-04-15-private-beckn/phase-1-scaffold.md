# Phase 1 — Scaffold & Hello-World Deploys

> **For Claude:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Run each task in order. Commit after every task. Stop at the exit criteria at the bottom and report.

**Goal:** Stand up the monorepo and get both a Next.js app (on Vercel) and a Go "hello BPP" service (on Fly.io) deployed to live URLs. Retire every deploy-time unknown before any real code is written.

**Why this phase exists:** The worst failure mode of a one-day build is discovering at hour 8 that Fly.io needs a credit card verification step, or that Vercel's build target doesn't like pnpm workspaces. We eat every one of those surprises now, when the cost of context-switching is lowest.

**Hours:** 0 → 1

**Prereqs on the machine:**
- `node` ≥ 20, `pnpm` ≥ 9
- `go` ≥ 1.22
- `gh` CLI logged in
- `vercel` CLI logged in
- `flyctl` logged in (`fly auth login` — if not installed: `brew install flyctl`)

---

## Task 1.1 — Initialize pnpm workspace

**Files:**
- Create: `/Users/avuthegreat/side-quests/beckn-zk/package.json`
- Create: `/Users/avuthegreat/side-quests/beckn-zk/pnpm-workspace.yaml`
- Create: `/Users/avuthegreat/side-quests/beckn-zk/.gitignore`
- Create: `/Users/avuthegreat/side-quests/beckn-zk/.nvmrc`

**Step 1:** Create `package.json` at the repo root:

```json
{
  "name": "beckn-zk",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev:web": "pnpm --filter bap-web dev",
    "build:web": "pnpm --filter bap-web build",
    "dev:bpp": "cd services/bpp && go run ./cmd/bpp",
    "test:bpp": "cd services/bpp && go test ./..."
  }
}
```

**Step 2:** Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Note: `services/*` is deliberately not a pnpm workspace — the Go BPP is managed by its own `go.mod` and has nothing to do with pnpm.

**Step 3:** Create `.gitignore`:

```
node_modules/
.next/
out/
dist/
.env
.env.local
.vercel/
.fly/
*.log

# Go
services/bpp/bpp
services/bpp/bin/
services/ledger/ledger
services/ledger/bin/

# ZK artifacts
*.zkey
*.wasm
!**/public/**/*.wasm
```

**Step 4:** Create `.nvmrc`:

```
20
```

**Step 5:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "chore: init pnpm workspace scaffold"
```

---

## Task 1.2 — Scaffold Next.js BAP web app

**Files:**
- Create: `apps/bap-web/*` (via `create-next-app`)

**Step 1:** Scaffold the Next.js app. Run from repo root:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
pnpm create next-app@latest apps/bap-web \
  --typescript --tailwind --app --eslint \
  --src-dir=false --import-alias="@/*" \
  --no-turbopack --use-pnpm
```

Expected: directory `apps/bap-web/` exists with Next.js 16 scaffold, Tailwind configured.

**Step 2:** Verify the app builds:

```bash
cd apps/bap-web && pnpm build
```

Expected: build succeeds, `.next/` directory produced.

**Step 3:** Replace `apps/bap-web/app/page.tsx` with a minimal placeholder so the Vercel deploy shows something recognizable:

```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white font-mono">
      <div className="text-center">
        <h1 className="text-4xl mb-2">Private Beckn</h1>
        <p className="text-sm opacity-60">ZK-gated discovery over Beckn DHP</p>
        <p className="text-xs opacity-40 mt-8">phase 1 — scaffold</p>
      </div>
    </main>
  );
}
```

**Step 4:** From repo root, install and rebuild:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk && pnpm install && pnpm --filter bap-web build
```

Expected: clean build, no errors.

**Step 5:** Commit:

```bash
git add -A
git commit -m "feat(bap-web): scaffold Next.js app with placeholder page"
```

---

## Task 1.3 — Scaffold Go BPP service

**Files:**
- Create: `services/bpp/go.mod`
- Create: `services/bpp/cmd/bpp/main.go`
- Create: `services/bpp/internal/.gitkeep`
- Create: `services/bpp/Dockerfile`
- Create: `services/bpp/fly.toml`

**Step 1:** Init the Go module. Run from repo root:

```bash
mkdir -p /Users/avuthegreat/side-quests/beckn-zk/services/bpp/cmd/bpp
mkdir -p /Users/avuthegreat/side-quests/beckn-zk/services/bpp/internal
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
go mod init github.com/avdhesh/beckn-zk/services/bpp
go get github.com/go-chi/chi/v5@latest
```

**Step 2:** Write `services/bpp/cmd/bpp/main.go`:

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type Health struct {
	OK          bool   `json:"ok"`
	Personality string `json:"personality"`
	Version     string `json:"version"`
	Time        string `json:"time"`
}

func main() {
	personality := os.Getenv("BPP_PERSONALITY")
	if personality == "" {
		personality = "lab-alpha"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.Logger)

	r.Get("/healthz", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(Health{
			OK:          true,
			Personality: personality,
			Version:     "0.1.0-scaffold",
			Time:        time.Now().UTC().Format(time.RFC3339),
		}); err != nil {
			panic(err)
		}
	})

	addr := fmt.Sprintf(":%s", port)
	log.Printf("bpp %s listening on %s", personality, addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal(err)
	}
}
```

**Step 3:** Verify it builds and runs locally:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
go build -o bin/bpp ./cmd/bpp
PORT=8080 BPP_PERSONALITY=lab-alpha ./bin/bpp &
sleep 1
curl -s http://localhost:8080/healthz
kill %1
```

Expected: `{"ok":true,"personality":"lab-alpha","version":"0.1.0-scaffold","time":"..."}`

**Step 4:** Write `services/bpp/Dockerfile`:

```dockerfile
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/bpp ./cmd/bpp

FROM alpine:3.20
COPY --from=build /out/bpp /usr/local/bin/bpp
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/bpp"]
```

**Step 5:** Write `services/bpp/fly.toml` — one shared file, the personality is set via machine env vars (not here) so all three instances share the same build:

```toml
app = "beckn-zk-bpp-alpha"
primary_region = "bom"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[http_service.checks]]
  grace_period = "5s"
  interval = "15s"
  method = "GET"
  path = "/healthz"
  timeout = "2s"
```

Note: we'll copy this to `fly.alpha.toml`, `fly.beta.toml`, `fly.gamma.toml` in phase 5 when we deploy all three. For now only one.

**Step 6:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "feat(bpp): scaffold Go service with /healthz and Fly config"
```

---

## Task 1.4 — Deploy BAP web to Vercel

**Step 1:** From repo root, link the Vercel project. The project is the `apps/bap-web` subdirectory inside a pnpm monorepo, so we must tell Vercel that:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/apps/bap-web
npx vercel link --yes
```

Accept defaults; when asked for the project name, use `beckn-zk-bap`.

**Step 2:** Configure the Root Directory. Create `apps/bap-web/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install --frozen-lockfile=false",
  "framework": "nextjs"
}
```

Also create a repo-root `vercel.json` that tells Vercel where the project lives (only needed if the user ever links from the root):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD ./apps/bap-web ./packages"
}
```

**Step 3:** Deploy to production:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/apps/bap-web
npx vercel --prod --yes
```

Expected: deploy succeeds, Vercel prints a `*.vercel.app` URL.

**Step 4:** Sanity-check the URL:

```bash
# Replace with the actual URL from the deploy step.
curl -s -o /dev/null -w "%{http_code}\n" https://<deployed-url>
```

Expected: `200`.

**Step 5:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "chore(bap-web): link and deploy to Vercel"
```

---

## Task 1.5 — Deploy Go BPP to Fly.io

**Step 1:** Launch the first Fly app (alpha):

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
fly launch --no-deploy --copy-config --name beckn-zk-bpp-alpha --region bom --yes
```

Note: if `fly launch` tries to rewrite `fly.toml`, accept. If it asks about a Postgres/Redis, decline both.

**Step 2:** Set the personality env var:

```bash
fly secrets set BPP_PERSONALITY=lab-alpha --app beckn-zk-bpp-alpha
```

**Step 3:** Deploy:

```bash
fly deploy --app beckn-zk-bpp-alpha
```

Expected: build succeeds, machine starts, `fly deploy` prints `Monitoring deployment` and then a success summary with the hostname `beckn-zk-bpp-alpha.fly.dev`.

**Step 4:** Sanity-check:

```bash
curl -s https://beckn-zk-bpp-alpha.fly.dev/healthz
```

Expected: `{"ok":true,"personality":"lab-alpha","version":"0.1.0-scaffold",...}`

**Step 5:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "chore(bpp): deploy lab-alpha to Fly.io"
```

---

## Task 1.6 — Record live URLs in README

**Files:**
- Modify: `README.md` (repo root)

**Step 1:** Replace the root `README.md` with:

````markdown
# beckn-zk

Zero-knowledge eligibility layer over Beckn DHP discovery. Hiring demo for Finternet Labs.

## Live

| Service      | URL                                             |
|--------------|-------------------------------------------------|
| BAP web      | https://<vercel-url>                             |
| BPP alpha    | https://beckn-zk-bpp-alpha.fly.dev/healthz       |
| BPP beta     | (phase 5)                                        |
| BPP gamma    | (phase 5)                                        |

## Repo layout

```
apps/bap-web           Next.js 16 patient app + BAP backend
services/bpp           Go BPP — three Fly.io instances by personality
packages/beckn-core    shared TypeScript Beckn 1.1.1 types
docs/plans/            design doc + phased implementation plan
```

## Local dev

```bash
pnpm install
pnpm dev:web          # http://localhost:3000
pnpm dev:bpp          # http://localhost:8080
```

## Deploy

```bash
# BAP
cd apps/bap-web && npx vercel --prod

# BPP (per personality)
cd services/bpp && fly deploy --app beckn-zk-bpp-alpha
```
````

Fill in `<vercel-url>` with the URL from Task 1.4.

**Step 2:** Commit:

```bash
git add README.md
git commit -m "docs: record live URLs in README"
```

---

## Phase exit criteria

Stop here and report. Do not start Phase 2.

Checklist:

- [ ] `pnpm install` from repo root succeeds.
- [ ] `pnpm dev:web` serves the placeholder page on `localhost:3000`.
- [ ] `pnpm dev:bpp` responds `200` on `localhost:8080/healthz`.
- [ ] `curl https://<vercel-url>` returns `200`.
- [ ] `curl https://beckn-zk-bpp-alpha.fly.dev/healthz` returns the expected JSON body.
- [ ] All tasks have their own commit in `git log`.

**Report format:**

```
PHASE 1 DONE
Vercel URL: <url>
Fly alpha URL: https://beckn-zk-bpp-alpha.fly.dev
Commits: <N>
Time spent: <minutes>
Anything surprising: <one line or "nothing">
```
