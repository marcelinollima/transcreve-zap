# Remove o Transcreve Zap: para o programa, tira da inicialização e apaga a sessão do WhatsApp.
# A pasta do programa fica; apague-a à mão depois, se quiser.
$Raiz = $PSScriptRoot
& (Join-Path $Raiz 'parar.ps1')
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'Transcreve Zap.lnk') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $Raiz 'dados') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Desinstalado. No celular, remova "Transcreve Zap" em Dispositivos conectados.'
Write-Host "Para apagar tudo, exclua a pasta $Raiz"
