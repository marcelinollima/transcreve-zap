// Servidor de resumo do Transcreve Zap (roda na VPS).
// Recebe o TEXTO já transcrito no PC do usuário e devolve o resumo, usando um
// llama-server local. Só resume: não aceita prompt livre, não grava o texto.
//
// Variáveis de ambiente:
//   PORTA          porta HTTP (padrão 3220)
//   LLAMA_URL      llama-server compatível com OpenAI (padrão http://127.0.0.1:8080)
//   LIMITE_ID      resumos por hora por instalação (padrão 60)
//   LIMITE_IP      resumos por hora por IP (padrão 200)
//   BLOQUEADOS     ids de instalação bloqueados, separados por vírgula
//   CONFIAR_PROXY  "1" se estiver atrás de nginx/caddy (usa X-Forwarded-For)
import http from 'node:http'
import { mensagensResumo } from '../src/prompt-resumo.js'

const PORTA = Number(process.env.PORTA || 3220)
const LLAMA_URL = (process.env.LLAMA_URL || 'http://127.0.0.1:8080').replace(/\/$/, '')
const LIMITE_ID = Number(process.env.LIMITE_ID || 60)
const LIMITE_IP = Number(process.env.LIMITE_IP || 200)
const BLOQUEADOS = new Set((process.env.BLOQUEADOS || '').split(',').map(s => s.trim()).filter(Boolean))
const CONFIAR_PROXY = process.env.CONFIAR_PROXY === '1'

const MAX_CORPO = 32 * 1024
const MAX_TEXTO = 12000
const MAX_NA_FILA = 20
const HORA = 3600_000

const log = (...partes) => console.log(`[${new Date().toISOString()}]`, ...partes)

// Janela de uma hora por chave (id ou IP), em memória.
const usos = new Map()
function estourou (chave, limite) {
  const agora = Date.now()
  const lista = (usos.get(chave) || []).filter(t => agora - t < HORA)
  if (lista.length >= limite) { usos.set(chave, lista); return true }
  lista.push(agora)
  usos.set(chave, lista)
  return false
}
setInterval(() => {
  const agora = Date.now()
  for (const [chave, lista] of usos) if (!lista.some(t => agora - t < HORA)) usos.delete(chave)
}, 10 * 60_000).unref()

let naFila = 0

async function resumir (texto, remetente) {
  const r = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ temperature: 0.2, max_tokens: 200, messages: mensagensResumo(texto, remetente) }),
    signal: AbortSignal.timeout(120_000)
  })
  if (!r.ok) throw new Error(`llama respondeu ${r.status}`)
  const j = await r.json()
  return (j.choices?.[0]?.message?.content || '').trim()
}

function lerCorpo (req) {
  return new Promise((resolve, reject) => {
    let tamanho = 0
    const partes = []
    req.on('data', p => {
      tamanho += p.length
      if (tamanho > MAX_CORPO) { reject(Object.assign(new Error('corpo grande demais'), { status: 413 })); req.destroy() } else partes.push(p)
    })
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')))
    req.on('error', reject)
  })
}

function responder (res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

const ID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const servidor = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/saude') return responder(res, 200, { ok: true })
  if (req.method !== 'POST' || req.url !== '/resumir') return responder(res, 404, { erro: 'não encontrado' })

  const id = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  const ip = (CONFIAR_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress
  if (!ID_VALIDO.test(id)) return responder(res, 401, { erro: 'id de instalação inválido' })
  if (BLOQUEADOS.has(id)) return responder(res, 403, { erro: 'instalação bloqueada' })

  let dados
  try {
    dados = JSON.parse(await lerCorpo(req))
  } catch (e) {
    return responder(res, e.status || 400, { erro: e.status ? e.message : 'JSON inválido' })
  }
  const texto = typeof dados.texto === 'string' ? dados.texto.trim() : ''
  const remetente = typeof dados.remetente === 'string' ? dados.remetente.trim().slice(0, 80) : ''
  if (!texto || texto.length > MAX_TEXTO) return responder(res, 400, { erro: `texto vazio ou maior que ${MAX_TEXTO} caracteres` })

  if (estourou(`id:${id}`, LIMITE_ID) || estourou(`ip:${ip}`, LIMITE_IP)) {
    return responder(res, 429, { erro: 'limite de resumos por hora atingido' })
  }
  if (naFila >= MAX_NA_FILA) return responder(res, 503, { erro: 'servidor ocupado, tente depois' })

  naFila++
  const inicio = Date.now()
  try {
    const resumo = await resumir(texto, remetente || 'contato')
    // Nunca registrar o texto nem o resumo: só o tamanho e o tempo.
    log(`resumo ok id=${id.slice(0, 8)} ip=${ip} chars=${texto.length} ${Date.now() - inicio}ms`)
    responder(res, 200, { resumo })
  } catch (e) {
    log(`resumo falhou id=${id.slice(0, 8)} ip=${ip}: ${e.message}`)
    responder(res, 502, { erro: 'falha ao gerar o resumo' })
  } finally {
    naFila--
  }
})

servidor.listen(PORTA, () => log(`Servidor de resumo na porta ${PORTA}, llama em ${LLAMA_URL}`))
