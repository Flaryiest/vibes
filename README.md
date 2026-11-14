# Singing trainer

A personal web app for learning to sing a few chosen songs well. It listens through the MacBook's microphone, fits every exercise and song to your range, scores what you sing, and plans a daily session.

Design and research: `docs/superpowers/specs/2026-11-13-singing-trainer-design.md` and `reports/`.

## Run it

Requires Google Chrome, Node 22 and pnpm.

```
pnpm install
pnpm start          # builds the app and serves it at http://localhost:4747
```

Open `http://localhost:4747` in Chrome. Always use that address: the microphone permission and your stored progress belong to it.

To have it running whenever you are logged in, with no terminal:

```
pnpm build
pnpm run install-agent      # undo with: pnpm run uninstall-agent
```

Then, in Chrome, choose "Install Singing trainer" from the address bar to get a Dock icon.

## First use

1. **Range**: three short recordings. Every exercise and song is then fitted to your voice.
2. **Today → Start today's session**: warm-up, pitch matching, song work and a check-in, in order.
3. **Audio lab**: run the calibration once per listening setup (hold one AirPod against the microphone). It measures the delay your headphones add.

Use AirPods or other headphones for anything you want scored against a backing track. On the built-in speakers the track goes silent while you sing, so the microphone hears only you.

## Add a song

Songs are imported from an audio file you have on disk. See `songprep/README.md`.

```
cd songprep
uv run songprep import ~/Music/song.m4a --artist "Artist" --title "Title"
```

The song then appears under Songs, where you pick a key, correct the extracted notes if needed, and practice it phrase by phrase.

## Where things are kept

| What | Where |
|---|---|
| Song packages | `songs/` (not in git) |
| Progress, scores, recordings | Chrome's storage for `localhost:4747` |
| Daily backups of progress (no audio) | `data/backups/`, last 30 days (not in git) |

## Develop

```
pnpm dev            # app on 4747 with live reload; local server on 4748
pnpm test           # unit tests for the app and the server
pnpm e2e            # end-to-end tests in Chrome with a fake microphone
```

| Folder | Contents |
|---|---|
| `app/` | The web app (Vite, React, TypeScript) |
| `server/` | Local server: the built app, song files, saved notes, backups |
| `songprep/` | Song import tool (Python, uv) |
| `schema/` | JSON Schema of the song package |
| `docs/` | Spec and plans |
