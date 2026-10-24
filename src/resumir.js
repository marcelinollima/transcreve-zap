// Resumo com um modelo pequeno rodando no próprio PC (llama.cpp).
// O servidor do modelo só sobe quando chega o primeiro áudio longo e
// desliga sozinho depois de um tempo parado, para não segurar memória à toa.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { LLAMA_EXE, PASTA_MODELOS, log } from './config.js'

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

export async function resumir (texto, remetente, config) {
  await garantirServidor(config)
  try {
    const r = await fetch(`http://127.0.0.1:${PORTA}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        temperature: 0.2,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: 'Você resume, para o dono do celular, áudios de WhatsApp que outras pessoas mandaram para ele. ' +
              'Escreva em português do Brasil, na terceira pessoa, começando pelo nome de quem mandou o áudio. ' +
              'Use de 1 a 3 frases curtas com o que a pessoa avisou ou pediu. ' +
              'Mantenha nomes, datas, horários e valores. Não cumprimente, não responda ao áudio, não invente nada, não use listas.\n\n' +
              'Exemplo de áudio de Carlos: "Fala, beleza? Seguinte, não vou conseguir ir amanhã, meu carro quebrou. Vê se dá pra remarcar pra quinta de manhã."\n' +
              'Exemplo de resumo: Carlos não vai conseguir ir amanhã porque o carro quebrou e pede para remarcar para quinta de manhã.'
          },
          { role: 'user', content: `Áudio de ${remetente}: "${texto}"\n\nResumo:` }
        ]
      })
    })
    if (!r.ok) throw new Error(`modelo de resumo respondeu ${r.status}`)
    const j = await r.json()
    return (j.choices?.[0]?.message?.content || '').trim()
  } finally {
    agendarDesligamento()
  }
}
