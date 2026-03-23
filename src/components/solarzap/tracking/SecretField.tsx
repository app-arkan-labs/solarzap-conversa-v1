import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type SecretFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  visible: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
};

export function SecretField({ label, placeholder, value, visible, onToggle, onChange }: SecretFieldProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pr-20"
        />
        <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1 h-8 px-2" onClick={onToggle}>
          {visible ? (
            <>
              <EyeOff className="mr-1 h-3.5 w-3.5" /> Ocultar
            </>
          ) : (
            <>
              <Eye className="mr-1 h-3.5 w-3.5" /> Mostrar
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
