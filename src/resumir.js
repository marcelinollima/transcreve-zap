// Resumo da transcrição. Dois jeitos (config "resumo_onde"):
// - "servidor": manda só o texto para o servidor de resumo (servidor/servidor.js).
//   O áudio e a sessão do WhatsApp nunca saem do PC.
// - "local": modelo pequeno rodando no próprio PC (llama.cpp). O servidor do
//   modelo só sobe quando chega o primeiro áudio longo e desliga sozinho depois
//   de um tempo parado, para não segurar memória à toa.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { LLAMA_EXE, PASTA_MODELOS, ARQ_ID_INSTALACAO, log } from './config.js'
import { prioridadeBaixa } from './transcrever.js'
import { mensagensResumo } from './prompt-resumo.js'

const PORTA = 3211
const DESLIGAR_APOS_MS = 10 * 60 * 1000

let processo = null
let subindo = null
let timerOcioso = null

async function pronto () {
  try {
    const r = await fetch(`http://127.0.0.1:${PORTA}/health`)
    return r.ok
  } catch { return false }
}

async function garantirServidor (config) {
  if (processo && await pronto()) return
  if (subindo) return subindo
  subindo = (async () => {
    const modelo = path.join(PASTA_MODELOS, config.modelo_resumo)
    if (!fs.existsSync(modelo)) throw new Error(`modelo de resumo não encontrado: ${modelo}`)
    log('Subindo o modelo de resumo...')
    processo = spawn(LLAMA_EXE, [
      '-m', modelo, '--host', '127.0.0.1', '--port', String(PORTA),
      '-c', '4096', '-t', String(config.threads), '--no-webui'
    ], { windowsHide: true, stdio: 'ignore' })
    prioridadeBaixa(processo.pid)
    processo.on('exit', () => { processo = null })
    const limite = Date.now() + 180_000
    while (Date.now() < limite) {
      if (!processo) throw new Error('o modelo de resumo fechou ao subir')
      if (await pronto()) return
      await new Promise(r => setTimeout(r, 1000))
    }
    throw new Error('o modelo de resumo demorou demais para subir')
  })()
  try { await subindo } finally { subindo = null }
}

function agendarDesligamento () {
  clearTimeout(timerOcioso)
  timerOcioso = setTimeout(desligarResumo, DESLIGAR_APOS_MS)
}

export function desligarResumo () {
  clearTimeout(timerOcioso)
  if (processo) { processo.kill(); processo = null }
}

async function resumirLocal (texto, remetente, config) {
  await garantirServidor(config)
  try {
    const r = await fetch(`http://127.0.0.1:${PORTA}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature: 0.2, max_tokens: 200, messages: mensagensResumo(texto, remetente) })
    })
    if (!r.ok) throw new Error(`modelo de resumo respondeu ${r.status}`)
    const j = await r.json()
    return (j.choices?.[0]?.message?.content || '').trim()
  } finally {
    agendarDesligamento()
  }
}

// Id aleatório desta instalação, para o servidor limitar o uso por PC.
// Não identifica a pessoa nem o número de WhatsApp.
function idInstalacao () {
  try { return fs.readFileSync(ARQ_ID_INSTALACAO, 'utf8').trim() } catch {}
  const id = crypto.randomUUID()
  fs.writeFileSync(ARQ_ID_INSTALACAO, id)
  return id
}

async function resumirNoServidor (texto, remetente, config) {
  if (!config.servidor_resumo) throw new Error('servidor_resumo não configurado no config.json')
  const r = await fetch(`${config.servidor_resumo.replace(/\/$/, '')}/resumir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idInstalacao()}` },
    body: JSON.stringify({ texto, remetente }),
    signal: AbortSignal.timeout(90_000)
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`servidor de resumo respondeu ${r.status}${j.erro ? ` (${j.erro})` : ''}`)
  return (j.resumo || '').trim()
}

export function resumir (texto, remetente, config) {
  return config.resumo_onde === 'local'
    ? resumirLocal(texto, remetente, config)
    : resumirNoServidor(texto, remetente, config)
}
