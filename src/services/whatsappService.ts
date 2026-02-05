interface WhatsAppInstance {
  id: string;
  instanceName: string;
  displayName: string;
  status: 'connected' | 'disconnected' | 'connecting';
  qrCode?: string;
  phoneNumber?: string;
  createdAt: string;
}

class WhatsAppService {
  private baseUrl = 'https://evo.arkanlabs.com.br';
  private apiKey = 'eef86d79f253d5f295edcd33b578c94b';

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na Evolution API: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  async createInstance(instanceName: string, displayName: string): Promise<WhatsAppInstance> {

    // Criar instância
    await this.request('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        token: instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        reject_call: false,
        msgRetry: true,
        alwaysOnline: true,
        mobile: false,
        browserName: 'SolarZap'
        // note: browserName support depends on Evolution API version
        // newer versions might require different config for display name
      })
    });

    // Pegar QR Code
    const qrData = await this.request(`/instance/connect/${instanceName}`);

    return {
      id: instanceName,
      instanceName,
      displayName,
      status: 'connecting',
      qrCode: qrData.base64 || qrData.qrcode?.base64 || null,
      createdAt: new Date().toISOString()
    };
  }

  async listInstances(): Promise<unknown[]> {
    return this.request('/instance/fetchInstances');
  }

  async getInstanceStatus(instanceName: string) {
    return this.request(`/instance/connectionState/${instanceName}`);
  }

  async refreshQrCode(instanceName: string) {
    const qrData = await this.request(`/instance/connect/${instanceName}`);
    return qrData.base64 || qrData.qrcode?.base64 || null;
  }

  async sendMessage(instanceName: string, phone: string, message: string) {
    return this.request(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number: phone,
        textMessage: { text: message }
      })
    });
  }

  async disconnectInstance(instanceName: string) {
    return this.request(`/instance/logout/${instanceName}`, {
      method: 'DELETE'
    });
  }

  async deleteInstance(instanceName: string) {
    console.log(`[WhatsAppService] Deleting instance: ${instanceName}`);
    try {
      // Tentar logout primeiro
      await this.request(`/instance/logout/${instanceName}`, { method: 'DELETE' });
    } catch (e) {
      console.warn(`[WhatsAppService] Logout failed for ${instanceName} (might be already closed):`, e);
    }

    // Deletar de fato
    return this.request(`/instance/delete/${instanceName}`, {
      method: 'DELETE'
    });
  }

  // Testar conexão com a Evolution API
  async testConnection(): Promise<{ success: boolean; message: string; data?: unknown }> {
    try {
      const instances = await this.listInstances();
      return {
        success: true,
        message: `Conexão OK! ${Array.isArray(instances) ? instances.length : 0} instâncias encontradas.`,
        data: instances
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }
}

export const whatsappService = new WhatsAppService();
export type { WhatsAppInstance };
