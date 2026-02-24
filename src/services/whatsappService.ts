interface WhatsAppInstance {
  id: string;
  instanceName: string;
  displayName: string;
  status: 'connected' | 'disconnected' | 'connecting';
  qrCode?: string;
  phoneNumber?: string;
  createdAt: string;
}

import { supabase } from '@/lib/supabase';

class WhatsAppService {
  // evolution-proxy edge function handles all communication with Evolution API.
  // Credentials are stored server-side; frontend never sees them.

  private async proxyRequest<T>(action: string, payload: Record<string, any> = {}): Promise<T> {
    const { data, error } = await supabase.functions.invoke('evolution-proxy', {
      body: JSON.stringify({ action, payload }),
    });
    if (error) {
      // supabase-js returns an object with `error` when invocation fails
      throw new Error(error.message || 'Evolution proxy invocation failed');
    }
    return data as T;
  }

  async createInstance(instanceName: string, displayName: string): Promise<WhatsAppInstance> {
    // Use proxy action; the server will build/create and return raw result
    await this.proxyRequest('createInstance', { instanceName });

    const qrData: any = await this.proxyRequest('connectInstance', { instanceName });

    return {
      id: instanceName,
      instanceName,
      displayName,
      status: 'connecting',
      qrCode: qrData.base64 || qrData.qrcode?.base64 || null,
      createdAt: new Date().toISOString(),
    };
  }

  async listInstances(): Promise<unknown[]> {
    return this.proxyRequest('fetchInstances');
  }

  async getInstanceStatus(instanceName: string) {
    return this.proxyRequest('getInstanceStatus', { instanceName });
  }

  async refreshQrCode(instanceName: string) {
    const qrData: any = await this.proxyRequest('connectInstance', { instanceName });
    return qrData.base64 || qrData.qrcode?.base64 || null;
  }

  async sendMessage(instanceName: string, phone: string, message: string) {
    return this.proxyRequest('sendMessage', {
      instanceName,
      phone,
      message,
    });
  }

  async disconnectInstance(instanceName: string) {
    return this.proxyRequest('logoutInstance', { instanceName });
  }

  async deleteInstance(instanceName: string) {
    console.info(`[WhatsAppService] Deleting instance: ${instanceName}`);
    try {
      await this.proxyRequest('logoutInstance', { instanceName });
    } catch (e) {
      console.warn(`[WhatsAppService] Logout failed for ${instanceName} (might be already closed):`, e);
    }

    return this.proxyRequest('deleteInstance', { instanceName });
  }

  // Testar conexão via proxy
  async testConnection(): Promise<{ success: boolean; message: string; data?: unknown }> {
    try {
      const instances = await this.listInstances();
      return {
        success: true,
        message: `Conexão OK! ${Array.isArray(instances) ? instances.length : 0} instâncias encontradas.`,
        data: instances,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }
}

export const whatsappService = new WhatsAppService();
export type { WhatsAppInstance };
