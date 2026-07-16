import React from 'react';
import { Home, ChevronRight, Search, List, Grid, RefreshCw, Folder, Eye, Trash2 } from 'lucide-react';
import { Document, getFileIcon, formatFileSize } from '@/hooks/useLoge';
import EmptyState from '@/components/ui/EmptyState';
import SearchInput from '@/components/ui/SearchInput';
import IconButton from '@/components/ui/IconButton';
import { usePermissions } from '@/components/auth/ProtectedFeature';

interface FileBrowserProps {
  documents: Document[];
  loading: boolean;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  currentPath: string[];
  navigateToRoot: () => void;
  navigateToPath: (index: number) => void;
  onRefresh: () => void;
  onOpenFolder: (doc: Document) => void;
  onSelectDoc: (doc: Document) => void;
  onDeleteDoc: (doc: Document) => void;
}

export default function FileBrowser({
  documents, loading, viewMode, setViewMode, searchQuery, setSearchQuery,
  currentPath, navigateToRoot, navigateToPath, onRefresh,
  onOpenFolder, onSelectDoc, onDeleteDoc
}: FileBrowserProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canDeleteFiles = hasPermission('loge', 'delete') || hasPermission('documents', 'delete') || hasPermission('admin', 'manage');

  // Breadcrumb item rendering
  const renderBreadcrumbs = () => (
    <div className="flex items-center gap-2 text-sm overflow-x-auto whitespace-nowrap pb-2 md:pb-0 scrollbar-hide">
      <button onClick={navigateToRoot} className="text-status-info hover:underline flex items-center gap-1 shrink-0">
        <Home className="w-4 h-4" />
        Accueil
      </button>
      {currentPath.map((p, i) => (
        <React.Fragment key={i}>
          <ChevronRight className="w-4 h-4 text-content-muted shrink-0" />
          <button 
            onClick={() => navigateToPath(i)}
            className="text-status-info hover:underline shrink-0"
          >
            {p}
          </button>
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="bg-surface rounded-xl shadow-lg border border-edge flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-4 border-b border-edge flex flex-col md:flex-row gap-4 justify-between">
        {renderBreadcrumbs()}
        
        <div className="flex items-center gap-2 justify-end">
          <SearchInput 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            className="w-full md:w-64"
          />
          <IconButton
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            icon={viewMode === 'grid' ? List : Grid}
            variant="ghost"
            aria-label="Changer la vue"
          />
          <IconButton
            onClick={onRefresh}
            disabled={loading}
            icon={RefreshCw}
            className={loading ? 'animate-spin' : ''}
            variant="ghost"
            aria-label="Actualiser"
          />
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-accent animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={Folder}
            title="Aucun fichier dans ce dossier"
            description="Téléversez des fichiers ou créez un dossier"
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {documents.map(doc => {
              const FileIcon = doc.type === 'dossier' ? Folder : getFileIcon(doc.mimeType);
              return (
                <div
                  key={doc.id}
                  className="group bg-surface-muted-elevated/50 rounded-xl p-4 hover:bg-surface-muted-elevated transition cursor-pointer relative"
                  onDoubleClick={() => onOpenFolder(doc)}
                >
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition flex gap-1 z-10">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectDoc(doc); }}
                      className="p-1.5 bg-surface rounded-lg shadow hover:bg-surface-muted"
                    >
                      <Eye className="w-3.5 h-3.5 text-content-muted" />
                    </button>
                    {canDeleteFiles && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteDoc(doc); }}
                        className="p-1.5 bg-surface rounded-lg shadow hover:bg-status-danger-bg"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-status-danger" />
                      </button>
                    )}
                  </div>
                  <div className={`p-3 rounded-lg mb-3 flex justify-center ${doc.type === 'dossier' ? 'bg-status-warning-bg' : 'bg-status-info-bg'}`}>
                    <FileIcon className={`w-8 h-8 ${doc.type === 'dossier' ? 'text-status-warning' : 'text-status-info'}`} />
                  </div>
                  <p className="font-medium text-sm text-content-secondary truncate text-center">{doc.nom}</p>
                  <p className="text-xs text-content-muted mt-1 text-center">
                    {doc.type === 'dossier' ? 'Dossier' : formatFileSize(doc.taille || 0)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-edge">
            {documents.map(doc => {
              const FileIcon = doc.type === 'dossier' ? Folder : getFileIcon(doc.mimeType);
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 py-3 px-4 hover:bg-surface-muted-elevated/50 transition cursor-pointer group"
                  onDoubleClick={() => onOpenFolder(doc)}
                >
                  <div className={`p-2 rounded-lg ${doc.type === 'dossier' ? 'bg-status-warning-bg' : 'bg-status-info-bg'}`}>
                    <FileIcon className={`w-5 h-5 ${doc.type === 'dossier' ? 'text-status-warning' : 'text-status-info'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-content-secondary truncate">{doc.nom}</p>
                    <p className="text-xs text-content-muted">{doc.type === 'dossier' ? 'Dossier' : doc.mimeType}</p>
                  </div>
                  <p className="text-sm text-content-muted hidden sm:block">
                    {doc.type === 'dossier' ? '--' : formatFileSize(doc.taille || 0)}
                  </p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition sm:opacity-100">
                     <IconButton
                      onClick={(e) => { e.stopPropagation(); onSelectDoc(doc); }}
                      icon={Eye}
                      size="sm"
                      variant="ghost"
                      aria-label="Voir les détails"
                    />
                    {canDeleteFiles && (
                      <IconButton
                        onClick={(e) => { e.stopPropagation(); onDeleteDoc(doc); }}
                        icon={Trash2}
                        size="sm"
                        variant="ghost"
                        className="text-status-danger hover:text-status-danger hover:bg-status-danger-bg"
                        aria-label="Supprimer"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
