import React, { useMemo } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import { log } from '../lib/logger';

// Import popular languages including CUDA and more
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import scala from 'highlight.js/lib/languages/scala';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import nginx from 'highlight.js/lib/languages/nginx';
import r from 'highlight.js/lib/languages/r';
import matlab from 'highlight.js/lib/languages/matlab';
import lua from 'highlight.js/lib/languages/lua';
import perl from 'highlight.js/lib/languages/perl';
import dart from 'highlight.js/lib/languages/dart';
import elixir from 'highlight.js/lib/languages/elixir';
import erlang from 'highlight.js/lib/languages/erlang';
import haskell from 'highlight.js/lib/languages/haskell';
import ocaml from 'highlight.js/lib/languages/ocaml';
import clojure from 'highlight.js/lib/languages/clojure';
import lisp from 'highlight.js/lib/languages/lisp';
import scheme from 'highlight.js/lib/languages/scheme';
import julia from 'highlight.js/lib/languages/julia';
import fortran from 'highlight.js/lib/languages/fortran';
import verilog from 'highlight.js/lib/languages/verilog';
import vhdl from 'highlight.js/lib/languages/vhdl';
import groovy from 'highlight.js/lib/languages/groovy';
import protobuf from 'highlight.js/lib/languages/protobuf';
import ini from 'highlight.js/lib/languages/ini';
import makefile from 'highlight.js/lib/languages/makefile';
import cmake from 'highlight.js/lib/languages/cmake';
import powershell from 'highlight.js/lib/languages/powershell';
import vim from 'highlight.js/lib/languages/vim';

// Register all languages with common aliases
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
hljs.registerLanguage('cuda', cpp); // CUDA uses C++ syntax
hljs.registerLanguage('cu', cpp); // CUDA file extension
hljs.registerLanguage('c', c);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('golang', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('php', php);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rb', ruby);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('kt', kotlin);
hljs.registerLanguage('scala', scala);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('zsh', shell);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('sass', scss);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('docker', dockerfile);
hljs.registerLanguage('nginx', nginx);
hljs.registerLanguage('r', r);
hljs.registerLanguage('matlab', matlab);
hljs.registerLanguage('lua', lua);
hljs.registerLanguage('perl', perl);
hljs.registerLanguage('pl', perl);
hljs.registerLanguage('dart', dart);
hljs.registerLanguage('elixir', elixir);
hljs.registerLanguage('ex', elixir);
hljs.registerLanguage('erlang', erlang);
hljs.registerLanguage('erl', erlang);
hljs.registerLanguage('haskell', haskell);
hljs.registerLanguage('hs', haskell);
hljs.registerLanguage('ocaml', ocaml);
hljs.registerLanguage('ml', ocaml);
hljs.registerLanguage('clojure', clojure);
hljs.registerLanguage('clj', clojure);
hljs.registerLanguage('lisp', lisp);
hljs.registerLanguage('scheme', scheme);
hljs.registerLanguage('scm', scheme);
hljs.registerLanguage('julia', julia);
hljs.registerLanguage('jl', julia);
hljs.registerLanguage('fortran', fortran);
hljs.registerLanguage('f90', fortran);
hljs.registerLanguage('verilog', verilog);
hljs.registerLanguage('v', verilog);
hljs.registerLanguage('vhdl', vhdl);
hljs.registerLanguage('groovy', groovy);
hljs.registerLanguage('protobuf', protobuf);
hljs.registerLanguage('proto', protobuf);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('makefile', makefile);
hljs.registerLanguage('make', makefile);
hljs.registerLanguage('cmake', cmake);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('ps1', powershell);
hljs.registerLanguage('vim', vim);
hljs.registerLanguage('viml', vim);

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Custom renderer for code blocks with syntax highlighting
const renderer = new marked.Renderer();

// marked v13+ uses token-based API
// Render code blocks as plain, clean, prettified text
(renderer as any).code = function (token: any): string {
  // Extract properties from token object (marked v13+ API)
  const codeStr = token.text || '';
  const lang = token.lang || '';

  log.debug('MarkdownRenderer', 'Code block token:', {
    lang,
    textLength: codeStr.length,
    textPreview: codeStr.substring(0, 100),
  });

  let highlighted: string;

  try {
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(codeStr, { language: lang }).value;
    } else {
      highlighted = hljs.highlightAuto(codeStr).value;
    }
  } catch (error) {
    log.error('MarkdownRenderer', 'Highlight error:', error);
    // Fallback to plain text if highlighting fails
    highlighted = codeStr;
  }

  // Return simple pre/code without fancy wrapper - clean and prettified
  return `<pre><code class="hljs">${highlighted}</code></pre>`;
};

// marked v13+ uses token-based API for inline code too
(renderer as any).codespan = function (token: any): string {
  const text = token.text || '';
  return `<code>${text}</code>`;
};

marked.use({ renderer });

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const html = useMemo(() => {
    if (!content) return '';
    try {
      const parsed = marked.parse(content) as string;
      log.debug('MarkdownRenderer', 'Parsed markdown:', {
        inputLength: content.length,
        inputPreview: content.substring(0, 100),
        outputLength: parsed.length,
        outputPreview: parsed.substring(0, 200),
      });
      return parsed;
    } catch (error) {
      log.error('MarkdownRenderer', 'Parse error:', error);
      return content;
    }
  }, [content]);

  return (
    <div
      className={`markdown ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
