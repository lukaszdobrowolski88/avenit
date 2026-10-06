import React from 'react';
import { FileText, Inbox } from 'lucide-react';
import FileCard from './FileCard';
import { tr } from '../../../i18n';
import EmptyState from '../../../components/EmptyState';

export default function FileList({
  files,
  loading,
  onDownload,
  onDelete,
  onPreview,
  onRename,
  onShare,
  onMove,
  onDragStartFile,
  onDragEndFile,
  layout = 'list',
  sharedFileIds,
  editableFileIds,
  canDelete = false,
  getFileUrl,
  emptyMessage = tr('Brak plików w tym folderze')
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white/80 dark:bg-gray-800/80 border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-4 animate-pulse">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="flex-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return <EmptyState icon={Inbox} title={tr('Brak plików')} subtitle={emptyMessage} />;
  }

  return (
    <div className={layout === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-3'}>
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onDownload={onDownload}
          onDelete={onDelete}
          onPreview={onPreview}
          onRename={(editableFileIds && !editableFileIds.has(file.id)) ? undefined : onRename}
          onShare={onShare}
          onMove={onMove}
          onDragStartFile={onDragStartFile}
          onDragEndFile={onDragEndFile}
          layout={layout}
          isShared={sharedFileIds ? sharedFileIds.has(file.id) : false}
          canDelete={canDelete && (!editableFileIds || editableFileIds.has(file.id))}
          getFileUrl={getFileUrl}
        />
      ))}
    </div>
  );
}
