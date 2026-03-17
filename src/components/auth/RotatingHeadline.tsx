import { useEffect, useState } from 'react';

const PHRASES = [
  'Venda mais energia solar',
  'Automatize seu atendimento',
  'Propostas em segundos',
  'Leads no piloto automático',
  'Seu CRM solar inteligente',
];

const INTERVAL_MS = 3000;

export function RotatingHeadline() {
  const [index, setIndex] = useState(0);
  const [animState, setAnimState] = useState<'in' | 'out'>('in');

  useEffect(() => {
    const id = setInterval(() => {
      setAnimState('out');
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % PHRASES.length);
        setAnimState('in');
      }, 400);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className="inline-block transition-all duration-400 ease-in-out"
      style={{
        opacity: animState === 'in' ? 1 : 0,
        transform: animState === 'in' ? 'translateY(0)' : 'translateY(-12px)',
        transitionDuration: '400ms',
      }}
    >
      {PHRASES[index]}
    </span>
  );
}
