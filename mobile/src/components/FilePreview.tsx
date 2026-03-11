import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Pencil, Save, Loader2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { FilePreviewResultMessage } from '../../../shared/types';
import hljs from 'highlight.js/lib/core';

// Import popular languages
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c++', cpp);
hljs.registerLanguage('c', c);
hljs.registerLanguage('go', go);
hljs.registerLanguage('golang', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rb', ruby);
hljs.registerLanguage('php', php);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);

interface FilePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  preview: FilePreviewResultMessage | null;
  error: string | null;
  isLoading: boolean;
  mode: 'view' | 'edit';
  onSave?: (filePath: string, content: string) => void;
  onToggleMode?: () => void;
  saveResult?: { success: boolean; error?: string } | null;
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  isOpen,
  onClose,
  preview,
  error,
  isLoading,
  mode,
  onSave,
  onToggleMode,
  saveResult,
}) => {
  const [copied, setCopied] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [imageZoom, setImageZoom] = useState(1);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Sync edit content when preview changes or mode switches to edit
  useEffect(() => {
    if (preview && preview.encoding === 'utf8') {
      setEditContent(preview.content);
    }
  }, [preview]);

  // Reset zoom when a new image is loaded
  useEffect(() => {
    setImageZoom(1);
  }, [preview?.filePath]);

  const handleCopy = () => {
    if (!preview || preview.encoding !== 'utf8') return;
    navigator.clipboard.writeText(preview.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (!preview || !onSave) return;
    onSave(preview.filePath, editContent);
  };

  const isImage = preview?.mimeType.startsWith('image/');
  const isMarkdown = preview?.language === 'markdown';
  const isSvg = preview?.mimeType === 'image/svg+xml';

  // Highlight code helper
  const highlightCode = (code: string, language?: string): string => {
    try {
      const lang = language || '';
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  };

  // Syntax highlight the code content (for view mode)
  const highlightedCode = useMemo(() => {
    if (!preview || preview.encoding !== 'utf8' || isMarkdown || (isSvg && mode === 'view')) {
      return null;
    }
    return highlightCode(preview.content, preview.language);
  }, [preview, isMarkdown, isSvg, mode]);

  // Syntax highlight edit content (for edit mode overlay)
  const highlightedEditCode = useMemo(() => {
    if (!editContent || mode !== 'edit' || !preview) return null;
    return highlightCode(editContent, preview.language);
  }, [editContent, mode, preview?.language]);

  // Split content into lines for line numbers
  const viewLines = useMemo(() => {
    if (!highlightedCode) return [];
    return highlightedCode.split('\n');
  }, [highlightedCode]);

  const editLines = useMemo(() => {
    return editContent.split('\n');
  }, [editContent]);

  // Sync scroll between textarea and overlay
  const overlayRef = useRef<HTMLDivElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);

  const handleEditorScroll = () => {
    if (editorRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = editorRef.current.scrollTop;
      overlayRef.current.scrollLeft = editorRef.current.scrollLeft;
    }
    if (editorRef.current && lineNumberRef.current) {
      lineNumberRef.current.scrollTop = editorRef.current.scrollTop;
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[110] flex flex-col"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative flex flex-col h-full max-h-[95vh] mt-auto bg-card rounded-t-2xl shadow-2xl overflow-hidden"
            style={{ maxHeight: '95vh' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {preview?.fileName || 'Loading...'}
                </div>
                {preview && (
                  <div className="text-xs text-muted-foreground truncate">
                    {preview.filePath.replace(/^\/Users\/[^/]+\//, '~/')}
                    {preview.size > 0 && (
                      <span className="ml-2">
                        ({preview.size < 1024 ? `${preview.size}B` : preview.size < 1024 * 1024 ? `${(preview.size / 1024).toFixed(1)}KB` : `${(preview.size / 1024 / 1024).toFixed(1)}MB`})
                      </span>
                    )}
                    {preview.language && (
                      <span className="ml-2 px-1.5 py-0.5 bg-primary/10 rounded text-primary text-[10px]">
                        {preview.language}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Image zoom controls */}
                {isImage && !isLoading && (
                  <>
                    <button
                      onClick={() => setImageZoom(z => Math.max(0.25, z - 0.25))}
                      className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
                      title="Zoom out"
                    >
                      <ZoomOut className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(imageZoom * 100)}%</span>
                    <button
                      onClick={() => setImageZoom(z => Math.min(4, z + 0.25))}
                      className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
                      title="Zoom in"
                    >
                      <ZoomIn className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => setImageZoom(1)}
                      className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
                      title="Reset zoom"
                    >
                      <RotateCcw className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </>
                )}

                {/* Copy button (text files only) */}
                {preview && !isImage && !isLoading && mode === 'view' && (
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
                    title="Copy content"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                )}

                {/* Edit/View toggle */}
                {preview && !isImage && !isLoading && onToggleMode && (
                  <button
                    onClick={onToggleMode}
                    className={`p-1.5 rounded-lg transition-colors ${
                      mode === 'edit' ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-secondary/50 text-muted-foreground'
                    }`}
                    title={mode === 'edit' ? 'Switch to view' : 'Switch to edit'}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}

                {/* Save button (edit mode only) */}
                {mode === 'edit' && onSave && (
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors text-xs font-medium"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                )}

                {/* Close button */}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Save Result Message */}
            {saveResult && (
              <div className={`px-4 py-2 text-xs ${saveResult.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {saveResult.success ? 'File saved successfully' : `Error: ${saveResult.error}`}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-auto">
              {isLoading && (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {error && (
                <div className="p-4 text-sm text-red-400">
                  {error}
                </div>
              )}

              {preview && !isLoading && !error && (
                <>
                  {/* Image preview */}
                  {isImage && preview.encoding === 'base64' && (
                    <div className="flex items-center justify-center p-4 overflow-auto min-h-[200px]"
                      style={{ background: 'repeating-conic-gradient(#1a1a1a 0% 25%, #111 0% 50%) 50% / 20px 20px' }}
                    >
                      <img
                        src={`data:${preview.mimeType};base64,${preview.content}`}
                        alt={preview.fileName}
                        className="max-w-full transition-transform duration-200"
                        style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center' }}
                        draggable={false}
                      />
                    </div>
                  )}

                  {/* SVG inline (already text) */}
                  {isSvg && preview.encoding === 'utf8' && mode === 'view' && (
                    <div className="flex items-center justify-center p-4 overflow-auto min-h-[200px]"
                      style={{ background: 'repeating-conic-gradient(#1a1a1a 0% 25%, #111 0% 50%) 50% / 20px 20px' }}
                    >
                      <div
                        dangerouslySetInnerHTML={{ __html: preview.content }}
                        className="max-w-full transition-transform duration-200"
                        style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center' }}
                      />
                    </div>
                  )}

                  {/* Markdown preview */}
                  {isMarkdown && preview.encoding === 'utf8' && mode === 'view' && (
                    <div className="p-4">
                      <MarkdownRenderer content={preview.content} className="text-sm" />
                    </div>
                  )}

                  {/* Code preview (view mode) with line numbers */}
                  {!isImage && !isMarkdown && !(isSvg && mode === 'view') && preview.encoding === 'utf8' && mode === 'view' && (
                    <div className="flex bg-[var(--bg-tool)]">
                      {/* Line number gutter */}
                      <div className="flex-shrink-0 py-4 pr-0 pl-2 text-right select-none border-r border-border/20"
                        style={{ minWidth: `${Math.max(2, String(viewLines.length).length) * 0.6 + 1}rem` }}
                      >
                        {viewLines.map((_, i) => (
                          <div key={i} className="text-xs font-mono leading-relaxed text-muted-foreground/40 pr-2">
                            {i + 1}
                          </div>
                        ))}
                      </div>
                      {/* Code content */}
                      <div className="flex-1 overflow-x-auto py-4 pl-3 pr-4">
                        {viewLines.map((lineHtml, i) => (
                          <div key={i} className="text-xs font-mono leading-relaxed whitespace-pre">
                            <code className="hljs" dangerouslySetInnerHTML={{ __html: lineHtml || '\u200b' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Edit mode with syntax highlighting overlay and line numbers */}
                  {!isImage && preview.encoding === 'utf8' && mode === 'edit' && (
                    <div className="flex bg-[var(--bg-tool)] min-h-[60vh]">
                      {/* Line number gutter */}
                      <div
                        ref={lineNumberRef}
                        className="flex-shrink-0 py-4 pr-0 pl-2 text-right select-none border-r border-border/20 overflow-hidden"
                        style={{ minWidth: `${Math.max(2, String(editLines.length).length) * 0.6 + 1}rem` }}
                      >
                        {editLines.map((_, i) => (
                          <div key={i} className="text-xs font-mono leading-relaxed text-muted-foreground/40 pr-2">
                            {i + 1}
                          </div>
                        ))}
                      </div>
                      {/* Editor area with highlight overlay */}
                      <div className="flex-1 relative overflow-hidden">
                        {/* Highlighted code overlay (behind textarea) */}
                        <div
                          ref={overlayRef}
                          className="absolute inset-0 py-4 pl-3 pr-4 overflow-hidden pointer-events-none"
                          aria-hidden="true"
                        >
                          <pre className="text-xs font-mono leading-relaxed whitespace-pre m-0">
                            <code
                              className="hljs"
                              dangerouslySetInnerHTML={{ __html: (highlightedEditCode || editContent) + '\n' }}
                            />
                          </pre>
                        </div>
                        {/* Transparent textarea on top */}
                        <textarea
                          ref={editorRef}
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          onScroll={handleEditorScroll}
                          className="relative w-full h-full min-h-[60vh] py-4 pl-3 pr-4 bg-transparent text-xs font-mono leading-relaxed outline-none resize-none"
                          style={{ color: 'transparent', caretColor: 'var(--text-primary)' }}
                          spellCheck={false}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
