# 🎙️ Transcreve Zap

Transcreve os áudios que você recebe no WhatsApp e, quando o áudio é longo,
manda também um resumo. Tudo roda **no seu computador**: o áudio não vai para
nenhum servidor, não precisa de conta em serviço de IA nem de VPS.

A transcrição chega na própria conversa, respondendo ao áudio. Quem mandou o
áudio também vê, e muita gente acha bom: é assim que os amigos descobrem que
dá para fazer isso. Se preferir que só você veja, dá para mandar tudo para
**"Mensagens para mim"** (veja `modo_resposta` abaixo).

```
🤖 Transcrição automática do áudio
Oi, tudo bem? Então, deixa eu te falar, aquela reunião de sexta...

Resumo
Ana avisa que a reunião de sexta passou para as 15h e pede que você leve o contrato impresso.
```

## Requisitos

- Windows 10 ou 11, 64 bits
- 5 GB livres no disco
- 8 GB de memória para ter o resumo (com menos, instala só a transcrição)
- O computador ligado: os áudios são transcritos enquanto ele está ligado

## Instalar

### Com Claude Code ou Codex

Abra o Claude Code (ou o Codex) e peça:

> Clona https://github.com/marcelinollima/transcreve-zap e instala para mim.

O agente segue o [AGENTS.md](AGENTS.md). No final abre uma página com um QR Code:
no celular, vá em **⋮ > Dispositivos conectados > Conectar dispositivo** e aponte
para ele.

### Sem agente

1. Baixe o repositório (botão **Code > Download ZIP**) e extraia numa pasta, por exemplo `C:\TranscreveZap`.
2. Dê dois cliques em `instalar.cmd`.
3. Quando abrir o navegador, escaneie o QR Code com o WhatsApp.

A instalação baixa cerca de 3 GB (os modelos de IA) e não pede administrador.
Cada download tem o SHA-256 conferido.

## Configurar

Edite `config.json` e reinicie o programa (`parar.ps1`, depois `iniciar-oculto.vbs`).

| Opção | Padrão | O que faz |
|---|---|---|
| `modo_resposta` | `"conversa"` | `"conversa"` responde no chat, citando o áudio (o contato vê); `"privado"` manda para "Mensagens para mim" |
| `grupos` | `false` | Transcrever áudios de grupos |
| `limite_palavras_resumo` | `10` | Só resume quando a transcrição passa disso |
| `resumo` | `true` | Liga/desliga o resumo |
| `idade_maxima_horas` | `12` | Ignora áudios mais antigos que isso (ex.: chegaram com o PC desligado) |
| `porta_painel` | `3210` | Porta da página local `http://localhost:3210` |

## Como funciona

- **WhatsApp:** [Baileys](https://github.com/WhiskeySockets/Baileys), conectado
  como um dispositivo a mais, igual ao WhatsApp Web.
- **Transcrição:** [whisper.cpp](https://github.com/ggml-org/whisper.cpp) com o
  modelo `small`. Em PC potente, instale com `instalar.cmd -ModeloMelhor` para
  usar o `large-v3-turbo`, que erra menos e é cerca de 3x mais lento.
- **Resumo:** [llama.cpp](https://github.com/ggml-org/llama.cpp) com o
  Qwen2.5 3B. Ele só sobe quando chega um áudio longo e desliga sozinho depois
  de 10 minutos parado.

A sessão do WhatsApp fica em `dados\sessao-whatsapp`. Quem tiver essa pasta
consegue ler suas mensagens, então não compartilhe.

## ⚠️ Aviso

O Baileys não é uma API oficial do WhatsApp. O uso vai contra os termos de
serviço do WhatsApp e existe risco de o número ser bloqueado. Este programa só
lê áudios e responde a eles, sem disparar mensagens para ninguém, o que reduz
o risco, mas não o elimina. Use por sua conta.

Os áudios são de outras pessoas. Tudo fica no seu computador, mas use com bom senso.

## Desinstalar

Rode `desinstalar.ps1` e, no celular, remova "Transcreve Zap" em Dispositivos
conectados. Depois apague a pasta.

## Licença

MIT
