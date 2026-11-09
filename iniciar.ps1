# Abre la API (puerto 3000) y Angular (puerto 4200) en dos ventanas de PowerShell.
# Uso, desde la raíz del proyecto:  powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
# Requiere haber hecho antes "npm install" en backend/ y en frontend-angular/, y tener backend/.env.

$raiz = $PSScriptRoot
if (-not (Test-Path "$raiz\backend\.env")) {
    Write-Warning "Falta backend\.env: copia backend\.env.example como .env y escribe tu contraseña de PostgreSQL."
    exit 1
}
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$raiz\backend'; npm run start:dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$raiz\frontend-angular'; npm start"
Write-Host "API:     http://localhost:3000/api"
Write-Host "Angular: http://localhost:4200  (tarda unos segundos en compilar la primera vez)"
