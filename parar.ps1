# Para o Transcreve Zap (e o modelo de resumo, se estiver rodando).
$Raiz = $PSScriptRoot
Get-CimInstance Win32_Process |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Raiz, [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object {
        # O modelo de resumo pode fechar sozinho junto com o programa; por isso o SilentlyContinue.
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "Parado: $($_.Name) ($($_.ProcessId))"
    }
