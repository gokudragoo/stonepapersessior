# PowerShell script to fix line endings in run.bash
$content = Get-Content run.bash -Raw
$content = $content -replace "`r`n", "`n"
$content = $content -replace "`r", "`n"
[System.IO.File]::WriteAllText("$PWD\run.bash", $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Fixed line endings in run.bash"
