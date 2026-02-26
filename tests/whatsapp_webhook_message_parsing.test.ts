import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractInboundMessageContent,
  resolveExplicitInboundPhoneCandidate,
  resolveInboundMessageNodeAndType,
  shouldSkipLidMessageWithoutPhone,
} from '../supabase/functions/_shared/whatsappWebhookMessageParsing.ts'

test('ignora payload de ack/status sem conteudo de mensagem', () => {
  const msg = {
    key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: true, id: 'ack_1' },
    status: 'DELIVERY_ACK',
  }

  assert.equal(resolveInboundMessageNodeAndType(msg).msgType, null)
  assert.equal(extractInboundMessageContent(msg), null)
})

test('ignora mensagens de sistema que antes viravam placeholder', () => {
  const msg = {
    messageType: 'senderKeyDistributionMessage',
    message: {
      senderKeyDistributionMessage: {
        groupId: 'ignored',
      },
    },
  }

  assert.equal(resolveInboundMessageNodeAndType(msg).msgType, 'senderKeyDistributionMessage')
  assert.equal(extractInboundMessageContent(msg), null)
})

test('desempacota wrappers (ephemeral/viewOnce/deviceSent) e preserva conteudo real', () => {
  const ephemeral = {
    message: {
      ephemeralMessage: {
        message: {
          conversation: 'Oi, tenho interesse',
        },
      },
    },
  }

  const viewOnce = {
    message: {
      viewOnceMessageV2: {
        message: {
          imageMessage: {
            caption: 'Foto do telhado',
          },
        },
      },
    },
  }

  const deviceSent = {
    message: {
      deviceSentMessage: {
        message: {
          extendedTextMessage: {
            text: 'Mensagem enviada por outro dispositivo',
          },
        },
      },
    },
  }

  assert.equal(resolveInboundMessageNodeAndType(ephemeral).msgType, 'conversation')
  assert.equal(extractInboundMessageContent(ephemeral), 'Oi, tenho interesse')
  assert.equal(resolveInboundMessageNodeAndType(viewOnce).msgType, 'imageMessage')
  assert.equal(extractInboundMessageContent(viewOnce), 'Foto do telhado')
  assert.equal(resolveInboundMessageNodeAndType(deviceSent).msgType, 'extendedTextMessage')
  assert.equal(extractInboundMessageContent(deviceSent), 'Mensagem enviada por outro dispositivo')
})

test('bloqueia JID @lid sem numero explicito e aceita quando numero existe', () => {
  const msgSemNumero = {
    key: { remoteJid: '243765264568524@lid', fromMe: false, id: 'lid_1' },
    message: {
      protocolMessage: { type: 0 },
    },
  }

  assert.equal(
    shouldSkipLidMessageWithoutPhone('243765264568524@lid', msgSemNumero, msgSemNumero, { data: msgSemNumero }),
    true,
  )

  const msgComNumero = {
    key: { remoteJid: '243765264568524@lid', fromMe: false, id: 'lid_2' },
    number: '+55 (11) 99999-0000',
    message: {
      conversation: 'Oi',
    },
  }

  assert.equal(resolveExplicitInboundPhoneCandidate(msgComNumero, msgComNumero, { data: msgComNumero }), '5511999990000')
  assert.equal(
    shouldSkipLidMessageWithoutPhone('243765264568524@lid', msgComNumero, msgComNumero, { data: msgComNumero }),
    false,
  )
})

test('resolve telefone explicito a partir de remoteJidAlt e nao usa sender da instancia', () => {
  const payload = {
    sender: '5514991436026@s.whatsapp.net', // numero da instancia (nao do contato)
    data: {
      key: {
        remoteJid: '243765264568524@lid',
        remoteJidAlt: '5514991402780@s.whatsapp.net',
      },
    },
  }

  const msg = {
    key: payload.data.key,
  }

  assert.equal(
    resolveExplicitInboundPhoneCandidate(msg, payload.data, payload),
    '5514991402780',
  )
})

test('nao considera participant @lid como telefone explicito valido', () => {
  const payload = {
    data: {
      key: { remoteJid: '243765264568524@lid' },
      participant: '243765264568524@lid',
    },
  }

  const msg = {
    key: payload.data.key,
    participant: payload.data.participant,
  }

  assert.equal(resolveExplicitInboundPhoneCandidate(msg, payload.data, payload), null)
  assert.equal(shouldSkipLidMessageWithoutPhone('243765264568524@lid', msg, payload.data, payload), true)
})
