# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Deploying to your own VPS (Docker)

1. Build the image on the server (or push it to a registry from CI and pull it):
   ```bash
   docker build -t kinglier-game .
   ```
2. Run it, publishing the container's port 2567 on the host:
   ```bash
   docker run -d --restart unless-stopped --name kinglier -p 2567:2567 kinglier-game
   ```
3. Point your existing reverse proxy (nginx/Caddy) at `127.0.0.1:2567`, terminating TLS there, and proxying both regular HTTP and the WebSocket upgrade (`Connection: Upgrade`, `Upgrade: websocket` headers) through to the container.
4. `VITE_SERVER_WS_URL` is **not** needed in production — the client defaults to same-origin `wss://your-domain`, since the same container serves both the static app and the WebSocket endpoint.
