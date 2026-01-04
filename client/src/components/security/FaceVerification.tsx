import React, { useRef, useState, useEffect, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { Camera, CheckCircle, RotateCcw, AlertCircle, X, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';

interface FaceVerificationProps {
  onVerificationComplete: (photoDataUrl: string) => void;
  onCancel?: () => void;
}

type Direction = 'center' | 'left' | 'right' | 'up' | 'down';

interface DirectionState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

const DETECTION_THRESHOLD = {
  yaw: 20,
  pitch: 15,
};

const DIRECTION_HOLD_TIME = 500;

export default function FaceVerification({ onVerificationComplete, onCancel }: FaceVerificationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [currentDirection, setCurrentDirection] = useState<Direction>('center');
  const [holdingDirection, setHoldingDirection] = useState<Direction | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [completedDirections, setCompletedDirections] = useState<DirectionState>({
    left: false,
    right: false,
    up: false,
    down: false,
  });
  const [instruction, setInstruction] = useState('Chargement...');
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const directionOrder: (keyof DirectionState)[] = ['left', 'right', 'up', 'down'];
  
  const directionLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    left: { label: 'Gauche', icon: <ArrowLeft size={24} /> },
    right: { label: 'Droite', icon: <ArrowRight size={24} /> },
    up: { label: 'Haut', icon: <ArrowUp size={24} /> },
    down: { label: 'Bas', icon: <ArrowDown size={24} /> },
  };

  const loadModels = useCallback(async () => {
    try {
      setInstruction('Chargement des modèles...');
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
      
      setLoadingProgress(20);
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      setLoadingProgress(60);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      setLoadingProgress(100);
      
      setModelsLoaded(true);
      setInstruction('Activation de la caméra...');
    } catch (err) {
      console.error('Error loading models:', err);
      setError('Erreur lors du chargement. Veuillez rafraîchir la page.');
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
        setIsLoading(false);
        updateInstructionForStep(0);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Impossible d\'accéder à la caméra. Veuillez autoriser l\'accès.');
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (modelsLoaded) {
      startCamera();
    }
  }, [modelsLoaded, startCamera]);

  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
      if (holdIntervalRef.current) {
        clearInterval(holdIntervalRef.current);
      }
    };
  }, []);

  const getHeadPose = (landmarks: faceapi.FaceLandmarks68) => {
    const nose = landmarks.getNose();
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const jaw = landmarks.getJawOutline();

    const noseTip = nose[3];
    const noseBase = nose[0];
    const leftEyeCenter = {
      x: leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length,
      y: leftEye.reduce((sum, p) => sum + p.y, 0) / leftEye.length,
    };
    const rightEyeCenter = {
      x: rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length,
      y: rightEye.reduce((sum, p) => sum + p.y, 0) / rightEye.length,
    };

    const eyeCenter = {
      x: (leftEyeCenter.x + rightEyeCenter.x) / 2,
      y: (leftEyeCenter.y + rightEyeCenter.y) / 2,
    };

    const faceWidth = jaw[16].x - jaw[0].x;
    const yaw = ((noseTip.x - eyeCenter.x) / faceWidth) * 100;
    const pitch = ((noseTip.y - noseBase.y) / faceWidth) * 100;

    return { yaw, pitch };
  };

  const updateInstructionForStep = (step: number) => {
    if (step >= directionOrder.length) {
      setInstruction('Parfait ! Préparation de la photo...');
      return;
    }
    const dir = directionOrder[step];
    setInstruction(`Tournez la tête vers la ${directionLabels[dir].label.toLowerCase()}`);
  };

  const detectFace = useCallback(async () => {
    if (!videoRef.current || !cameraReady || verificationComplete || countdown !== null) return;

    try {
      const detections = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      if (detections) {
        setFaceDetected(true);
        const { yaw, pitch } = getHeadPose(detections.landmarks);

        let detectedDirection: Direction = 'center';

        if (yaw < -DETECTION_THRESHOLD.yaw) {
          detectedDirection = 'left';
        } else if (yaw > DETECTION_THRESHOLD.yaw) {
          detectedDirection = 'right';
        } else if (pitch < -DETECTION_THRESHOLD.pitch) {
          detectedDirection = 'up';
        } else if (pitch > DETECTION_THRESHOLD.pitch) {
          detectedDirection = 'down';
        }

        setCurrentDirection(detectedDirection);

        const expectedDirection = directionOrder[currentStep];
        
        if (detectedDirection === expectedDirection && !completedDirections[expectedDirection]) {
          if (holdingDirection !== expectedDirection) {
            if (holdIntervalRef.current) {
              clearInterval(holdIntervalRef.current);
            }
            if (holdTimerRef.current) {
              clearTimeout(holdTimerRef.current);
            }
            
            setHoldingDirection(expectedDirection);
            setHoldProgress(0);
            
            let progress = 0;
            holdIntervalRef.current = setInterval(() => {
              progress += 10;
              setHoldProgress(progress);
              
              if (progress >= 100) {
                if (holdIntervalRef.current) {
                  clearInterval(holdIntervalRef.current);
                  holdIntervalRef.current = null;
                }
                setCompletedDirections(prev => ({ ...prev, [expectedDirection]: true }));
                setHoldingDirection(null);
                setHoldProgress(0);
                
                const nextStep = currentStep + 1;
                setCurrentStep(nextStep);
                
                if (nextStep >= directionOrder.length) {
                  startCountdown();
                } else {
                  updateInstructionForStep(nextStep);
                }
              }
            }, DIRECTION_HOLD_TIME / 10);
          }
        } else if (detectedDirection !== expectedDirection) {
          if (holdIntervalRef.current) {
            clearInterval(holdIntervalRef.current);
            holdIntervalRef.current = null;
          }
          if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
          }
          setHoldingDirection(null);
          setHoldProgress(0);
        }
      } else {
        setFaceDetected(false);
        setCurrentDirection('center');
        setHoldingDirection(null);
        setHoldProgress(0);
        setInstruction('Aucun visage détecté. Placez votre visage au centre.');
      }
    } catch (err) {
      console.error('Detection error:', err);
    }
  }, [cameraReady, verificationComplete, currentStep, completedDirections, holdingDirection, countdown]);

  const startCountdown = () => {
    setInstruction('Photo dans...');
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;
    
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      capturePhoto();
    }
  }, [countdown]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();
      
      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setCapturedPhoto(photoDataUrl);
      setVerificationComplete(true);
      setInstruction('Identité vérifiée avec succès !');
      
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      
      setTimeout(() => {
        onVerificationComplete(photoDataUrl);
      }, 2000);
    }
  }, [onVerificationComplete]);

  useEffect(() => {
    if (!cameraReady || verificationComplete) return;

    const interval = setInterval(detectFace, 100);
    return () => clearInterval(interval);
  }, [cameraReady, detectFace, verificationComplete]);

  const reset = () => {
    setCompletedDirections({
      left: false,
      right: false,
      up: false,
      down: false,
    });
    setCurrentStep(0);
    setVerificationComplete(false);
    setCapturedPhoto(null);
    setCountdown(null);
    setHoldingDirection(null);
    setHoldProgress(0);
    updateInstructionForStep(0);
    startCamera();
  };

  const progress = (Object.values(completedDirections).filter(Boolean).length / 4) * 100;

  const renderProgressCircle = () => {
    const size = 300;
    const strokeWidth = 10;
    const radius = (size - strokeWidth) / 2 - 40;
    const circumference = 2 * Math.PI * radius;
    const segmentLength = circumference / 4;
    const gap = 8;

    const segments = [
      { key: 'up', rotation: -45, completed: completedDirections.up },
      { key: 'right', rotation: 45, completed: completedDirections.right },
      { key: 'down', rotation: 135, completed: completedDirections.down },
      { key: 'left', rotation: 225, completed: completedDirections.left },
    ];

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg 
          className="absolute inset-0 transform -rotate-90" 
          width={size} 
          height={size}
        >
          {segments.map((segment, index) => {
            const isActive = directionOrder[currentStep] === segment.key && !segment.completed;
            const isHolding = holdingDirection === segment.key;
            
            return (
              <circle
                key={segment.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={
                  segment.completed 
                    ? '#22c55e' 
                    : isHolding 
                      ? '#3b82f6'
                      : isActive 
                        ? '#fbbf24' 
                        : 'rgba(100, 116, 139, 0.3)'
                }
                strokeWidth={isActive || isHolding ? strokeWidth + 2 : strokeWidth}
                strokeDasharray={`${segmentLength - gap} ${circumference - segmentLength + gap}`}
                strokeDashoffset={-index * segmentLength}
                strokeLinecap="round"
                className="transition-all duration-300"
                style={{
                  filter: segment.completed 
                    ? 'drop-shadow(0 0 10px rgba(34, 197, 94, 0.6))' 
                    : isHolding
                      ? 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.6))'
                      : isActive
                        ? 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.5))'
                        : 'none',
                }}
              />
            );
          })}
          
          {holdingDirection && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={4}
              strokeDasharray={`${(holdProgress / 100) * segmentLength} ${circumference}`}
              strokeDashoffset={-directionOrder.indexOf(holdingDirection as keyof DirectionState) * segmentLength}
              strokeLinecap="round"
              className="transition-all duration-100"
            />
          )}
        </svg>

        <div 
          className="absolute rounded-full overflow-hidden border-4 transition-all duration-300"
          style={{
            top: 40,
            left: 40,
            right: 40,
            bottom: 40,
            borderColor: faceDetected 
              ? verificationComplete 
                ? '#22c55e' 
                : holdingDirection
                  ? '#3b82f6'
                  : '#22d3ee'
              : '#ef4444',
            boxShadow: faceDetected 
              ? verificationComplete
                ? '0 0 40px rgba(34, 197, 94, 0.5), inset 0 0 20px rgba(34, 197, 94, 0.2)'
                : '0 0 30px rgba(34, 211, 238, 0.4)'
              : '0 0 30px rgba(239, 68, 68, 0.4)',
          }}
        >
          {capturedPhoto ? (
            <img 
              src={capturedPhoto} 
              alt="Photo capturée" 
              className="w-full h-full object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              style={{ transform: 'scaleX(-1)' }}
            />
          )}
          
          {countdown !== null && countdown > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <span className="text-7xl font-bold text-white animate-ping">{countdown}</span>
            </div>
          )}
        </div>

        {segments.map((segment) => {
          const angle = (segment.rotation - 90) * (Math.PI / 180);
          const labelRadius = (size / 2) - 15;
          const x = size / 2 + labelRadius * Math.cos(angle);
          const y = size / 2 + labelRadius * Math.sin(angle);
          const isActive = directionOrder[currentStep] === segment.key && !segment.completed;
          
          return (
            <div
              key={`icon-${segment.key}`}
              className={`absolute transition-all duration-300 ${
                segment.completed 
                  ? 'text-green-400 scale-110' 
                  : isActive 
                    ? 'text-yellow-400 animate-pulse scale-125' 
                    : 'text-slate-500'
              }`}
              style={{
                left: x,
                top: y,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {segment.completed ? (
                <CheckCircle size={28} />
              ) : (
                directionLabels[segment.key].icon
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-800 rounded-xl border border-red-500/30">
        <AlertCircle className="text-red-400 mb-4" size={48} />
        <p className="text-red-400 text-center mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg transition font-semibold"
          data-testid="button-retry"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-8 bg-gradient-to-br from-slate-800 via-slate-850 to-slate-900 rounded-2xl border border-slate-700 shadow-2xl max-w-md mx-auto">
      <div className="flex items-center justify-between w-full mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 rounded-lg">
            <Camera className="text-cyan-400" size={24} />
          </div>
          Vérification d'identité
        </h2>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition"
            data-testid="button-cancel-verification"
          >
            <X size={24} />
          </button>
        )}
      </div>

      <div className="relative mb-6">
        {renderProgressCircle()}
        
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 rounded-full">
            <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
            <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="text-slate-400 text-sm mt-2">{loadingProgress}%</p>
          </div>
        )}
      </div>

      <div className="w-full mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-400">Étape {Math.min(currentStep + 1, 4)} / 4</span>
          <span className="text-cyan-400 font-semibold">{Math.round(progress)}%</span>
        </div>
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-green-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div 
        className={`text-center py-4 px-6 rounded-xl mb-4 transition-all duration-300 w-full ${
          verificationComplete 
            ? 'bg-green-500/20 border-2 border-green-500/50' 
            : holdingDirection
              ? 'bg-blue-500/20 border-2 border-blue-500/50'
              : 'bg-slate-700/50 border border-slate-600'
        }`}
      >
        <p className={`font-semibold text-lg ${
          verificationComplete 
            ? 'text-green-400' 
            : holdingDirection
              ? 'text-blue-400'
              : 'text-white'
        }`}>
          {holdingDirection ? 'Maintenez la position...' : instruction}
        </p>
        {holdingDirection && (
          <div className="mt-2 h-1.5 bg-slate-600 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-100"
              style={{ width: `${holdProgress}%` }}
            />
          </div>
        )}
      </div>

      {verificationComplete && (
        <div className="flex items-center gap-3 text-green-400 bg-green-500/10 px-6 py-3 rounded-xl border border-green-500/30">
          <CheckCircle size={28} className="animate-bounce" />
          <span className="font-bold text-lg">Identité vérifiée !</span>
        </div>
      )}

      {!verificationComplete && currentStep > 0 && (
        <button
          onClick={reset}
          className="mt-4 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition flex items-center gap-2 font-semibold"
          data-testid="button-reset-verification"
        >
          <RotateCcw size={18} />
          Recommencer
        </button>
      )}

      <canvas ref={canvasRef} className="hidden" />

      <div className="mt-6 text-sm text-slate-500 text-center max-w-xs">
        <p>Tournez lentement la tête et maintenez chaque position jusqu'à ce que le segment se remplisse.</p>
      </div>
    </div>
  );
}
