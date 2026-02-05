import { supabase } from './supabase';

const DIRECT_API_URL = 'https://evo.arkanlabs.com.br';
const DIRECT_API_KEY = 'eef86d79f253d5f295edcd33b578c94b';

export interface EvolutionApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    instanceId: string;
    status: string;
  };
  hash: string;
  qrcode?: {
    base64: string;
    code: string;
  };
}

export interface ConnectInstanceResponse {
  base64: string;
  code: string;
}

export interface InstanceStatus {
  instance: {
    instanceName: string;
    state: 'open' | 'close' | 'connecting';
  };
}

export interface SendMessageResponse {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: {
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: string;
  status: string;
}

// Helper function to call Evolution API via Supabase Edge Function (Proxy)
// OR Direct Bypass if Proxy is down (Emergency Mode)
async function callEvolutionApi<T>(
  action: string,
  params: Record<string, any> = {}
): Promise<EvolutionApiResponse<T>> {
  try {
    console.log(`[${new Date().toISOString()}] Calling Evolution API (Direct Bypass): ${action}`, params);

    // MAPPING ACTION TO ENDPOINT
    let endpoint = '';
    let method = 'POST';
    let body: any = {};
    const instance = params.instanceName;

    switch (action) {
      case 'createInstance':
        endpoint = '/instance/create';
        body = {
          instanceName: instance,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          webhook: params.webhookUrl ? {
            url: params.webhookUrl,
            enabled: true,
            events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'SEND_MESSAGE']
          } : undefined
        };
        break;
      case 'connectInstance':
        endpoint = `/instance/connect/${instance}`;
        method = 'GET';
        break;
      case 'getInstanceStatus':
        endpoint = `/instance/connectionState/${instance}`;
        method = 'GET';
        break;
      case 'fetchInstances':
        endpoint = '/instance/fetchInstances';
        method = 'GET';
        break;
      case 'sendMessage':
        endpoint = `/message/sendText/${instance}`;
        body = {
          number: params.phone.replace(/\D/g, ''),
          text: params.message,
          quoted: params.quoted
        };
        break;
      case 'sendMedia':
        endpoint = `/message/sendMedia/${instance}`;
        body = {
          number: params.phone.replace(/\D/g, ''),
          mediatype: params.mediaType,
          media: params.mediaUrl,
          caption: params.caption,
          fileName: params.fileName,
          mimetype: params.mimetype
        };
        break;
      case 'sendAudio':
        endpoint = `/message/sendWhatsAppAudio/${instance}`;
        body = {
          number: params.phone.replace(/\D/g, ''),
          audio: params.audioUrl
        };
        break;
      case 'logoutInstance':
        endpoint = `/instance/logout/${instance}`;
        method = 'DELETE';
        break;
      case 'deleteInstance':
        endpoint = `/instance/delete/${instance}`;
        method = 'DELETE';
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const url = `${DIRECT_API_URL}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': DIRECT_API_KEY
      }
    };

    if (method !== 'GET' && method !== 'HEAD') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Direct API Error:', response.status, errorText);
      return { success: false, error: `API Error ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return { success: true, data };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Evolution API Client Error:', err);
    return { success: false, error: errorMessage };
  }
}

/**
 * Create a new WhatsApp instance
 * @param instanceName - Unique name for the instance
 * @param webhookUrl - Optional webhook URL for receiving events
 */
export async function createInstance(
  instanceName: string,
  webhookUrl?: string
): Promise<EvolutionApiResponse<CreateInstanceResponse>> {
  return callEvolutionApi<CreateInstanceResponse>('createInstance', {
    instanceName,
    webhookUrl,
  });
}

/**
 * Connect an instance and get QR code
 * @param instanceName - Name of the instance to connect
 */
export async function connectInstance(
  instanceName: string
): Promise<EvolutionApiResponse<ConnectInstanceResponse>> {
  return callEvolutionApi<ConnectInstanceResponse>('connectInstance', {
    instanceName,
  });
}

/**
 * Get the status of an instance
 * @param instanceName - Name of the instance
 */
export async function getInstanceStatus(
  instanceName: string
): Promise<EvolutionApiResponse<InstanceStatus>> {
  return callEvolutionApi<InstanceStatus>('getInstanceStatus', {
    instanceName,
  });
}

/**
 * Fetch all instances
 */
export async function fetchInstances(): Promise<EvolutionApiResponse<unknown[]>> {
  return callEvolutionApi<unknown[]>('fetchInstances');
}

/**
 * Send a text message
 * @param instanceName - Name of the instance
 * @param phone - Phone number (with country code)
 * @param message - Text message to send
 */
export async function sendMessage(
  instanceName: string,
  phone: string,
  message: string,
  quoted?: any
): Promise<EvolutionApiResponse<SendMessageResponse>> {
  return callEvolutionApi<SendMessageResponse>('sendMessage', {
    instanceName,
    phone,
    message,
    quoted,
  });
}

/**
 * Send a media message (image, video, document)
 * @param instanceName - Name of the instance
 * @param phone - Phone number (with country code)
 * @param mediaUrl - URL of the media file
 * @param mediaType - Type of media: 'image', 'audio', 'video', 'document'
 * @param caption - Optional caption for the media
 * @param fileName - Optional file name for documents
 */
export async function sendMedia(
  instanceName: string,
  phone: string,
  mediaUrl: string,
  mediaType: 'image' | 'audio' | 'video' | 'document',
  caption?: string,
  fileName?: string,
  mimetype?: string
): Promise<EvolutionApiResponse<SendMessageResponse>> {
  return callEvolutionApi<SendMessageResponse>('sendMedia', {
    instanceName,
    phone,
    mediaUrl,
    mediaType,
    caption,
    fileName,
    mimetype
  });
}

/**
 * Send an audio message (voice note)
 * @param instanceName - Name of the instance
 * @param phone - Phone number (with country code)
 * @param audioUrl - URL of the audio file
 */
export async function sendAudio(
  instanceName: string,
  phone: string,
  audioUrl: string
): Promise<EvolutionApiResponse<SendMessageResponse>> {
  return callEvolutionApi<SendMessageResponse>('sendAudio', {
    instanceName,
    phone,
    audioUrl,
  });
}

/**
 * Logout an instance (disconnect WhatsApp)
 * @param instanceName - Name of the instance
 */
export async function logoutInstance(
  instanceName: string
): Promise<EvolutionApiResponse<unknown>> {
  return callEvolutionApi<unknown>('logoutInstance', {
    instanceName,
  });
}

/**
 * Delete an instance
 * @param instanceName - Name of the instance
 */
export async function deleteInstance(
  instanceName: string
): Promise<EvolutionApiResponse<unknown>> {
  return callEvolutionApi<unknown>('deleteInstance', {
    instanceName,
  });
}

/**
 * Set webhook for an instance
 * @param instanceName - Name of the instance
 * @param webhookUrl - Webhook URL
 * @param events - Optional array of events to subscribe to
 */
export async function setWebhook(
  instanceName: string,
  webhookUrl: string,
  events?: string[]
): Promise<EvolutionApiResponse<unknown>> {
  return callEvolutionApi<unknown>('setWebhook', {
    instanceName,
    webhookUrl,
    events,
  });
}

// Export all functions as a namespace for convenience
export const evolutionApi = {
  createInstance,
  connectInstance,
  getInstanceStatus,
  fetchInstances,
  sendMessage,
  sendMedia,
  sendAudio,
  logoutInstance,
  deleteInstance,
  setWebhook,
};

export default evolutionApi;
