import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, UploadCloud, X } from 'lucide-react';
import { toast } from '../../../../lib/toast';
import { validateFileSize } from '../../../../lib/file-validation';

interface PhotoCaptureProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

export default function PhotoCapture({ file, onFileChange }: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreview(null);
    }
  }, [file]);

  useEffect(() => {
    return () => {
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    };
  }, [cameraStream]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showActions) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showActions]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    if (selected && !ACCEPTED_TYPES.includes(selected.type)) {
      toast.error('Format non supporté. Formats acceptés : JPG, PNG, WEBP');
      e.target.value = '';
      return;
    }
    if (selected && !validateFileSize(selected)) {
      e.target.value = '';
      return;
    }
    onFileChange(selected);
  };

  const openCamera = async () => {
    setCameraError(null);
    setShowCameraModal(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      setCameraStream(stream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.error);
        }
      }, 100);
    } catch (err: any) {
      setCameraError(
        err.name === 'NotAllowedError'
          ? "Accès à la caméra refusé. Veuillez autoriser l'accès dans les paramètres."
          : "Impossible d'accéder à la caméra. Essayez d'importer une photo."
      );
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          onFileChange(new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' }));
          closeCamera();
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setShowCameraModal(false);
    setCameraError(null);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {/* Circular avatar */}
      <div className="relative" ref={dropdownRef}>
        <div className={`w-28 h-28 rounded-full overflow-hidden border-2 transition-colors flex items-center justify-center ${
          file ? 'border-status-success/50 bg-surface-subtle' : 'border-edge-subtle bg-surface-subtle/50'
        }`}>
          {file && preview ? (
            <img src={preview} alt="Photo" className="w-full h-full object-cover" />
          ) : (
            <svg className="w-12 h-12 text-content-muted/30" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          )}
        </div>

        {/* Floating action button */}
        <button
          type="button"
          onClick={() => file ? onFileChange(null) : setShowActions(!showActions)}
          className={`absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all duration-200 ${
            file
              ? 'bg-status-danger text-white hover:scale-110'
              : 'bg-accent text-white hover:scale-110 hover:shadow-lg'
          }`}
        >
          {file ? <X size={14} /> : <Camera size={14} />}
        </button>

        {/* Action dropdown */}
        {showActions && !file && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full bg-surface-base border border-edge rounded-xl shadow-xl overflow-hidden min-w-[160px] z-20 animate-fade-in">
            <button
              type="button"
              onClick={() => { setShowActions(false); openCamera(); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-content-primary hover:bg-surface-subtle transition-colors"
            >
              <Camera size={14} className="text-accent" /> Prendre photo
            </button>
            <button
              type="button"
              onClick={() => { setShowActions(false); fileInputRef.current?.click(); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-content-primary hover:bg-surface-subtle transition-colors border-t border-edge-subtle"
            >
              <UploadCloud size={14} className="text-accent" /> Importer
            </button>
          </div>
        )}
      </div>

      <span className="text-[9px] text-content-muted">JPG, PNG, WEBP</span>

      {/* Camera Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-2">
          <div className="bg-surface-base rounded-2xl overflow-hidden max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-3 border-b border-edge flex items-center justify-between flex-shrink-0">
              <h3 className="text-content-primary font-bold text-sm">Prendre une photo</h3>
              <button onClick={closeCamera} className="text-content-muted hover:text-content-primary p-1"><X size={20} /></button>
            </div>
            <div className="relative aspect-[4/3] bg-black flex-shrink-0">
              {cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                  <Camera className="w-10 h-10 text-status-danger mb-3" />
                  <p className="text-status-danger text-xs mb-3">{cameraError}</p>
                  <button onClick={() => { closeCamera(); fileInputRef.current?.click(); }} className="px-3 py-2 bg-accent rounded-xl text-xs text-white font-medium">
                    Importer à la place
                  </button>
                </div>
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>
            {!cameraError && (
              <div className="p-4 flex justify-center flex-shrink-0">
                <button onClick={capturePhoto} className="w-14 h-14 bg-white rounded-full flex items-center justify-center hover:bg-surface-subtle active:scale-95 transition shadow-lg">
                  <div className="w-10 h-10 bg-accent rounded-full" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
