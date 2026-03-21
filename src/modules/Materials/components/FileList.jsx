import React from 'react';
import { FileText, Inbox } from 'lucide-react';
import FileCard from './FileCard';

export default function FileList({
  files,
  loading,
  onDownload,
  onDelete,
  onPreview,
  canDelete = false,
  getFileUrl,
  emptyMessage = 'Brak plików w tym folderze'
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
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center mb-4">
          <Inbox size={32} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Brak plików
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onDownload={onDownload}
          onDelete={onDelete}
          onPreview={onPreview}
          canDelete={canDelete}
          getFileUrl={getFileUrl}
        />
      ))}
    </div>
  );
}
