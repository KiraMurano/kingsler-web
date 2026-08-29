---
name: deploy-to-vps
description: >-
  Ship the current kinglier-game code to production: push to GitHub main,
  rebuild the Docker image on the VPS, and restart the container. Use when
  the user asks to deploy, redeploy, publish, "выложи на сервер", "задеплой",
  or push the latest fixes/changes to the production server / VPS.
---

# Deploy kinglier-game to the VPS

## Environment (fixed for this project)

| What | Value |
|---|---|
| GitHub remote | `https://github.com/KiraMurano/kingsler-web.git`, branch `main` |
| SSH alias | `ozero-ru` |
| Server repo path | `/var/www/admin/data/www/kingsler.ru` |
| Docker image | `kinglier-game` |
| Container name | `kinglier` |
| Port | `2567`, bound to `127.0.0.1` only. Nginx vhost `/etc/nginx/vhosts/admin/kingsler.ru.conf` reverse-proxies `kingsler.ru`'s HTTPS + WebSocket to it — already configured, don't touch it for a routine deploy. (`kiramurano.fvds.ru` is an unrelated site — a different project, "Luma" — don't confuse the two.) |
| Public URL | `https://kingsler.ru` (cert via `certbot`, `/etc/letsencrypt/live/kingsler.ru/`, auto-renews) |
| Data volume | `/var/www/admin/data/www/kingsler.ru/data` on the host, mounted at `/repo/data` — holds `kinglier.db` (accounts). **Never omit `-v` below**, or a redeploy wipes every account. |
| Required env vars (Phase 2+) | `JWT_SECRET` (session signing — generate once, keep stable across deploys), `RESEND_API_KEY`, `MAGIC_LINK_FROM` (e.g. `Kinglier <auth@kingsler.ru>` — `kingsler.ru` itself is the domain verified in Resend, not a subdomain, so this address works directly), `PUBLIC_URL` (must match the public HTTPS URL exactly — it's embedded in magic-link emails) |

## Steps

1. **Verify locally before pushing anything.** Run every self-check and typecheck; do not proceed if any fail:

```bash
npm run check
npx tsc --noEmit -p apps/web/tsconfig.json
npx tsc --noEmit -p apps/server/tsconfig.json
npx tsc --noEmit -p packages/engine/tsconfig.json
```

`npm run check` гоняет все `*.check.ts` параллельно (см. `scripts/check.mjs`) и
укладывается меньше чем в минуту. Подряд те же проверки шли около пяти.

Файлы `*.soak.ts` в этот набор НЕ входят: они играют полную партию в реальном
времени и идут минутами. Гонять их отдельно и только когда правка их касается —
движок ботов, тайминг ходов, открытие партии:

```bash
npm run check:soak
```

2. **Commit and push to `main`.** This repo has no other deploy branch — pushing to `main` *is* the release. Use a clear commit message, then:

```bash
git push origin HEAD:main
```

3. **Pull and rebuild on the server** (one SSH round-trip; `git pull` needs `sudo` because the working tree is root-owned):

```bash
ssh ozero-ru "cd /var/www/admin/data/www/kingsler.ru && sudo git pull && sudo docker build -t kinglier-game ."
```

Read the build output — the image's build stage runs `tsc -b` for the engine/server too, so a real type error fails the build here even if step 1 was skipped.

4. **Restart the container on the new image:**

```bash
ssh ozero-ru "sudo docker stop kinglier && sudo docker rm kinglier && sudo docker run -d --name kinglier --restart unless-stopped -p 127.0.0.1:2567:2567 -v /var/www/admin/data/www/kingsler.ru/data:/repo/data -e JWT_SECRET=<value> -e RESEND_API_KEY=<value> -e MAGIC_LINK_FROM='Kinglier <auth@kingsler.ru>' -e PUBLIC_URL=https://kingsler.ru kinglier-game && sleep 2 && sudo docker ps --filter name=kinglier && sudo docker logs kinglier --tail 30"
```

`JWT_SECRET` and `RESEND_API_KEY` are secrets — keep the real values out of
shell history/chat logs; store them once (e.g. in a root-only file on the
server) and reference that file instead of retyping them per deploy.

Confirm the logs show `Kinglier server listening on :2567` with no stack trace.

5. **Verify from outside:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://kingsler.ru
```

Expect `200`. If a game is in progress, restarting the container drops all active rooms/connections — warn the user before deploying if that matters.

## Troubleshooting

- **`fatal: detected dubious ownership in repository`** on `git pull`: run once on the server: `sudo git config --global --add safe.directory /var/www/admin/data/www/kingsler.ru`.
- **`npm error code EACCES`** during the Docker build's `npm install` (root-owned `~/.npm` cache): shouldn't recur now that `package-lock.json` has the correct Linux optional deps checked in, but if it does, rerun the failing `npm install` with `npm_config_cache=/tmp/npm-cache`.
- **Docker build fails on a native optional dependency** (e.g. `rolldown`/`esbuild` binding not found): `package-lock.json` must be generated on Linux, not macOS — regenerate it on the server in a scratch dir and copy it back, don't hand-edit the Dockerfile to skip the lockfile (breaks `git+ssh` deps that need auth in the slim image).

## Rollback

There's no image versioning here (`kinglier-game` always overwrites `:latest`) — to roll back, `git checkout <previous-commit>` on the server before rebuilding in step 3, or tag images with the short SHA (`docker build -t kinglier-game:$(git rev-parse --short HEAD) .`) if you want to keep old ones around before running step 4.
