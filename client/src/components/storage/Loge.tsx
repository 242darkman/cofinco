import React, { useState } from 'react';
import { useLoge, Document } from '@/hooks/useLoge';
import LogeLockScreen from '@/components/shared/storage/LogeLockScreen';
import LogeHeader from '@/components/shared/storage/LogeHeader';
import LogeStats from '@/components/shared/storage/LogeStats';
import LogeSidebar from '@/components/shared/storage/LogeSidebar';
import FileBrowser from '@/components/shared/storage/FileBrowser';
import NewFolderModal from '@/components/shared/storage/NewFolderModal';
import UploadModal from '@/components/shared/storage/UploadModal';
import FileDetailsModal from '@/components/shared/storage/FileDetailsModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function Loge() {
  const {
    documents, stats, loading, currentPath, currentParentId, selectedCategory,
    viewMode, searchQuery, isLocked, password, authError, isAuthenticating,
    showNewFolderModal, newFolderName, selectedDoc, showUploadModal, isUploading, progress,
    
    setDocuments, setStats, setLoading, setCurrentPath, setCurrentParentId, 
    setSelectedCategory, setViewMode, setSearchQuery, setIsLocked, setPassword, 
    handleUnlock, handleLock, createFolder, deleteDocument, openFolder, 
    navigateToRoot, navigateToPath, refresh, handleFileUpload,
    setShowNewFolderModal, setNewFolderName, setSelectedDoc, setShowUploadModal,
    filteredDocuments
  } = useLoge();

  const [docToDelete, setDocToDelete] = useState<Document | null>(null);

  const handleSelectCategory = (id: string | null) => {
    setSelectedCategory(id);
    setCurrentParentId(null);
    setCurrentPath([]);
  };

  const handleDeleteClick = (doc: Document) => {
    setDocToDelete(doc);
  };

  const handleConfirmDelete = async () => {
    if (docToDelete) {
      await deleteDocument(docToDelete.id);
      setDocToDelete(null);
    }
  };

  if (isLocked) {
    return (
      <LogeLockScreen
        password={password}
        setPassword={setPassword}
        handleUnlock={handleUnlock}
        authError={authError}
        isAuthenticating={isAuthenticating}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      <LogeHeader
        onLock={handleLock}
        onUpload={() => setShowUploadModal(true)}
        onNewFolder={() => setShowNewFolderModal(true)}
      />

      <LogeStats stats={stats} />

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 shrink-0">
          <LogeSidebar
            selectedCategory={selectedCategory}
            onSelectCategory={handleSelectCategory}
            stats={stats}
          />
        </div>

        <div className="flex-1 min-w-0">
          <FileBrowser
            documents={filteredDocuments}
            loading={loading}
            viewMode={viewMode}
            setViewMode={setViewMode}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            currentPath={currentPath}
            navigateToRoot={navigateToRoot}
            navigateToPath={navigateToPath}
            onRefresh={refresh}
            onOpenFolder={openFolder}
            onSelectDoc={setSelectedDoc}
            onDeleteDoc={handleDeleteClick}
          />
        </div>
      </div>

      <NewFolderModal
        isOpen={showNewFolderModal}
        onClose={() => setShowNewFolderModal(false)}
        folderName={newFolderName}
        setFolderName={setNewFolderName}
        onCreate={createFolder}
      />

      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleFileUpload}
        isUploading={isUploading}
        progress={progress}
      />

      <FileDetailsModal
        document={selectedDoc}
        onClose={() => setSelectedDoc(null)}
      />

      <ConfirmDialog
        isOpen={!!docToDelete}
        onClose={() => setDocToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Supprimer le document ?"
        message={`Êtes-vous sûr de vouloir supprimer "${docToDelete?.nom}" ? Cette action est irréversible.`}
        variant="danger"
        confirmText="Supprimer"
      />
    </div>
  );
}
