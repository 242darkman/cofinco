import React, { useState, useCallback, useRef } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Upload, X, File, FileText, Image as ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { validateFileSize } from '../../lib/file-validation';

interface UploadedFile {
  file: File;
  preview?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress?: number;
  error?: string;
  url?: string;
}

interface FileUploadZoneProps {
  accept?: string;
  maxSize?: number; // in MB
  maxFiles?: number;
  onFilesSelected?: (files: File[]) => void;
  onUploadComplete?: (urls: string[]) => void;
  uploadFunction?: (file: File) => Promise<string>; // Returns URL
  className?: string;
  label?: string;
  hint?: string;
}

export function FileUploadZone({
  accept = '.pdf,.jpg,.jpeg,.png',
  maxSize = 5,
  maxFiles = 5,
  onFilesSelected,
  onUploadComplete,
  uploadFunction,
  className = '',
  label = 'Glissez vos documents ici',
  hint = 'ou cliquez pour parcourir'
}: FileUploadZoneProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return ImageIcon;
    if (file.type === 'application/pdf') return FileText;
    return File;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxSize * 1024 * 1024) {
      return `Le fichier dépasse la taille maximale de ${maxSize}MB`;
    }

    // Check file type
    const acceptedTypes = accept.split(',').map(t => t.trim());
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const mimeType = file.type;
    
    const isAccepted = acceptedTypes.some(type => {
      if (type.startsWith('.')) {
        return fileExtension === type.toLowerCase();
      }
      return mimeType.match(new RegExp(type.replace('*', '.*')));
    });

    if (!isAccepted) {
      return `Type de fichier non accepté. Formats acceptés: ${accept}`;
    }

    return null;
  };

  const createPreview = (file: File): Promise<string | undefined> => {
    return new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      } else {
        resolve(undefined);
      }
    });
  };

  const handleFiles = useCallback(async (newFiles: FileList | File[]) => {
    // Reject oversized files immediately (no preload)
    const fileArray = Array.from(newFiles).filter(f => validateFileSize(f, maxSize));
    if (fileArray.length === 0) return;

    // Check max files limit
    if (files.length + fileArray.length > maxFiles) {
      alert(`Vous ne pouvez télécharger que ${maxFiles} fichiers maximum`);
      return;
    }

    // Validate and prepare files (type check only, size already checked)
    const validatedFiles: UploadedFile[] = [];

    for (const file of fileArray) {
      const error = validateFile(file);
      const preview = await createPreview(file);

      validatedFiles.push({
        file,
        preview,
        status: error ? 'error' : 'pending',
        error: error || undefined
      });
    }

    setFiles(prev => [...prev, ...validatedFiles]);
    
    // Notify parent
    const validFiles = validatedFiles.filter(f => f.status === 'pending').map(f => f.file);
    if (validFiles.length > 0 && onFilesSelected) {
      onFilesSelected(validFiles);
    }

    // Auto-upload if function provided
    if (uploadFunction) {
      uploadFiles(validatedFiles.filter(f => f.status === 'pending'));
    }
  }, [files.length, maxFiles, onFilesSelected, uploadFunction]);

  const uploadFiles = async (filesToUpload: UploadedFile[]) => {
    const uploadedUrls: string[] = [];

    for (const uploadedFile of filesToUpload) {
      const index = files.findIndex(f => f.file === uploadedFile.file);
      
      // Update status to uploading
      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, status: 'uploading' as const, progress: 0 } : f
      ));

      try {
        // Simulate progress (in real scenario, use XMLHttpRequest or axios with progress)
        const progressInterval = setInterval(() => {
          setFiles(prev => prev.map((f, i) => 
            i === index && f.progress !== undefined && f.progress < 90
              ? { ...f, progress: f.progress + 10 }
              : f
          ));
        }, 200);

        const url = await uploadFunction!(uploadedFile.file);
        
        clearInterval(progressInterval);
        
        setFiles(prev => prev.map((f, i) => 
          i === index 
            ? { ...f, status: 'success' as const, progress: 100, url } 
            : f
        ));

        uploadedUrls.push(url);
      } catch (error) {
        setFiles(prev => prev.map((f, i) => 
          i === index 
            ? { ...f, status: 'error' as const, error: 'Échec du téléchargement' } 
            : f
        ));
      }
    }

    if (uploadedUrls.length > 0 && onUploadComplete) {
      onUploadComplete(uploadedUrls);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-all duration-200 ease-in-out
          ${isDragging
            ? 'border-accent bg-accent/10 scale-[1.02]'
            : 'border-edge-strong hover:border-accent/50 hover:bg-surface/50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={maxFiles > 1}
          accept={accept}
          onChange={handleFileInput}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          <div className={`
            p-4 rounded-full transition-colors
            ${isDragging ? 'bg-accent/20' : 'bg-surface-elevated/50'}
          `}>
            <Upload className={`w-8 h-8 ${isDragging ? 'text-accent' : 'text-content-muted'}`} />
          </div>
          
          <div>
            <p className="text-lg font-medium text-content-secondary">{label}</p>
            <p className="text-sm text-content-muted mt-1">{hint}</p>
          </div>

          <div className="text-xs text-content-muted space-y-1">
            <p>Formats acceptés: {accept.replace(/\./g, '').toUpperCase()}</p>
            <p>Taille max: {maxSize}MB par fichier • Max {maxFiles} fichiers</p>
          </div>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((uploadedFile, index) => {
            const FileIcon = getFileIcon(uploadedFile.file);
            
            return (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-surface/50 rounded-lg border border-edge"
              >
                {/* Preview or Icon */}
                <div className="flex-shrink-0">
                  {uploadedFile.preview ? (
                    <img
                      src={uploadedFile.preview}
                      alt={uploadedFile.file.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-surface-elevated rounded flex items-center justify-center">
                      <FileIcon className="w-6 h-6 text-content-muted" />
                    </div>
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-content-secondary truncate">
                    {uploadedFile.file.name}
                  </p>
                  <p className="text-xs text-content-muted">
                    {formatFileSize(uploadedFile.file.size)}
                  </p>

                  {/* Progress Bar */}
                  {uploadedFile.status === 'uploading' && uploadedFile.progress !== undefined && (
                    <div className="mt-2 w-full bg-surface-elevated rounded-full h-1.5">
                      <div
                        className="bg-accent h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${uploadedFile.progress}%` }}
                      />
                    </div>
                  )}

                  {/* Error Message */}
                  {uploadedFile.error && (
                    <p className="text-xs text-status-danger mt-1">{uploadedFile.error}</p>
                  )}
                </div>

                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {uploadedFile.status === 'uploading' && (
                    <Spinner size="sm" tone="accent" />
                  )}
                  {uploadedFile.status === 'success' && (
                    <CheckCircle2 className="w-5 h-5 text-status-success" />
                  )}
                  {uploadedFile.status === 'error' && (
                    <AlertCircle className="w-5 h-5 text-status-danger" />
                  )}
                  {uploadedFile.status === 'pending' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="p-1 hover:bg-surface-elevated rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-content-muted" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
