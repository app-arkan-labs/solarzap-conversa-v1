import { useState, useEffect } from 'react';
import { Mic, Volume2, Check, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface AudioDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (inputDeviceId: string, outputDeviceId: string) => void;
  mode?: 'select' | 'settings'; // 'select' for first-time selection, 'settings' for settings menu
}

export function AudioDeviceModal({ 
  isOpen, 
  onClose, 
  onConfirm,
  mode = 'select'
}: AudioDeviceModalProps) {
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>('');
  const [selectedOutput, setSelectedOutput] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Request permission to access media devices
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const inputs = devices
        .filter(d => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microfone ${index + 1}`,
        }));
      
      const outputs = devices
        .filter(d => d.kind === 'audiooutput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Alto-falante ${index + 1}`,
        }));
      
      setInputDevices(inputs);
      setOutputDevices(outputs);
      
      // Get saved preferences or use defaults
      const savedInput = localStorage.getItem('solarzap_audio_input');
      const savedOutput = localStorage.getItem('solarzap_audio_output');
      
      if (savedInput && inputs.find(d => d.deviceId === savedInput)) {
        setSelectedInput(savedInput);
      } else if (inputs.length > 0) {
        setSelectedInput(inputs[0].deviceId);
      }
      
      if (savedOutput && outputs.find(d => d.deviceId === savedOutput)) {
        setSelectedOutput(savedOutput);
      } else if (outputs.length > 0) {
        setSelectedOutput(outputs[0].deviceId);
      }
    } catch (err) {
      console.error('Error loading devices:', err);
      setError('Não foi possível acessar os dispositivos de áudio. Verifique as permissões do navegador.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDevices();
    }
  }, [isOpen]);

  // Test microphone input
  const testMicrophone = async () => {
    if (!selectedInput || isTesting) return;
    
    setIsTesting(true);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedInput ? { exact: selectedInput } : undefined }
      });
      
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);
      
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      let animationId: number;
      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
        setAudioLevel(Math.min(100, average * 2));
        animationId = requestAnimationFrame(checkLevel);
      };
      
      checkLevel();
      
      // Stop after 3 seconds
      setTimeout(() => {
        cancelAnimationFrame(animationId);
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
        setIsTesting(false);
        setAudioLevel(0);
      }, 3000);
    } catch (err) {
      console.error('Error testing microphone:', err);
      setIsTesting(false);
    }
  };

  const handleConfirm = () => {
    // Save preferences
    localStorage.setItem('solarzap_audio_input', selectedInput);
    localStorage.setItem('solarzap_audio_output', selectedOutput);
    localStorage.setItem('solarzap_audio_configured', 'true');
    
    onConfirm(selectedInput, selectedOutput);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" />
            {mode === 'select' ? 'Configurar Áudio' : 'Configurações de Áudio'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'select' 
              ? 'Selecione os dispositivos de áudio que deseja usar para gravação e reprodução.'
              : 'Gerencie seus dispositivos de entrada e saída de áudio.'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {error ? (
            <div className="p-4 bg-destructive/10 rounded-lg text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadDevices}
                className="mt-2"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Tentar novamente
              </Button>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Input Device Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mic className="w-4 h-4" />
                  Dispositivo de Entrada (Microfone)
                </Label>
                <Select value={selectedInput} onValueChange={setSelectedInput}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um microfone" />
                  </SelectTrigger>
                  <SelectContent>
                    {inputDevices.map(device => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Microphone Test */}
                <div className="flex items-center gap-3 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testMicrophone}
                    disabled={isTesting || !selectedInput}
                  >
                    {isTesting ? 'Testando...' : 'Testar Microfone'}
                  </Button>
                  
                  {/* Audio Level Indicator */}
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        'h-full transition-all duration-75 rounded-full',
                        audioLevel > 70 ? 'bg-primary' : audioLevel > 30 ? 'bg-green-500' : 'bg-muted-foreground/30'
                      )}
                      style={{ width: `${audioLevel}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Output Device Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Dispositivo de Saída (Alto-falantes)
                </Label>
                <Select value={selectedOutput} onValueChange={setSelectedOutput}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um dispositivo de saída" />
                  </SelectTrigger>
                  <SelectContent>
                    {outputDevices.map(device => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading || !!error}>
            <Check className="w-4 h-4 mr-2" />
            {mode === 'select' ? 'Confirmar e Gravar' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
