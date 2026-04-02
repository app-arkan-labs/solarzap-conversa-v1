import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, Download, FileText, Image as ImageIcon, Film, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tokenizeLinkifiedText } from '@/lib/linkifyText';

interface MessageContentProps {
  content: string;
  isSent: boolean;
  onLoad?: () => void;
  // New Attachments
  attachmentUrl?: string;
  attachmentType?: string;
  attachmentReady?: boolean;
  attachmentName?: string;
}

function renderLinkifiedText(text: string) {
  const tokens = tokenizeLinkifiedText(text);
  if (tokens.length === 0) return text;

  return tokens.map((token, index) => {
    if (token.type === 'link') {
      return (
        <a
          key={`link-${index}-${token.href}`}
          href={token.href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {token.value}
        </a>
      );
    }

    return (
      <React.Fragment key={`text-${index}`}>
        {token.value}
      </React.Fragment>
    );
  });
}

// Parse message content to extract media type and URL
export const parseMessageContent = (
  content: string,
  attachmentUrl?: string,
  attachmentType?: string,
  attachmentReady?: boolean,
  attachmentName?: string
): {
  type: 'text' | 'audio' | 'image' | 'video' | 'document';
  text: string;
  url?: string;
  fileName?: string;
  duration?: string;
} => {
  // Priority: DB Attachment Columns
  if (attachmentType && (attachmentReady !== false)) { // If ready or undefined
    // Map normalized type to internal type
    if (attachmentType === 'image') {
      return { type: 'image', text: attachmentName || 'Imagem', url: attachmentUrl, fileName: attachmentName }
    }
    if (attachmentType === 'video') {
      return { type: 'video', text: attachmentName || 'Vídeo', url: attachmentUrl, fileName: attachmentName }
    }
    if (attachmentType === 'audio') {
      return { type: 'audio', text: attachmentName || 'Áudio', url: attachmentUrl, fileName: attachmentName }
    }
    if (attachmentType === 'document') {
      return { type: 'document', text: attachmentName || 'Documento', url: attachmentUrl, fileName: attachmentName }
    }
  }

  // Fallback: Placeholder logic for pending uploads
  if (attachmentReady === false) {
    if (attachmentType === 'image') return { type: 'image', text: 'Carregando imagem...', fileName: 'Carregando...' }
    if (attachmentType === 'video') return { type: 'video', text: 'Carregando vídeo...', fileName: 'Carregando...' }
    if (attachmentType === 'audio') return { type: 'audio', text: 'Carregando áudio...', fileName: 'Carregando...' }
    if (attachmentType === 'document') return { type: 'document', text: 'Carregando documento...', fileName: 'Carregando...' }
    if (content.includes('📷 Imagem')) return { type: 'image', text: 'Carregando imagem...', fileName: 'Carregando...' }
    if (content.includes('🎬 Vídeo')) return { type: 'video', text: 'Carregando vídeo...', fileName: 'Carregando...' }
    if (content.includes('🎤 Áudio')) return { type: 'audio', text: 'Carregando áudio...', fileName: 'Carregando...' }
    if (content.includes('📄 Documento')) return { type: 'document', text: 'Carregando documento...', fileName: 'Carregando...' }
  }

  if (!content) return { type: 'text', text: '' };

  const lines = content.split('\n');
  const firstLine = lines[0] || '';
  const urlCandidate = lines[1]?.trim();
  const hasUrl = urlCandidate && (urlCandidate.startsWith('http://') || urlCandidate.startsWith('https://'));

  // Regex patterns to match emojis with or without variation selectors
  // \uFE0F is the variation selector-16
  const audioRegex = /^🎤\s*Áudio/iu;
  const imageRegex = /^(?:🖼️|🖼|📷)\s*/u;
  const videoRegex = /^(?:🎬|📹)\s*/u;
  const docRegex = /^(?:📎|🖇️|🖇|📄)\s*/u;
  const legacyStickerImageUrlRegex = /^https?:\/\/\S+\.(?:webp|gif|png|jpe?g)(?:[?#]\S*)?$/i;

  // Check for audio message
  if (audioRegex.test(firstLine)) {
    const durationMatch = firstLine.match(/\((\d+)s\)/);
    const duration = durationMatch ? durationMatch[1] : '0';

    return {
      type: 'audio',
      text: `Áudio (${duration}s)`,
      url: hasUrl ? urlCandidate : undefined,
      duration: duration + 's',
    };
  }

  // Check for image message
  if (imageRegex.test(firstLine)) {
    const fileName = firstLine.replace(imageRegex, '').trim();

    return {
      type: 'image',
      text: fileName,
      url: hasUrl ? urlCandidate : undefined,
      fileName,
    };
  }

  // EXPLICIT CHECK: "📂 Vídeo (Arquivo)" - Must be treated as Document
  // This prevents the UI from trying to render a large file as a video player
  if (firstLine.includes('📂 Vídeo (Arquivo)')) {
    const fileName = firstLine.replace('📂 Vídeo (Arquivo) -', '').trim();
    return {
      type: 'document',
      text: fileName,
      url: hasUrl ? urlCandidate : undefined,
      fileName
    };
  }

  // Check for video message (Standard)
  if (videoRegex.test(firstLine)) {
    const fileName = firstLine.replace(videoRegex, '').trim();

    return {
      type: 'video',
      text: fileName,
      url: hasUrl ? urlCandidate : undefined,
      fileName,
    };
  }

  // Check for document/attachment (Standard)
  if (docRegex.test(firstLine)) {
    const fileName = firstLine.replace(docRegex, '').trim();

    // Check extensions if it might be media disguised as doc
    const lowerName = fileName.toLowerCase();
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic'];
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v'];

    const isImage = imageExtensions.some(ext => lowerName.endsWith(ext));
    const isVideo = videoExtensions.some(ext => lowerName.endsWith(ext));

    if (isImage) {
      return {
        type: 'image',
        text: fileName,
        url: hasUrl ? urlCandidate : undefined,
        fileName,
      };
    }

    if (isVideo) {
      return {
        type: 'video',
        text: fileName,
        url: hasUrl ? urlCandidate : undefined,
        fileName,
      };
    }

    return {
      type: 'document',
      text: fileName,
      url: hasUrl ? urlCandidate : undefined,
      fileName,
    };
  }

  // Legacy fallback: old sticker placeholder persisted as plain text + URL
  if (firstLine.trim().toLowerCase() === 'sticker recebido' && hasUrl && legacyStickerImageUrlRegex.test(urlCandidate || '')) {
    return {
      type: 'image',
      text: 'Sticker recebido',
      url: urlCandidate,
      fileName: 'Sticker recebido',
    };
  }

  // Fallback: If no emoji but 2nd line is URL and 1st line looks like filename
  if (hasUrl) {
    const lowerName = firstLine.toLowerCase();
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    if (imageExtensions.some(ext => lowerName.endsWith(ext))) {
      return {
        type: 'image',
        text: firstLine,
        url: urlCandidate,
        fileName: firstLine,
      };
    }
  }

  return { type: 'text', text: content };
};

// Audio Player Component
function AudioPlayer({ url, duration }: { url: string; duration?: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  const playbackRates = [1, 1.5, 2];

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.error('Error playing audio:', err);
        setHasError(true);
      });
    }
    setIsPlaying(!isPlaying);
  };

  const cyclePlaybackRate = () => {
    const currentIndex = playbackRates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % playbackRates.length;
    const newRate = playbackRates[nextIndex];
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setTotalDuration(audioRef.current.duration);
      audioRef.current.playbackRate = playbackRate;
      setIsLoading(false);
    }
  };

  const handleCanPlay = () => {
    setIsLoading(false);
  };

  const handleError = async () => {
    // If we already tried the blob fallback, give up
    if (blobUrlRef.current) {
      console.error('Audio blob fallback also failed for:', url);
      setHasError(true);
      setIsLoading(false);
      return;
    }

    // Try fetch-to-blob: fixes CORS, auth token, and some codec issues
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      blobUrlRef.current = objUrl;
      if (audioRef.current) {
        audioRef.current.src = objUrl;
        audioRef.current.load();
      }
    } catch (fetchErr) {
      console.error('Audio fetch fallback failed:', fetchErr);
      setHasError(true);
      setIsLoading(false);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  if (hasError) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted sm:min-w-[200px]"
      >
        <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
          <Volume2 className="w-5 h-5 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{duration || 'Áudio'}</p>
          <p className="text-xs text-muted-foreground">Clique para abrir</p>
        </div>
        <Download className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </a>
    );
  }

  return (
    <div className="flex min-w-0 max-w-full items-center gap-3 p-2 sm:min-w-[240px]">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        onError={handleError}
        onEnded={handleEnded}
        preload="metadata"
      />

      <button
        onClick={togglePlay}
        disabled={isLoading}
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
          isLoading
            ? "bg-muted cursor-wait"
            : "bg-primary hover:bg-primary/90"
        )}
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-5 h-5 text-primary-foreground" />
        ) : (
          <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        {/* Progress bar */}
        <div className="h-1.5 bg-muted-foreground/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Time display */}
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-muted-foreground">
            {formatTime(currentTime)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {totalDuration > 0 ? formatTime(totalDuration) : duration || '0:00'}
          </span>
        </div>
      </div>

      {/* Speed control button */}
      <button
        onClick={cyclePlaybackRate}
        className={cn(
          "px-2 py-1 rounded text-xs font-medium transition-colors flex-shrink-0",
          playbackRate === 1
            ? "bg-muted text-muted-foreground hover:bg-muted/80"
            : "bg-primary/20 text-primary hover:bg-primary/30"
        )}
        title="Alterar velocidade de reprodução"
      >
        {playbackRate}x
      </button>

      <Volume2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </div>
  );
}

// Image Preview Component
function ImagePreview({ url, fileName, onLoad }: { url: string; fileName?: string; onLoad?: () => void }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (hasError) {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
        <ImageIcon className="w-8 h-8 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate">{fileName || 'Imagem'}</p>
          <p className="text-xs text-muted-foreground">Erro ao carregar imagem</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <Download className="w-4 h-4 text-muted-foreground" />
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="relative w-[min(64vw,240px)] max-w-[240px] rounded-lg overflow-hidden sm:w-auto sm:max-w-[280px]">
        {!isLoaded && (
          <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
        <img
          src={url}
          alt={fileName || 'Imagem'}
          className={cn(
            'block max-w-full max-h-[42vh] h-auto rounded-lg cursor-pointer object-cover hover:opacity-90 transition-opacity sm:max-h-[360px]',
            !isLoaded && 'opacity-0'
          )}
          onLoad={() => {
            setIsLoaded(true);
            onLoad?.();
          }}
          onError={() => setHasError(true)}
          onClick={() => setIsExpanded(true)}
        />
      </div>

      {/* Expanded View Modal */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <img
            src={url}
            alt={fileName || 'Imagem'}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </>
  );
}

// Video Preview Component
function VideoPreview({ url, fileName, onLoad }: { url: string; fileName?: string; onLoad?: () => void }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
        <Film className="w-8 h-8 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate">{fileName || 'Vídeo'}</p>
          <p className="text-xs text-muted-foreground">Erro ao carregar vídeo</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <Download className="w-4 h-4 text-muted-foreground" />
        </a>
      </div>
    );
  }

  return (
    <div className="relative w-[min(64vw,240px)] max-w-[240px] rounded-lg overflow-hidden sm:w-auto sm:max-w-[280px]">
      <video
        src={url}
        controls
        onLoadedMetadata={onLoad}
        className="block max-w-full max-h-[42vh] h-auto rounded-lg object-cover sm:max-h-[360px]"
        onError={() => setHasError(true)}
        preload="metadata"
      />
    </div>
  );
}

// Document Preview Component
function DocumentPreview({ url, fileName }: { url: string; fileName?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors min-w-[200px]"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
        <FileText className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{fileName || 'Documento'}</p>
        <p className="text-xs text-muted-foreground">Clique para abrir</p>
      </div>
      <Download className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </a>
  );
}

export function MessageContent({
  content,
  isSent,
  onLoad,
  attachmentUrl,
  attachmentType,
  attachmentReady,
  attachmentName
}: MessageContentProps) {
  const parsed = parseMessageContent(content, attachmentUrl, attachmentType, attachmentReady, attachmentName);

  switch (parsed.type) {
    case 'audio':
      if (parsed.url) {
        return <AudioPlayer url={parsed.url} duration={parsed.duration} />;
      }
      // Fallback: no URL available
      return (
        <div className="flex items-center gap-2 p-2">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-muted-foreground" />
          </div>
          <span className="text-sm text-muted-foreground">{parsed.text}</span>
        </div>
      );

    case 'image':
      if (parsed.url) {
        return <ImagePreview url={parsed.url} fileName={parsed.fileName} onLoad={onLoad} />;
      }
      return (
        <div className="flex items-center gap-2 p-2">
          <ImageIcon className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-foreground">{parsed.text}</span>
        </div>
      );

    case 'video':
      if (parsed.url) {
        return <VideoPreview url={parsed.url} fileName={parsed.fileName} onLoad={onLoad} />;
      }
      return (
        <div className="flex items-center gap-2 p-2">
          <Film className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-foreground">{parsed.text}</span>
        </div>
      );

    case 'document':
      if (parsed.url) {
        return <DocumentPreview url={parsed.url} fileName={parsed.fileName} />;
      }
      return (
        <div className="flex items-center gap-2 p-2">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-foreground">{parsed.text}</span>
        </div>
      );

    default:
      return (
        <p className="text-foreground text-sm whitespace-pre-wrap break-words">
          {renderLinkifiedText(parsed.text)}
        </p>
      );
  }
}
