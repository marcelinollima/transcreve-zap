# Instruções para o agente (Claude Code, Codex etc.)

Se a pessoa pediu para **instalar** o Transcreve Zap, siga exatamente estes passos.
Não improvise outra forma de instalar e não altere o código.

1. Confira que é Windows 10 ou 11, 64 bits. Em outro sistema, avise que só Windows é suportado e pare.
2. Na pasta deste repositório, rode:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar.ps1
   ```

   O download tem cerca de 3 GB (modelos de transcrição e de resumo) e pode levar
   alguns minutos. Use um timeout longo (10 min ou mais) ou rode em segundo plano.
   O script não pede administrador e confere o SHA-256 de cada download.
   - Com menos de 8 GB de RAM ele instala sem resumo, sozinho.
   - O padrão é o Whisper `small`. Se o PC for recente e potente (8 núcleos
     ou mais) e a pessoa quiser mais precisão, acrescente `-ModeloMelhor`.
3. No final o script abre `http://localhost:3210` no navegador. Diga à pessoa:
   "Abra o WhatsApp no celular, vá em ⋮ > Dispositivos conectados > Conectar
   dispositivo e aponte para o QR Code que abriu no navegador."
4. Confirme a conexão consultando `http://localhost:3210/estado` até `status`
   virar `conectado` (espere até 2 minutos).
5. Explique em poucas linhas:
   - Os áudios recebidos são transcritos neste PC e o texto chega em
     **"Mensagens para mim"** (conversa com o próprio número). O contato não vê nada.
   - Para responder na própria conversa (o contato vê), mude `modo_resposta`
     para `"conversa"` em `config.json` e reinicie (`parar.ps1` e depois
     `iniciar-oculto.vbs`).
   - O PC precisa estar ligado. O programa inicia junto com o Windows.

## Problemas comuns

- Log em `dados\transcreve-zap.log`.
- "já está rodando": o programa já está aberto; use o painel em `http://localhost:3210`.
- Para reconectar do zero: `parar.ps1`, apague `dados\sessao-whatsapp`, rode `iniciar-oculto.vbs`.
- Para remover: `desinstalar.ps1`.

## Para quem for mexer no código

- Node.js (ESM), entrada em `src/index.js`. WhatsApp via Baileys, transcrição com
  whisper.cpp (`src/transcrever.js`), resumo com llama.cpp (`src/resumir.js`).
- Nada sai do computador além da conexão com o WhatsApp. Não adicione chamadas a
  APIs externas sem deixar isso desligado por padrão e documentado.
