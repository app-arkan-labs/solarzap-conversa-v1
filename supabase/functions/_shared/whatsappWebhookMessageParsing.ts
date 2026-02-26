type AnyRecord = Record<string, any>

function isObject(value: unknown): value is AnyRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? value : null
}

function firstObjectKey(value: unknown): string | null {
  if (!isObject(value)) return null
  const keys = Object.keys(value)
  return keys.length > 0 ? keys[0] : null
}

function normalizedMessageType(rawType: unknown, messageNode: unknown): string | null {
  const fromField = nonEmptyString(rawType)
  if (fromField && fromField.toLowerCase() !== 'unknown') return fromField
  return firstObjectKey(messageNode)
}

function extractInnerWrapperMessage(wrapperType: string, messageNode: AnyRecord): AnyRecord | null {
  switch (wrapperType) {
    case 'ephemeralMessage':
      return isObject(messageNode.ephemeralMessage?.message) ? messageNode.ephemeralMessage.message : null
    case 'viewOnceMessage':
    case 'viewOnceMessageV2':
    case 'viewOnceMessageV2Extension':
      return isObject(messageNode[wrapperType]?.message) ? messageNode[wrapperType].message : null
    case 'deviceSentMessage':
      return isObject(messageNode.deviceSentMessage?.message) ? messageNode.deviceSentMessage.message : null
    case 'documentWithCaptionMessage':
      return isObject(messageNode.documentWithCaptionMessage?.message) ? messageNode.documentWithCaptionMessage.message : null
    default:
      return null
  }
}

const WRAPPER_MESSAGE_TYPES = new Set([
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'deviceSentMessage',
  'documentWithCaptionMessage'
])

const SKIP_MESSAGE_TYPES = new Set([
  'protocolMessage',
  'senderKeyDistributionMessage',
  'messageContextInfo',
  'historySyncNotification',
  'appStateSyncKeyShare',
  'appStateSyncKeyRequest',
  'pollUpdateMessage',
  'keepInChatMessage',
  'pinInChatMessage',
  'encReactionMessage',
  'botInvokeMessage'
])

export function resolveInboundMessageNodeAndType(msg: any): { messageNode: AnyRecord; msgType: string | null } {
  let messageNode: AnyRecord = isObject(msg?.message) ? msg.message : {}
  let msgType = normalizedMessageType(msg?.messageType ?? msg?.type, messageNode)

  for (let depth = 0; depth < 6; depth++) {
    if (!msgType || !WRAPPER_MESSAGE_TYPES.has(msgType) || !isObject(messageNode)) break
    const inner = extractInnerWrapperMessage(msgType, messageNode)
    if (!inner) break
    messageNode = inner
    msgType = firstObjectKey(messageNode)
  }

  return { messageNode, msgType }
}

export function extractInboundMessageContent(msg: any): string | null {
  const { messageNode, msgType } = resolveInboundMessageNodeAndType(msg)
  const m = messageNode

  if (!msgType) return null
  if (SKIP_MESSAGE_TYPES.has(msgType)) return null

  if (msgType === 'reactionMessage') return null

  if (msgType === 'conversation') {
    return nonEmptyString(m.conversation)
  }

  if (msgType === 'extendedTextMessage') {
    return nonEmptyString(m.extendedTextMessage?.text)
  }

  if (msgType === 'audioMessage') {
    const seconds = Number(m.audioMessage?.seconds || 0)
    return seconds > 0 ? `Audio recebido (${seconds}s)` : 'Audio recebido'
  }

  if (msgType === 'imageMessage') {
    return nonEmptyString(m.imageMessage?.caption) || 'Imagem recebida'
  }

  if (msgType === 'videoMessage') {
    return nonEmptyString(m.videoMessage?.caption) || 'Video recebido'
  }

  if (msgType === 'documentMessage') {
    return nonEmptyString(m.documentMessage?.fileName) || 'Documento recebido'
  }

  if (msgType === 'stickerMessage') {
    return 'Sticker recebido'
  }

  if (msgType === 'contactMessage') {
    return 'Contato recebido'
  }

  if (msgType === 'contactsArrayMessage') {
    return 'Contatos recebidos'
  }

  if (msgType === 'locationMessage') {
    return 'Localizacao recebida'
  }

  if (msgType === 'liveLocationMessage') {
    return 'Localizacao em tempo real'
  }

  if (msgType === 'buttonsResponseMessage') {
    return (
      nonEmptyString(m.buttonsResponseMessage?.selectedDisplayText) ||
      nonEmptyString(m.buttonsResponseMessage?.selectedButtonId) ||
      'Resposta de botao'
    )
  }

  if (msgType === 'templateButtonReplyMessage') {
    return (
      nonEmptyString(m.templateButtonReplyMessage?.selectedDisplayText) ||
      nonEmptyString(m.templateButtonReplyMessage?.selectedId) ||
      'Resposta de botao'
    )
  }

  if (msgType === 'listResponseMessage') {
    return (
      nonEmptyString(m.listResponseMessage?.title) ||
      nonEmptyString(m.listResponseMessage?.description) ||
      nonEmptyString(m.listResponseMessage?.singleSelectReply?.selectedRowId) ||
      'Resposta de lista'
    )
  }

  if (msgType === 'pollCreationMessage' || msgType === 'pollCreationMessageV2' || msgType === 'pollCreationMessageV3') {
    return nonEmptyString(m[msgType]?.name) || 'Enquete recebida'
  }

  if (msgType === 'eventMessage') {
    return nonEmptyString(m.eventMessage?.name) || 'Evento recebido'
  }

  return nonEmptyString(m.conversation) || nonEmptyString(m.extendedTextMessage?.text) || null
}

function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function digitsFromJidString(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized.includes('@')) return null
  if (!(normalized.endsWith('@s.whatsapp.net') || normalized.endsWith('@c.us'))) {
    return null
  }
  const localPart = normalized
    .replace(/@(s\.whatsapp\.net|c\.us)$/i, '')
    .replace(/:\d+$/, '')
  const digits = onlyDigits(localPart)
  return digits || null
}

function pickDigitsCandidate(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') {
    const fromJid = digitsFromJidString(value)
    if (fromJid) return fromJid
    if (value.includes('@')) return null
    const digits = onlyDigits(value)
    return digits || null
  }
  if (typeof value === 'number') {
    const digits = onlyDigits(value)
    return digits || null
  }
  if (isObject(value)) {
    const nestedCandidates = [
      value.number,
      value.phone,
      value.phoneNumber,
      value.jid
    ]
    for (const candidate of nestedCandidates) {
      const digits = pickDigitsCandidate(candidate)
      if (digits) return digits
    }
  }
  return null
}

export function resolveExplicitInboundPhoneCandidate(msg: any, data: any, body: any): string | null {
  const candidates = [
    msg?.key?.remoteJidAlt,
    data?.key?.remoteJidAlt,
    body?.data?.key?.remoteJidAlt,
    body?.key?.remoteJidAlt,
    msg?.remoteJidAlt,
    data?.remoteJidAlt,
    body?.data?.remoteJidAlt,
    body?.remoteJidAlt,
    msg?.number,
    data?.number,
    body?.data?.number,
    body?.number,
    msg?.senderPn,
    data?.senderPn,
    body?.data?.senderPn,
    body?.senderPn,
    msg?.participantPn,
    data?.participantPn,
    body?.data?.participantPn,
    body?.participantPn,
    msg?.participant,
    data?.participant,
    body?.data?.participant,
    body?.participant
  ]

  for (const candidate of candidates) {
    const digits = pickDigitsCandidate(candidate)
    if (digits) return digits
  }

  return null
}

export function shouldSkipLidMessageWithoutPhone(remoteJid: string | null | undefined, msg: any, data: any, body: any): boolean {
  if (!remoteJid || typeof remoteJid !== 'string') return false
  if (!remoteJid.toLowerCase().endsWith('@lid')) return false
  return !resolveExplicitInboundPhoneCandidate(msg, data, body)
}
