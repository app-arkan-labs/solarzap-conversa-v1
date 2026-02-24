import React, { useState, useEffect } from 'react';
import { whatsappService, WhatsAppInstance } from '../services/whatsappService';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function WhatsAppManager() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [currentQR, setCurrentQR] = useState('');
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [instanceToDelete, setInstanceToDelete] = useState<WhatsAppInstance | null>(null);

  // Testar conexão ao montar
  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    setTestResult('Testando conexão...');
    const result = await whatsappService.testConnection();
    if (result.success) {
      setTestResult(`✅ ${result.message}`);
    } else {
      setTestResult(`❌ Erro: ${result.message}`);
    }
  };

  const createInstance = async () => {
    if (!displayName.trim()) {
      setError('Digite um nome para a instância');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const newInstance = await whatsappService.createInstance(displayName);
      setInstances(prev => [...prev, newInstance]);
      if (newInstance.qrCode) {
        setCurrentQR(newInstance.qrCode);
      }
      setDisplayName('');
    } catch (err) {
      setError(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async (instanceName: string) => {
    try {
      const status = await whatsappService.getInstanceStatus(instanceName);
      console.log('Status:', status);
      setInstances(prev => prev.map(inst => 
        inst.instanceName === instanceName 
          ? { ...inst, status: status.instance?.state === 'open' ? 'connected' : 'disconnected' }
          : inst
      ));
    } catch (err) {
      console.error('Erro ao verificar status:', err);
    }
  };

  const deleteInstance = (instance: WhatsAppInstance) => {
    setInstanceToDelete(instance);
  };

  const confirmDeleteInstance = async () => {
    const instance = instanceToDelete;
    if (!instance) return;
    setInstanceToDelete(null);
    try {
      await whatsappService.deleteInstance(instance.instanceName);
      setInstances(prev => prev.filter(i => i.id !== instance.id));
    } catch (err) {
      setError(`Erro ao deletar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          🟢 Gerenciar WhatsApp
        </h2>

        {/* Teste de Conexão */}
        {testResult && (
          <div className={`mb-4 p-4 rounded ${testResult.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {testResult}
            <button 
              onClick={testConnection}
              className="ml-4 underline hover:no-underline"
            >
              Testar novamente
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
            <button onClick={() => setError('')} className="ml-4 underline">Fechar</button>
          </div>
        )}

        {/* Criar Nova Instância */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">
            ➕ Criar Nova Instância WhatsApp
          </h3>
          
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome da Instância
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Atendimento Solar"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              />
            </div>
            <button
              onClick={createInstance}
              disabled={loading || !displayName.trim()}
              className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? '⏳ Criando...' : '🚀 Criar'}
            </button>
          </div>
        </div>

        {/* QR Code */}
        {currentQR && (
          <div className="mb-6 p-6 bg-green-50 rounded-lg text-center">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              📱 Escaneie o QR Code no seu WhatsApp
            </h3>
            <div className="inline-block p-4 bg-white rounded-lg shadow">
              <img 
                src={currentQR.startsWith('data:') ? currentQR : `data:image/png;base64,${currentQR}`}
                alt="QR Code WhatsApp" 
                className="mx-auto max-w-xs"
              />
            </div>
            <p className="text-gray-600 mt-4">
              WhatsApp → ⚙️ Configurações → 🔗 Aparelhos conectados → ➕ Conectar aparelho
            </p>
            <button 
              onClick={() => setCurrentQR('')}
              className="mt-4 text-blue-500 hover:text-blue-700 underline"
            >
              ❌ Fechar QR Code
            </button>
          </div>
        )}

        {/* Lista de Instâncias */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            📋 Instâncias Ativas ({instances.length})
          </h3>
          
          {instances.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-xl">📱</p>
              <p>Nenhuma instância WhatsApp criada ainda</p>
              <p className="text-sm">Crie uma acima para começar!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {instances.map((instance) => (
                <div 
                  key={instance.id} 
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className={`w-3 h-3 rounded-full ${
                        instance.status === 'connected' ? 'bg-green-500' :
                        instance.status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}></span>
                      <h4 className="font-semibold text-gray-900">{instance.displayName}</h4>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Status: <span className={`font-medium ${
                        instance.status === 'connected' ? 'text-green-600' :
                        instance.status === 'connecting' ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {instance.status === 'connected' ? '✅ Conectado' :
                         instance.status === 'connecting' ? '🔄 Conectando' : '❌ Desconectado'}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">ID: {instance.instanceName}</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => checkStatus(instance.instanceName)}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                    >
                      🔄 Status
                    </button>
                    <button
                      onClick={() => deleteInstance(instance)}
                      className="px-3 py-1 text-sm bg-red-100 text-red-600 rounded hover:bg-red-200"
                    >
                      🗑️ Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!instanceToDelete} onOpenChange={(open) => !open && setInstanceToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que quer deletar "{instanceToDelete?.displayName}"?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstanceToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeleteInstance}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
