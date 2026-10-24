// Transcreve Zap: escuta o WhatsApp, transcreve áudios no próprio PC e
// devolve o texto (com resumo quando o áudio é longo).
import fs from 'node:fs'
import path from 'node:path'
import pino from 'pino'
import {
  makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers,
  fetchLatestBaileysVersion, downloadMediaMessage, normalizeMessageContent,
  jidNormalizedUser, isJidGroup, isJidBroadcast, isJidNewsletter, isJidStatusBroadcast
} from 'baileys'
import { carregarConfig, log, PASTA_SESSAO, DADOS } from './config.js'
import { transcrever } from './transcrever.js'
import { resumir, desligarResumo } from './resumir.js'
import { estado, iniciarPainel } from './painel.js'

const config = carregarConfig()
// "log_detalhado": true no config.json grava o log interno do WhatsApp em dados\whatsapp-debug.log.
const logger = config.log_detalhado
  ? pino({ level: 'debug' }, pino.destination(path.join(DADOS, 'whatsapp-debug.log')))
  : pino({ level: 'silent' })

// Um áudio por vez: transcrever e resumir usam bastante CPU.
let fila = Promise.resolve()
const enfileirar = tarefa => { fila = fila.then(tarefa).catch(() => {}) }

const contarPalavras = t => t.split(/\s+/).filter(Boolean).length

function montarTexto ({ remetente, texto, resumo, privado }) {
  const titulo = privado ? `🎙️ *Transcrição do áudio de ${remetente}*` : '🤖 *Transcrição automática do áudio*'
  const partes = [`${titulo}\n${texto}`]
  if (resumo) partes.push(`*Resumo*\n${resumo}`)
  return partes.join('\n\n')
}

async function processarAudio (sock, msg) {
  const chat = msg.key.remoteJid
  const remetente = msg.pushName || (msg.key.remoteJidAlt || chat).split('@')[0]
  const inicio = Date.now()
  log(`Áudio recebido de ${remetente}`)

  const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })
  const texto = await transcrever(buffer, config)
  if (!texto) { log('Transcrição vazia, nada a enviar'); return }

  let resumo = null
  if (config.resumo && contarPalavras(texto) > config.limite_palavras_resumo) {
    try {
      resumo = await resumir(texto, remetente, config)
    } catch (e) {
      log('Falha no resumo, envio só a transcrição:', e.message)
    }
  }

  const privado = config.modo_resposta !== 'conversa'
  const destino = privado ? jidNormalizedUser(sock.user.id) : chat
  const opcoes = privado ? {} : { quoted: msg }
  const enviada = await sock.sendMessage(destino, { text: montarTexto({ remetente, texto, resumo, privado }) }, opcoes)

  estado.transcritos++
  log(`Enviado para ${destino} (id ${enviada?.key?.id}). Transcrito em ${((Date.now() - inicio) / 1000).toFixed(1)}s (${contarPalavras(texto)} palavras${resumo ? ', com resumo' : ''})`)
}

function deveTranscrever (sock, msg) {
  const chat = msg.key.remoteJid
  if (!chat || msg.key.fromMe) return false
  if (isJidBroadcast(chat) || isJidStatusBroadcast(chat) || isJidNewsletter(chat)) return false
  if (isJidGroup(chat) && !config.grupos) return false
  const conteudo = normalizeMessageContent(msg.message)
  if (!conteudo?.audioMessage) return false
  const idadeHoras = (Date.now() / 1000 - Number(msg.messageTimestamp || 0)) / 3600
  return idadeHoras <= config.idade_maxima_horas
}

async function conectar () {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_SESSAO)
  const { version } = await fetchLatestBaileysVersion().catch(() => ({}))

  const sock = makeWASocket({
    auth: state,
    version,
    logger,
    browser: Browsers.windows('Transcreve Zap'),
    markOnlineOnConnect: false,
    syncFullHistory: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      estado.status = 'aguardando_qr'
      estado.qr = qr
    }
    if (connection === 'open') {
      estado.status = 'conectado'
      estado.qr = null
      estado.numero = jidNormalizedUser(sock.user.id).split('@')[0]
      estado.ultimoErro = null
      log(`Conectado como ${estado.numero}`)
    }
    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode
      estado.status = 'desconectado'
      if (codigo === DisconnectReason.loggedOut) {
        log('O WhatsApp desconectou este computador. Apagando a sessão para mostrar um QR novo.')
        fs.rmSync(PASTA_SESSAO, { recursive: true, force: true })
      } else {
        log(`Conexão caiu (código ${codigo ?? '?'}), reconectando...`)
      }
      setTimeout(() => conectar().catch(e => log('Erro ao reconectar:', e.message)), 3000)
    }
  })

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (!deveTranscrever(sock, msg)) continue
      enfileirar(() => processarAudio(sock, msg).catch(e => {
        estado.ultimoErro = e.message
        log('Erro ao transcrever:', e.stack || e.message)
      }))
    }
  })
}

try {
  await iniciarPainel(config.porta_painel)
} catch (e) {
  if (e.code === 'EADDRINUSE') {
    console.log(`O Transcreve Zap já está rodando. Abra http://localhost:${config.porta_painel}`)
    process.exit(0)
  }
  throw e
}
log(`Painel em http://localhost:${config.porta_painel} | modo: ${config.modo_resposta}`)

for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => { desligarResumo(); process.exit(0) })
process.on('exit', desligarResumo)
process.on('unhandledRejection', e => log('Erro não tratado:', e?.stack || e))

await conectar()
