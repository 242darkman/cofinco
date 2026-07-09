import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, Video, VideoOff, RotateCcw } from 'lucide-react';
import Button from '../ui/Button';

interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
  title?: string;
  subtitle?: string;
  facingMode?: 'user' | 'environment';
  aspectRatio?: 'square' | 'video';
}

export default function CameraCapture({
  isOpen,
  onClose,
  onCapture,
  title = 'Prendre une photo',
  subtitle = 'Positionnez le sujet dans le cadre',
  facingMode = 'environment',
  aspectRatio = 'video'
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Caméra non disponible. Vérifiez vos permissions ou utilisez HTTPS.");
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Accès caméra refusé.');
      } else if (err.name === 'NotFoundError') {
        setError('Aucune caméra trouvée.');
      } else {
        setError('Erreur accès caméra.');
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        // Use high quality for documents
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9); 
        onCapture(dataUrl);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/95 flex flex-col items-center justify-center z-[70] p-4">
      <div className="w-full max-w-2xl bg-surface-base rounded-2xl overflow-hidden shadow-2xl border border-edge">
        <div className="p-4 flex items-center justify-between border-b border-edge">
          <h3 className="text-content-primary font-bold text-lg flex items-center gap-2">
            <Camera className="text-accent" />
            {title}
          </h3>
          <button onClick={onClose} className="p-2 text-content-muted hover:text-content-primary hover:bg-surface rounded-lg transition">
            <X size={24} />
          </button>
        </div>

        <div className={`relative w-full overflow-hidden bg-black flex items-center justify-center ${
          aspectRatio === 'square' ? 'aspect-square max-h-[60vh] md:h-auto' : 'h-[60vh] md:h-auto md:aspect-video'
        }`}>
          {error ? (
             <div className="text-center p-6 text-status-danger">
               <VideoOff size={48} className="mx-auto mb-4 opacity-50" />
               <p>{error}</p>
               <Button onClick={startCamera} variant="ghost" className="mt-4" icon={RotateCcw}>Réessayer</Button>
             </div>
          ) : (
             <>
               <video
                 ref={videoRef}
                 autoPlay
                 playsInline
                 muted
                 className={`w-full h-full ${aspectRatio === 'square' ? 'object-cover' : 'object-contain'}`}
               />
               {aspectRatio === 'square' && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none border-2 border-transparent">
                   <div className="w-64 h-64 border-2 border-dashed border-accent/50 rounded-lg box-content shadow-[0_0_0_999px_rgba(0,0,0,0.5)]" />
                 </div>
               )}
             </>
          )}
        </div>
        {subtitle && <p className="text-center text-content-muted text-sm py-2 bg-surface-base">{subtitle}</p>}

        <div className="p-6 bg-surface-base flex justify-center gap-4 border-t border-edge">
          <Button onClick={onClose} variant="secondary" icon={X}>Annuler</Button>
          <Button 
            onClick={handleCapture} 
            variant="primary" 
            icon={Camera} 
            disabled={!!error}
            className="px-8"
          >
            Capturer
          </Button>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
