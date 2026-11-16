param(
    [string]$TenantId = 'b8c19512-2aed-471d-a8d1-9b06e7da786a',
    [string]$ClientId = 'b3c32dc4-9186-437d-9558-b1157fcde8bf',
    [string]$DatasetId = '1d4485a8-e6be-4930-85f1-853348554349'
)

$ErrorActionPreference = 'Stop'
$authority = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0"
# No client secret or persistent token cache: this is a delegated, read-only test.
$device = Invoke-RestMethod -Method Post -Uri "$authority/devicecode" -Body @{
    client_id = $ClientId
    scope = 'https://analysis.windows.net/powerbi/api/Dataset.Read.All'
}
Write-Output "AUTH_URL: $($device.verification_uri)"
Write-Output "AUTH_CODE: $($device.user_code)"
Write-Output 'Connecte-toi avec le compte universitaire qui possede le modele Marmiton.'
$deadline = [DateTime]::UtcNow.AddSeconds($device.expires_in)
$interval = [int]$device.interval
$token = $null
while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds $interval
    try {
        $token = Invoke-RestMethod -Method Post -Uri "$authority/token" -Body @{
            grant_type = 'urn:ietf:params:oauth:grant-type:device_code'
            client_id = $ClientId
            device_code = $device.device_code
        }
        break
    } catch {
        $detail = $null
        try { $detail = $_.ErrorDetails.Message | ConvertFrom-Json } catch {}
        if ($detail.error -eq 'authorization_pending') { continue }
        if ($detail.error -eq 'slow_down') { $interval += 5; continue }
        if ($detail) { throw "Authentification: $($detail.error) - $($detail.error_description)" }
        throw
    }
}
if (-not $token) { throw 'Code de connexion expire. Relancer le script.' }
Write-Output 'AUTHENTIFICATION_OK'
try {
    $requestBody = @{
        queries = @(@{ query = 'EVALUATE ROW("Recettes", COUNTROWS(recipes), "RecettesNotees", COUNT(recipes[rating_value]), "RecettesSansNote", COUNTROWS(FILTER(recipes, ISBLANK(recipes[rating_value]))))' })
        serializerSettings = @{ includeNulls = $true }
    } | ConvertTo-Json -Depth 6
    $result = Invoke-RestMethod -Method Post `
        -Uri "https://api.powerbi.com/v1.0/myorg/datasets/$DatasetId/executeQueries" `
        -Headers @{ Authorization = "Bearer $($token.access_token)" } `
        -ContentType 'application/json' -Body $requestBody
    if ($result.error) { throw ($result.error | ConvertTo-Json -Depth 8 -Compress) }
    foreach ($item in $result.results) {
        if ($item.error) { throw ($item.error | ConvertTo-Json -Depth 8 -Compress) }
        foreach ($table in $item.tables) {
            if ($table.error) { throw ($table.error | ConvertTo-Json -Depth 8 -Compress) }
            $table.rows | ConvertTo-Json -Depth 4
        }
    }
    Write-Output 'LECTURE_MODELE_OK'
} catch {
    if ($_.ErrorDetails.Message) { throw "Lecture Power BI: $($_.ErrorDetails.Message)" }
    throw
} finally {
    $token = $null
    $device = $null
}
