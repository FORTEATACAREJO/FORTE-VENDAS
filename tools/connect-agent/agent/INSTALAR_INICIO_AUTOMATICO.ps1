# Run as the same Windows user who paired the device; no administrator required.
param([ValidateSet('fiscal_xml','vendas')][string]$Modo)
$ErrorActionPreference='Stop'
if (!$Modo) { $Modo=Read-Host 'Digite fiscal_xml ou vendas'; if ($Modo -notin @('fiscal_xml','vendas')) { throw 'Modo inválido' } }
$Python=& py -3 -c "import sys; print(sys.executable)"
if ($LASTEXITCODE -ne 0) { throw 'Instale Python 3.11 ou superior.' }
$Agent=Join-Path $PSScriptRoot 'connect_agent.py'
$Config=Join-Path $env:LOCALAPPDATA "ForteConnect\$Modo.json"
if (!(Test-Path $Config)) { throw 'Execute CONFIGURAR antes.' }
$Action=New-ScheduledTaskAction -Execute $Python -Argument "`"$Agent`" --config `"$Config`" --watch" -WorkingDirectory $PSScriptRoot
$Trigger=New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$Settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "ForteConnect-$Modo" -Action $Action -Trigger $Trigger -Settings $Settings -Description 'Cópia de XML/CSV para espelhamento Forte. Não altera Connect.' -Force | Out-Null
Write-Host 'Início automático cadastrado para este usuário. Mantenha a pasta do agente neste local.'
