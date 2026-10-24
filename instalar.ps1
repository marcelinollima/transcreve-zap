# Instalador do Transcreve Zap (Windows 10/11, 64 bits).
# Não precisa de administrador: tudo fica dentro desta pasta.
# Uso: powershell -ExecutionPolicy Bypass -File instalar.ps1 [-SemResumo] [-ModeloMelhor] [-NaoIniciar]

param(
    [switch]$SemResumo,     # não baixa o modelo de resumo (economiza ~2 GB e memória)
    [switch]$ModeloMelhor,  # usa o Whisper "large-v3-turbo": erra menos, mas é ~3x mais lento que o "small"
    [switch]$NaoIniciar     # só instala, não abre o programa no final
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Aberto a partir do PowerShell 7, o 5.1 herda o PSModulePath do 7 e carrega
# módulos incompatíveis. Volta para os caminhos do próprio Windows PowerShell.
if ($PSVersionTable.PSVersion.Major -lt 6) {
    $env:PSModulePath = @(
        (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'WindowsPowerShell\Modules'),
        (Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules'),
        (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules')
    ) -join ';'
}
$Raiz = $PSScriptRoot
Set-Location $Raiz

# Trava: só uma instalação por vez. Rodar duas juntas corrompe as bibliotecas.
$Dados = Join-Path $Raiz 'dados'
New-Item -ItemType Directory -Force $Dados | Out-Null
$Trava = Join-Path $Dados 'instalando.lock'
$Progresso = Join-Path $Dados 'instalacao.txt'
if (Test-Path $Trava) {
    $outro = (Get-Content $Trava -Raw).Trim()
    if ($outro -and (Get-Process -Id $outro -ErrorAction SilentlyContinue)) {
        Write-Host "Já existe uma instalação em andamento (processo $outro)." -ForegroundColor Yellow
        Write-Host "Acompanhe em $Progresso. Não rode o instalador de novo enquanto ela não terminar."
        exit 2
    }
}
Set-Content $Trava $PID

function Progresso($texto) {
    Set-Content $Progresso "$texto`r`n(atualizado em $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss'))" -Encoding UTF8
}

# Versões fixas, conferidas pelo SHA-256. Atualizar aqui quando mudar.
$Downloads = @{
    node    = @{ url = 'https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip'; sha = 'D2046D28C2C3DCD211AC5145C0BF30E2047EF9DFB306693C8C6E2ECCD8B95FA5' }
    whisper = @{ url = 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-blas-bin-x64.zip'; sha = 'B1158BD10EDF92C9799149A6FC5D3E58DA3F495241D6FB3423088130E88FFBF3' }
    llama   = @{ url = 'https://github.com/ggml-org/llama.cpp/releases/download/b11868/llama-b11868-bin-win-cpu-x64.zip'; sha = '3907B9548A1A5EE9BBD86DC26E1FF7EFEB71B2187A0F43C6F21FDB411F5FD8D4' }
    turbo   = @{ url = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin'; sha = '394221709CD5AD1F40C46E6031CA61BCE88931E6E088C188294C6D5A55FFA7E2'; arquivo = 'ggml-large-v3-turbo-q5_0.bin' }
    small   = @{ url = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'; sha = '1BE3A9B2063867B937E64E2EC7483364A79917E157FA98C5D94B5C1FFFEA987B'; arquivo = 'ggml-small.bin' }
    qwen    = @{ url = 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf'; sha = '626B4A6678B86442240E33DF819E00132D3BA7DDDFE1CDC4FBB18E0A9615C62D'; arquivo = 'qwen2.5-3b-instruct-q4_k_m.gguf' }
}

function Passo($texto) {
    Write-Host "`n==> $texto" -ForegroundColor Cyan
    Progresso "EM ANDAMENTO: $texto"
}

# SHA-256 pelo .NET: o Get-FileHash às vezes não carrega quando o PowerShell 5.1
# é aberto a partir do PowerShell 7 (caso comum com agentes).
function HashSha256($arquivo) {
    $sha = [Security.Cryptography.SHA256]::Create()
    $fluxo = [IO.File]::OpenRead($arquivo)
    try { return ([BitConverter]::ToString($sha.ComputeHash($fluxo))).Replace('-', '') }
    finally { $fluxo.Dispose(); $sha.Dispose() }
}

function Baixar($item, $destino) {
    if (Test-Path $destino) {
        if ((HashSha256 $destino) -eq $item.sha) { Write-Host "    já baixado"; return }
        Remove-Item $destino -Force
    }
    Write-Host "    baixando $($item.url)"
    Progresso "EM ANDAMENTO: baixando $(Split-Path $destino -Leaf) (o arquivo parcial cresce em $destino.parcial)"
    & curl.exe -L --fail --retry 3 --progress-bar -o "$destino.parcial" $item.url
    if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar $($item.url)" }
    $hash = HashSha256 "$destino.parcial"
    if ($hash -ne $item.sha) {
        Remove-Item "$destino.parcial" -Force
        throw "O arquivo baixado de $($item.url) não confere (SHA-256 $hash). Instalação interrompida por segurança."
    }
    Move-Item "$destino.parcial" $destino -Force
}

# Extrai um zip e copia para $pasta a subpasta que contém $exe.
function Extrair($zip, $pasta, $exe) {
    if (Test-Path (Join-Path $pasta $exe)) { Write-Host "    já extraído"; return }
    $tmp = Join-Path $env:TEMP ("tz-" + [guid]::NewGuid())
    Expand-Archive $zip -DestinationPath $tmp -Force
    $achado = Get-ChildItem $tmp -Recurse -Filter $exe | Select-Object -First 1
    if (-not $achado) { throw "$exe não encontrado dentro de $zip" }
    New-Item -ItemType Directory -Force $pasta | Out-Null
    Copy-Item (Join-Path $achado.DirectoryName '*') $pasta -Recurse -Force
    Remove-Item $tmp -Recurse -Force
}

try {

Passo 'Conferindo o computador'
if (-not [Environment]::Is64BitOperatingSystem) { throw 'O Transcreve Zap precisa de Windows 64 bits.' }
$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
$livreGB = [math]::Round((Get-PSDrive ($Raiz.Substring(0,1))).Free / 1GB)
Write-Host "    memória: $ramGB GB | espaço livre: $livreGB GB"
if ($livreGB -lt 5) { throw 'São necessários pelo menos 5 GB livres no disco.' }
if ($ramGB -lt 8 -and -not $SemResumo) {
    Write-Host '    Menos de 8 GB de memória: instalando sem o resumo (só transcrição).' -ForegroundColor Yellow
    $SemResumo = $true
}

$Baixados = Join-Path $Raiz 'ferramentas\downloads'
$Modelos = Join-Path $Raiz 'modelos'
New-Item -ItemType Directory -Force $Baixados, $Modelos | Out-Null

Passo 'Node.js (portátil, só para este programa)'
Baixar $Downloads.node (Join-Path $Baixados 'node.zip')
Extrair (Join-Path $Baixados 'node.zip') (Join-Path $Raiz 'ferramentas\node') 'node.exe'
$Node = Join-Path $Raiz 'ferramentas\node\node.exe'
$Npm = Join-Path $Raiz 'ferramentas\node\npm.cmd'

Passo 'Bibliotecas do programa'
# Se o programa já estiver aberto (reinstalação), ele prende arquivos e o npm falha.
& (Join-Path $Raiz 'parar.ps1') | Out-Null
$env:Path = (Join-Path $Raiz 'ferramentas\node') + ';' + $env:Path
& $Npm ci --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as bibliotecas (npm ci).' }

Passo 'Whisper (transcrição local)'
Baixar $Downloads.whisper (Join-Path $Baixados 'whisper.zip')
Extrair (Join-Path $Baixados 'whisper.zip') (Join-Path $Raiz 'ferramentas\whisper') 'whisper-cli.exe'
$modeloWhisper = if ($ModeloMelhor) { $Downloads.turbo } else { $Downloads.small }
Write-Host "    modelo: $($modeloWhisper.arquivo)"
Baixar $modeloWhisper (Join-Path $Modelos $modeloWhisper.arquivo)

if (-not $SemResumo) {
    Passo 'Modelo de resumo (local, ~2 GB)'
    Baixar $Downloads.llama (Join-Path $Baixados 'llama.zip')
    Extrair (Join-Path $Baixados 'llama.zip') (Join-Path $Raiz 'ferramentas\llama') 'llama-server.exe'
    Baixar $Downloads.qwen (Join-Path $Modelos $Downloads.qwen.arquivo)
}

Passo 'Configuração'
$arqConfig = Join-Path $Raiz 'config.json'
if (Test-Path $arqConfig) {
    $cfg = Get-Content $arqConfig -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
    $cfg = Get-Content (Join-Path $Raiz 'config.exemplo.json') -Raw -Encoding UTF8 | ConvertFrom-Json
}
$cfg.modelo_whisper = $modeloWhisper.arquivo
$cfg.resumo = -not $SemResumo
[IO.File]::WriteAllText($arqConfig, ($cfg | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
Write-Host "    $arqConfig"

Passo 'Iniciar junto com o Windows'
$inicializar = [Environment]::GetFolderPath('Startup')
$atalho = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $inicializar 'Transcreve Zap.lnk'))
$atalho.TargetPath = 'wscript.exe'
$atalho.Arguments = '"' + (Join-Path $Raiz 'iniciar-oculto.vbs') + '"'
$atalho.WorkingDirectory = $Raiz
$atalho.Save()
Write-Host '    atalho criado na pasta Inicializar do usuário'

Remove-Item $Baixados -Recurse -Force

$painel = "http://localhost:$($cfg.porta_painel)"
if ($NaoIniciar) {
    Progresso "PRONTO: instalado, mas não iniciado (-NaoIniciar). Para abrir: iniciar-oculto.vbs"
    Write-Host "`nInstalado. Para abrir, dê dois cliques em iniciar-oculto.vbs." -ForegroundColor Green
} else {

Passo 'Abrindo o programa'
Start-Process wscript.exe -ArgumentList ('"' + (Join-Path $Raiz 'iniciar-oculto.vbs') + '"') -WorkingDirectory $Raiz
# Só diz "pronto" depois que o painel responder de verdade.
$estado = $null
for ($i = 0; $i -lt 60 -and -not $estado; $i++) {
    Start-Sleep -Seconds 1
    try { $estado = Invoke-RestMethod "http://127.0.0.1:$($cfg.porta_painel)/estado" -TimeoutSec 2 } catch {}
}
if (-not $estado) {
    $log = Join-Path $Dados 'transcreve-zap.log'
    $fim = if (Test-Path $log) { (Get-Content $log -Tail 15) -join "`n" } else { '(sem log)' }
    throw "O programa não abriu. Últimas linhas do log:`n$fim"
}
Start-Process $painel

Progresso "PRONTO: programa rodando. Painel em $painel (status: $($estado.status))"
Write-Host "`nPronto! Abra $painel e escaneie o QR Code com o WhatsApp do celular." -ForegroundColor Green
}

} catch {
    Progresso "ERRO: $($_.Exception.Message)"
    throw
} finally {
    Remove-Item $Trava -Force -ErrorAction SilentlyContinue
}
