export const INTERNAL_CRM_CHAT_DELIVERY_BUCKET = 'internal-crm-chat-delivery';
export const INTERNAL_CRM_CHAT_ATTACHMENT_BUCKET = 'internal-crm-chat-attachments';

export type InternalCrmAttachmentKind = 'image' | 'video' | 'audio' | 'document';
export type InternalCrmMediaVariant = 'standard' | 'gif' | 'sticker' | 'voice_note';

type FileLike = {
  name: string;
  type?: string | null;
};

const lower = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

export function resolveInternalCrmAttachmentKind(file: FileLike): InternalCrmAttachmentKind {
  const mimeType = lower(file.type);
  const fileName = lower(file.name);

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';

  if (/\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(fileName)) return 'image';
  if (/\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(fileName)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(fileName)) return 'audio';

  return 'document';
}

export function resolveInternalCrmMediaVariant(
  file: FileLike,
  options?: {
    preferSticker?: boolean;
    isVoiceNote?: boolean;
  },
): InternalCrmMediaVariant {
  const mimeType = lower(file.type);
  const fileName = lower(file.name);

  if (options?.isVoiceNote) return 'voice_note';
  if (mimeType === 'image/gif' || fileName.endsWith('.gif')) return 'gif';
  if (options?.preferSticker || mimeType === 'image/webp' || fileName.endsWith('.webp')) return 'sticker';
  return 'standard';
}

export function shouldSendInternalCrmAsSticker(
  file: FileLike,
  options?: {
    preferSticker?: boolean;
  },
): boolean {
  const variant = resolveInternalCrmMediaVariant(file, options);
  return variant === 'gif' || variant === 'sticker';
}
