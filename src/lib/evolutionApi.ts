import { supabase } from './supabase';

// Evolution API credentials have been removed from frontend.  
// All calls now go through the `evolution-proxy` edge function.
// The proxy holds the actual EVOLUTION_API_URL and EVOLUTION_API_KEY in its env.


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

type ProxyEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: unknown;
  message?: unknown;
  details?: unknown;
};

function getErrorMessage(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.error === 'string' && candidate.error.trim().length > 0) return candidate.error;
    if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) return candidate.message;
    if (typeof candidate.details === 'string' && candidate.details.trim().length > 0) return candidate.details;
  }
  return 'Unknown proxy error';
}

function normalizeProxyResponse<T>(payload: unknown): EvolutionApiResponse<T> {
  if (payload && typeof payload === 'object') {
    const envelope = payload as ProxyEnvelope<T>;
    if (typeof envelope.success === 'boolean') {
      if (!envelope.success) {
        return {
          success: false,
          error: getErrorMessage(envelope.error ?? envelope.message ?? envelope.details),
        };
      }
      return {
        success: true,
        data: envelope.data as T,
      };
    }
  }

  // Legacy/raw compatibility: when proxy returns raw data directly.
  return { success: true, data: payload as T };
}

// Helper function to call Evolution API via Supabase Edge Function (Proxy)
// OR Direct Bypass if Proxy is down (Emergency Mode)
// The client no longer communicates with Evolution directly.  
// All interactions happen through the `evolution-proxy` edge function
// which holds the real credentials in its environment.

async function callEvolutionApi<T>(
  action: string,
  params: Record<string, any> = {}
): Promise<EvolutionApiResponse<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('evolution-proxy', {
      body: JSON.stringify({ action, payload: params }),
    });
    if (error) {
      console.error('evolution-proxy error', error);
      return { success: false, error: error.message || 'Unknown proxy error' };
    }

    return normalizeProxyResponse<T>(data);
  } catch (err) {
    let errorMessage = err instanceof Error ? err.message : String(err);

    try {
      const maybeContext = (err as { context?: Response })?.context;
      if (maybeContext && typeof maybeContext.clone === 'function') {
        const rawText = await maybeContext.clone().text();
        if (rawText) {
          try {
            const parsed = JSON.parse(rawText);
            const backendError = parsed?.error || parsed?.message || parsed?.details;
            if (backendError) {
              errorMessage = String(backendError);
            } else {
              errorMessage = rawText;
            }
          } catch {
            errorMessage = rawText;
          }
        }
      }
    } catch {
      // keep fallback error message
    }

    console.error('Evolution proxy invocation failed', err);
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
  quoted?: any,
  options?: { clientTraceId?: string }
): Promise<EvolutionApiResponse<SendMessageResponse>> {
  return callEvolutionApi<SendMessageResponse>('sendMessage', {
    instanceName,
    number: phone,
    phone,
    text: message,
    message,
    quoted,
    clientTraceId: options?.clientTraceId,
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
    number: phone,
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
  return callEvolutionApi<SendMessageResponse>('sendMedia', {
    instanceName,
    number: phone,
    phone,
    mediaType: 'audio',
    mediaUrl: audioUrl,
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
  events?: string[],
  webhookHeaders?: Record<string, string>
): Promise<EvolutionApiResponse<unknown>> {
  return callEvolutionApi<unknown>('setWebhook', {
    instanceName,
    webhookUrl,
    events,
    webhookHeaders,
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
