import React, { useState, useRef, useEffect } from 'react';
import { X, CheckCircle, Camera } from 'lucide-react';

interface FaceLivenessCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
  title?: string;
}

export default function FaceLivenessCapture({
  isOpen,
  onClose,
  onCapture,
  title = 'Capture Photo'
}: FaceLivenessCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [faceDetected, setFaceDetected] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [captureComplete, setCaptureComplete] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const faceDetectorRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
      initFaceDetector();
    } else {
      stopCamera();
      resetState();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const resetState = () => {
    setFaceDetected(false);
    setCountdown(null);
    setCaptureComplete(false);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const initFaceDetector = async () => {
    if ('FaceDetector' in window) {
      try {
        faceDetectorRef.current = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      } catch (err) {
        console.log('FaceDetector not available, using position-based detection');
      }
    }
  };

  const startCamera = async () => {
    setError('');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Caméra non disponible. Ouvrez l\'application dans un nouvel onglet du navigateur.');
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          startDetection();
        };
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Permission refusée. Autorisez l\'accès à la caméra.');
      } else if (err.name === 'NotFoundError') {
        setError('Aucune caméra détectée.');
      } else {
        setError('Impossible d\'accéder à la caméra.');
      }
    }
  };

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const startDetection = () => {
    let stableFrames = 0;
    const requiredStableFrames = 15;

    const detect = async () => {
      if (!videoRef.current || captureComplete) return;
      
      const video = videoRef.current;
      if (video.readyState !== 4) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      let isFaceInPosition = false;

      if (faceDetectorRef.current) {
        try {
          const faces = await faceDetectorRef.current.detect(video);
          if (faces.length > 0) {
            const face = faces[0].boundingBox;
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;
            
            const faceCenterX = face.x + face.width / 2;
            const faceCenterY = face.y + face.height / 2;
            const videoCenterX = videoWidth / 2;
            const videoCenterY = videoHeight / 2;
            
            const offsetX = Math.abs(faceCenterX - videoCenterX) / videoCenterX;
            const offsetY = Math.abs(faceCenterY - videoCenterY) / videoCenterY;
            
            const faceSize = (face.width * face.height) / (videoWidth * videoHeight);
            
            isFaceInPosition = offsetX < 0.25 && offsetY < 0.25 && faceSize > 0.03 && faceSize < 0.5;
          }
        } catch (err) {
          stableFrames++;
          if (stableFrames > requiredStableFrames * 2) {
            isFaceInPosition = true;
          }
        }
      } else {
        stableFrames++;
        if (stableFrames > requiredStableFrames * 2) {
          isFaceInPosition = true;
        }
      }

      if (isFaceInPosition) {
        stableFrames++;
        setFaceDetected(true);
        
        if (stableFrames >= requiredStableFrames && !countdown && !captureComplete) {
          startCountdown();
        }
      } else {
        stableFrames = Math.max(0, stableFrames - 2);
        setFaceDetected(false);
        if (countdown !== null) {
          setCountdown(null);
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    };

    detect();
  };

  const startCountdown = () => {
    setCountdown(3);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          capturePhoto();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const capturePhoto = () => {
    setCaptureComplete(true);
    
    setTimeout(() => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(video, -canvas.width, 0);
          ctx.restore();
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          onCapture(dataUrl);
          handleClose();
        }
      }
    }, 500);
  };

  const handleClose = () => {
    stopCamera();
    resetState();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-[70]">
      <div className="relative w-full max-w-md mx-4">
        <div className="bg-surface-base rounded-t-xl p-4 flex items-center justify-between">
          <div>
            <h3 className="text-content-primary font-bold text-lg">{title}</h3>
            <p className={`text-sm font-medium ${faceDetected ? 'text-status-success' : 'text-accent'}`}>
              {captureComplete 
                ? 'Photo capturée !' 
                : countdown 
                  ? `Capture dans ${countdown}...` 
                  : faceDetected 
                    ? 'Visage détecté, restez immobile...' 
                    : 'Placez votre visage dans le cercle'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-surface-elevated rounded-lg transition text-content-muted hover:text-content-primary"
            data-testid="button-close-liveness"
          >
            <X size={24} />
          </button>
        </div>

        <div className="relative bg-black aspect-square overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
            data-testid="video-liveness-stream"
          />
          
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 400 400"
          >
            <defs>
              <mask id="circleMask">
                <rect width="400" height="400" fill="white" />
                <ellipse cx="200" cy="180" rx="110" ry="140" fill="black" />
              </mask>
            </defs>
            
            <rect width="400" height="400" fill="rgba(0,0,0,0.6)" mask="url(#circleMask)" />
            
            <ellipse 
              cx="200" cy="180" rx="110" ry="140" 
              fill="none" 
              stroke={faceDetected ? 'var(--color-success)' : 'rgba(255,255,255,0.5)'}
              strokeWidth={faceDetected ? '4' : '3'}
              strokeDasharray={faceDetected ? 'none' : '8 4'}
              className="transition-all duration-300"
            />
          </svg>

          {countdown && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-accent/30 flex items-center justify-center animate-pulse">
                <span className="text-5xl font-bold text-content-primary">{countdown}</span>
              </div>
            </div>
          )}

          {captureComplete && (
            <div className="absolute inset-0 bg-status-success/20 flex items-center justify-center">
              <div className="bg-status-success rounded-full p-4 animate-pulse">
                <CheckCircle size={48} className="text-content-primary" />
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface-base rounded-b-xl p-4">
          {error ? (
            <div className="text-center">
              <div className="text-status-danger mb-4 text-sm">{error}</div>
              <button
                onClick={startCamera}
                className="px-6 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg transition"
              >
                Réessayer
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-3 bg-surface-elevated hover:bg-surface-subtle text-content-primary font-medium rounded-lg transition"
                data-testid="button-cancel-liveness"
              >
                Annuler
              </button>
              <button
                onClick={capturePhoto}
                className="flex-1 px-4 py-3 bg-accent hover:bg-accent/80 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
                data-testid="button-capture-manual"
              >
                <Camera size={18} />
                Capturer maintenant
              </button>
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
