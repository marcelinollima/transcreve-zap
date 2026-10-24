// Página local (só neste PC) que mostra o QR Code e o estado da conexão.
import http from 'node:http'
import QRCode from 'qrcode'

export const estado = {
  status: 'iniciando', // iniciando | aguardando_qr | conectado | desconectado
  qr: null,
  numero: null,
  transcritos: 0,
  ultimoErro: null
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

async function pagina () {
  let corpo
  if (estado.status === 'aguardando_qr' && estado.qr) {
    const img = await QRCode.toDataURL(estado.qr, { margin: 2, width: 320 })
    corpo = `<h2>Conecte seu WhatsApp</h2>
      <ol><li>Abra o WhatsApp no celular</li>
      <li>Toque em <b>⋮ &gt; Dispositivos conectados &gt; Conectar dispositivo</b></li>
      <li>Aponte a câmera para o código abaixo</li></ol>
      <img src="${img}" alt="QR Code" width="320" height="320">
      <p class="dica">O código muda a cada 20 segundos; a página atualiza sozinha.</p>`
  } else if (estado.status === 'conectado') {
    corpo = `<h2 class="ok">✅ Conectado</h2>
      <p>Número: <b>${esc(estado.numero || '')}</b></p>
      <p>Áudios transcritos desde que o programa abriu: <b>${estado.transcritos}</b></p>
      <p class="dica">Pode fechar esta página. O programa continua rodando em segundo plano
      e volta sozinho quando o computador ligar.</p>`
  } else {
    corpo = `<h2>${estado.status === 'desconectado' ? 'Reconectando...' : 'Iniciando...'}</h2>
      <p class="dica">Aguarde alguns segundos.</p>`
  }
  const erro = estado.ultimoErro ? `<p class="erro">Último erro: ${esc(estado.ultimoErro)}</p>` : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3"><title>Transcreve Zap</title>
<style>
 body{font-family:system-ui,Segoe UI,sans-serif;background:#f4f6f5;color:#1b1f1d;margin:0;display:flex;justify-content:center}
 main{background:#fff;margin:32px 16px;padding:24px 32px;border-radius:12px;max-width:480px;box-shadow:0 1px 4px #0002}
 h1{font-size:20px;margin:0 0 8px} h2{font-size:18px} .ok{color:#128c4b} .dica{color:#5b6460;font-size:14px}
 .erro{color:#b3261e;font-size:13px} img{display:block;margin:8px auto}
</style></head><body><main><h1>🎙️ Transcreve Zap</h1>${corpo}${erro}</main></body></html>`
}

export function iniciarPainel (porta) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(async (req, res) => {
      if (req.url === '/estado') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ ...estado, qr: Boolean(estado.qr) }))
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(await pagina())
    })
    srv.once('error', reject)
    srv.listen(porta, '127.0.0.1', () => resolve(srv))
  })
}
