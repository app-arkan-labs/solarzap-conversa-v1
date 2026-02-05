import React, { useState, useEffect } from 'react';
import { Contact, EventType } from '@/types/solarzap';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, Calendar as CalendarIcon, Clock, Video, MapPin, Check, AlertCircle, Mail } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useGoogleIntegrationContext } from '@/contexts/GoogleIntegrationContext';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  type: 'reuniao' | 'visita';
  onSchedule: (data: ScheduleData) => Promise<void>;
}

export interface ScheduleData {
  contactId: string;
  title: string;
  description?: string;
  type: EventType;
  date: Date;
  startTime: string;
  endTime: string;
  googleCalendarEmail?: string;
  meetLink?: string;
}

export function ScheduleModal({ isOpen, onClose, contact, type, onSchedule }: ScheduleModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [description, setDescription] = useState('');
  const [googleEmail, setGoogleEmail] = useState(contact?.email || '');
  const [sendCalendarInvite, setSendCalendarInvite] = useState(true);
  const [createMeetLink, setCreateMeetLink] = useState(type === 'reuniao');
  const [sendEmailNotification, setSendEmailNotification] = useState(true);
  
  const { isConnected, account, createCalendarEvent, sendEmail, createMeetLink: generateMeetLink } = useGoogleIntegrationContext();
  const { toast } = useToast();

  const isReuniao = type === 'reuniao';
  const title = isReuniao ? 'Agendar Reunião' : 'Agendar Visita';
  const eventTitle = isReuniao 
    ? `Reunião com ${contact?.name}` 
    : `Visita técnica - ${contact?.name}`;

  // Reset form when contact changes
  useEffect(() => {
    if (contact?.email) {
      setGoogleEmail(contact.email);
    }
  }, [contact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact || !date) return;

    setIsLoading(true);
    try {
      let meetLink: string | undefined;
      
      // Criar link do Meet se necessário
      if (isConnected && isReuniao && createMeetLink) {
        meetLink = await generateMeetLink();
      }

      // Criar evento no Google Calendar
      if (isConnected && sendCalendarInvite && googleEmail) {
        const startDate = new Date(date);
        const [startHour, startMinute] = startTime.split(':').map(Number);
        startDate.setHours(startHour, startMinute);

        const endDate = new Date(date);
        const [endHour, endMinute] = endTime.split(':').map(Number);
        endDate.setHours(endHour, endMinute);

        await createCalendarEvent({
          title: eventTitle,
          description: description || (isReuniao 
            ? `Reunião online para discutir projeto de energia solar.${meetLink ? `\n\nLink do Meet: ${meetLink}` : ''}` 
            : `Visita técnica para avaliação do local de instalação.${contact.address ? `\n\nEndereço: ${contact.address}` : ''}`
          ),
          startDate,
          endDate,
          attendeeEmail: googleEmail,
          location: !isReuniao ? contact.address : undefined,
          withMeet: isReuniao && createMeetLink,
        });

        toast({
          title: "Evento criado!",
          description: `Convite enviado para ${googleEmail} via Google Calendar`,
        });
      }

      // Enviar notificação por e-mail
      if (isConnected && sendEmailNotification && googleEmail) {
        await sendEmail({
          to: googleEmail,
          subject: `${isReuniao ? '📅 Reunião' : '🏠 Visita Técnica'} Agendada - SolarZap`,
          body: `Olá ${contact.name},\n\nSua ${isReuniao ? 'reunião' : 'visita técnica'} foi agendada para ${format(date, "PPP 'às' HH:mm", { locale: ptBR })}.\n\n${meetLink ? `Link do Google Meet: ${meetLink}\n\n` : ''}Até lá!\nEquipe SolarZap`,
        });
      }

      await onSchedule({
        contactId: contact.id,
        title: eventTitle,
        description,
        type: type,
        date,
        startTime,
        endTime,
        googleCalendarEmail: googleEmail,
        meetLink,
      });
      
      onClose();
    } catch (error) {
      console.error('Error scheduling:', error);
      toast({
        title: "Erro ao agendar",
        description: "Ocorreu um erro ao criar o agendamento. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!contact) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {isReuniao ? <Video className="w-5 h-5 text-purple-500" /> : <MapPin className="w-5 h-5 text-orange-500" />}
            {title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contact Info */}
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xl">
                {contact.avatar || '👤'}
              </div>
              <div>
                <div className="font-medium">{contact.name}</div>
                <div className="text-sm text-muted-foreground">{contact.phone}</div>
              </div>
            </div>
          </div>

          {/* Google Integration Status */}
          <div className={cn(
            "p-3 rounded-lg flex items-center gap-3",
            isConnected ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-200"
          )}>
            {isConnected ? (
              <>
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-green-800">Google conectado</div>
                  <div className="text-xs text-green-600">{account?.email}</div>
                </div>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-yellow-600" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-yellow-800">Google não conectado</div>
                  <div className="text-xs text-yellow-600">Conecte para sincronizar com Calendar e Meet</div>
                </div>
              </>
            )}
          </div>

          {/* Date Picker */}
          <div className="space-y-2">
            <Label>Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP', { locale: ptBR }) : 'Selecione uma data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  locale={ptBR}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime" className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Início
              </Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime" className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Término
              </Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Google Calendar Email */}
          <div className="space-y-2">
            <Label htmlFor="googleEmail">E-mail do cliente</Label>
            <Input
              id="googleEmail"
              type="email"
              value={googleEmail}
              onChange={(e) => setGoogleEmail(e.target.value)}
              placeholder="email@gmail.com"
            />
          </div>

          {/* Google Integration Options */}
          {isConnected && (
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <div className="text-sm font-medium text-muted-foreground">Opções de integração</div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-blue-500" />
                  <Label htmlFor="sendInvite" className="text-sm font-normal cursor-pointer">
                    Enviar convite via Google Calendar
                  </Label>
                </div>
                <Switch
                  id="sendInvite"
                  checked={sendCalendarInvite}
                  onCheckedChange={setSendCalendarInvite}
                />
              </div>

              {isReuniao && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-green-500" />
                    <Label htmlFor="createMeet" className="text-sm font-normal cursor-pointer">
                      Criar link do Google Meet
                    </Label>
                  </div>
                  <Switch
                    id="createMeet"
                    checked={createMeetLink}
                    onCheckedChange={setCreateMeetLink}
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-red-500" />
                  <Label htmlFor="sendEmail" className="text-sm font-normal cursor-pointer">
                    Enviar notificação por e-mail
                  </Label>
                </div>
                <Switch
                  id="sendEmail"
                  checked={sendEmailNotification}
                  onCheckedChange={setSendEmailNotification}
                />
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Observações</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isReuniao ? 'Detalhes da reunião...' : 'Detalhes da visita...'}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || !date} 
              className={cn('gap-2', isReuniao ? 'bg-purple-500 hover:bg-purple-600' : 'bg-orange-500 hover:bg-orange-600')}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Agendando...
                </>
              ) : (
                <>
                  {isReuniao ? <Video className="w-4 h-4" /> : <CalendarIcon className="w-4 h-4" />}
                  Agendar
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
