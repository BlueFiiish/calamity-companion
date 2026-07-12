# Pull Calamity wiki Cargo tables to raw JSON (Norton-safe: uses Windows cert store).
# ASCII-only source. Output UTF-8 so the U+2021 ingredient separator survives.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rawDir = Join-Path $root 'raw'
if (!(Test-Path $rawDir)) { New-Item -ItemType Directory -Path $rawDir | Out-Null }

$base = 'https://calamitymod.wiki.gg/api.php'

function Pull-Table($table, $fields, $outFile) {
    $all = New-Object System.Collections.ArrayList
    $offset = 0
    $limit = 500
    while ($true) {
        $q = ('{0}?action=cargoquery&tables={1}&fields={2}&limit={3}&offset={4}&format=json' -f $base, $table, [uri]::EscapeDataString($fields), $limit, $offset)
        $resp = Invoke-RestMethod -Uri $q -Headers @{ 'User-Agent' = 'FiiishIsland-Vault/1.0 (personal wiki companion)' }
        $rows = $resp.cargoquery
        if ($null -eq $rows -or $rows.Count -eq 0) { break }
        foreach ($r in $rows) { [void]$all.Add($r.title) }
        Write-Host ("{0}: pulled {1} (offset {2})" -f $table, $all.Count, $offset)
        if ($rows.Count -lt $limit) { break }
        $offset += $limit
        Start-Sleep -Milliseconds 250
    }
    $json = $all | ConvertTo-Json -Depth 6
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $rawDir $outFile), $json, $utf8)
    Write-Host ("WROTE {0} ({1} rows)" -f $outFile, $all.Count)
}

Pull-Table 'Recipes'      'result,amount,station,resultimage,resulttext,ings,historical' 'recipes.json'
Pull-Table 'ClassSetups'  'class,progression,type,item,_pageName=page'                   'classsetups.json'
Pull-Table 'Drops'        'Item,Npc,Amount,Chance,_pageName=page'                        'drops.json'
Write-Host 'DONE'
