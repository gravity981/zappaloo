# Theme package editor

A developer-only web tool that defines, previews and exports a theme package
(sw-architecture.md 19.7 and 19.7.1, epic 5.2). It is not part of the app.

Start it from the repository root:

```sh
APP_ENV=dev npm run dev:theme-editor
```

Open [http://localhost:5176](http://localhost:5176). The server listens on
`127.0.0.1` only. It refuses to start without `APP_ENV=dev`, and the workspace
cannot be built for production (`vite build` fails). Its source is not copied
into the production image (only `package.json`, so that `npm ci` knows the
workspace), and the frontend does not import it (THM-08).

The editor is built story by story; see
[epic 5.2](../spec/backlog/epics/epic-5.2-theme-package-editor.md). The screen
is in the UX mocks (`theme-editor`).
