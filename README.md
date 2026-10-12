# Zoom Garage

A race-car game for Andy (age 5) on a phone. Build a car, race it, give it a pit stop. A Pocket Giggles game.

Plain static site, no build step: open `index.html` from any web server.

## How it plays

- **Garage:** pick the car, paint, number and sticker.
- **Race:** hold the big GO button to drive. Let go before sharp curves (yellow signs, and a
  "CURVE! LET GO" warning) or the car spins out for a moment. There is no crashing and no losing:
  every finish gets a trophy.
- **Pit stop:** hold to fill the gas, rub off the mud, and later change the tires.
- **Race a friend:** tap FRIEND in the garage. One phone makes a 4-digit code, the other
  types it in, and the two cars race on the same track (no computer cars). The track and the
  unlocked features come from the phone that made the code. Friend races count toward unlocks
  and trophies but not toward bedtime, and skip the pit stop. Phones connect directly over
  WebRTC using PeerJS's free broker, the same way Capy Air visits work; only names, car looks
  and race positions are sent. A grown-up setting turns this off.
- **Bedtime:** after a set number of races (3 by default) the car goes to sleep in the garage for
  a while. The squares under the start button show how many races are left.

New things unlock as he finishes races, and everything is unlocked by race 14, so there is no
endless grind (see `UNLOCKS` and `FEATURE_AT` in `js/data.js`):

| Races | Unlock |
| --- | --- |
| 1 | More paint and stickers |
| 2 | Turbo pads on the track |
| 3 | Monster truck |
| 4 | Tire change at the pit stop |
| 5 | Steering arrows and cones |
| 6 | Desert Dunes track |
| 8 | Turbo button (fill it with stars) |
| 10 | Night City track |
| 12 | Formula racer |
| 14 | Snowy Mountain track |

No ads, accounts, streaks, daily rewards or random prizes. Progress lives only in the phone's
browser (`localStorage`, key `zg:save`).

## Grown-up settings

Hold the faint gear in the top corner for 2 seconds, then answer the times-table question.
You can set the driver's name, races before bedtime, how long the garage rests (none, 15 min to
2 hours, or until tomorrow morning), sound and voice, wake the car early, unlock everything, or
reset progress.

## Layout

- `index.html`: all screens and the ordered list of scripts.
- `css/style.css`: the whole look.
- `js/data.js` cars, colors, tracks, unlocks · `js/save.js` progress and bedtime · `js/sound.js`
  synthesized sounds and voice · `js/draw.js` car drawing · `js/race.js` the race · `js/pit.js`
  the pit stop · `js/net.js` friend races (PeerJS) · `js/parents.js` grown-up settings · `js/main.js` screens and flow.
- `sw.js`: lets the game open offline after the first visit (network first, so updates show up
  right away).

The scripts are plain files sharing one global scope, loaded in the order listed in `index.html`.

## Develop

```sh
python3 -m http.server 4173   # then open http://localhost:4173/
```

On a computer: Space or Up to drive, Left/Right to steer, T for turbo. To try a friend race,
open the game in two browser tabs (it needs the internet for PeerJS).

## Deploying

Hosted on Cloudflare (Workers static assets) like Capy Island. Create a Worker named
`zoom-garage` connected to this repo with Workers Builds (deploy command: `npx wrangler deploy`,
config in `wrangler.jsonc`), then add `zoom.pocketgiggles.com` as a custom domain.
`.assetsignore` lists files that are never served.
