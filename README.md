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

## Household Budget (`budget.html`)
A separate, self-contained budget tracker at `/budget.html` — unrelated to the game app.
Import bank/credit-card CSV exports, auto-categorize spending, and track a shared monthly
budget across multiple accounts and people. **100% client-side**: all data lives in
`localStorage` on the device, nothing is uploaded, and no login/credentials are ever needed.

- Import CSVs (auto-detects date/description/amount columns and the +/− sign convention
  used by each bank; Discover lists purchases as `+`, Bank of America as `−`).
- De-dupes on re-import so the same file can't be counted twice.
- Card payments and transfers land in "Transfer/Payment" and are excluded from spending
  totals, so paying a credit card off from checking isn't double-counted.
- Per-category budgets with progress bars, spending by person/account, and a category donut.
- Export/restore backups as JSON, or export all transactions as CSV.
