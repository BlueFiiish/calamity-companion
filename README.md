# Calamity Companion

Interactive Terraria **Calamity + Infernum** companion PWA: recursive crafting-tree browser, class guides, boss drops, and item database. Works offline (installable).

## Data
`data/*.json` is generated from the official Calamity wiki Cargo API. To refresh:

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools/pull_cargo.ps1
python tools/build_data.py
```

Pull = 2,753 recipes + 2,014 class-setup rows + 895 drops. Builder emits items/classes/bosses json.
Sprites hotlink from calamitymod.wiki.gg (service worker caches them for offline).

## Deploy
Static site — host `app/` on GitHub Pages (has `.nojekyll`) or any static host.
