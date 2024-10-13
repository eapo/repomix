import path from 'node:path';
import strip from 'strip-comments';

interface FileManipulator {
  removeComments(content: string): string;
  removeEmptyLines(content: string): string;
}

const rtrimLines = (content: string): string => content.replace(/[ \t]+$/gm, '');

class BaseManipulator implements FileManipulator {
  removeComments(content: string): string {
    return content;
  }

  removeEmptyLines(content: string): string {
    return content
      .split('\n')
      .filter((line) => line.trim() !== '')
      .join('\n');
  }
}

class StripCommentsManipulator extends BaseManipulator {
  private language: string;

  constructor(language: string) {
    super();
    this.language = language;
  }

  removeComments(content: string): string {
    const result = strip(content, {
      language: this.language,
      preserveNewlines: true,
    });
    return rtrimLines(result);
  }
}

class PythonManipulator extends BaseManipulator {
  removeDocStrings(content: string): string {
    if (!content) return '';
    const lines = content.split('\n');

    let result = '';
    let buffer = '';
    let quoteType: '' | "'" | '"' = '';
    let tripleQuotes = 0;

    const sz = lines.length;
    for (let i = 0; i < sz; i++) {
      const line = lines[i] + (i !== sz - 1 ? '\n' : '');
      buffer += line;
      if (quoteType === '') {
        const indexSingle = line.search(/(?<![\"])(?<!\\)'''(?![\"])/g);
        const indexDouble = line.search(/(?<![\'])(?<!\\)"""(?![\'])/g);
        if (indexSingle !== -1 && (indexDouble === -1 || indexSingle < indexDouble)) {
          quoteType = "'";
        } else if (indexDouble !== -1 && (indexSingle === -1 || indexDouble < indexSingle)) {
          quoteType = '"';
        }
      }
      if (quoteType === "'") {
        tripleQuotes += (line.match(/(?<![\"])(?<!\\)'''(?!["])/g) || []).length;
      }
      if (quoteType === '"') {
        tripleQuotes += (line.match(/(?<![\'])(?<!\\)"""(?![\'])/g) || []).length;
      }

      if (tripleQuotes % 2 === 0) {
        buffer = buffer.replace(new RegExp(`${quoteType === '"' ? '"""' : "'''"}`, 'g'), '');
        result += buffer;
        buffer = '';
        tripleQuotes = 0;
        quoteType = '';
      }
    }

    result += buffer;
    return result;
  }

  removeHashComments(content: string): string {
    let result = '';
    const pairs: [number, number][] = [];
    let prevQuote = 0;
    while (prevQuote < content.length) {
      const openingQuote = content.slice(prevQuote + 1).search(/(?<!\\)(?:"|'|'''|""")/g) + prevQuote + 1;
      if (openingQuote === prevQuote) break;
      let closingQuote: number;
      if (content.startsWith('"""', openingQuote) || content.startsWith("'''", openingQuote)) {
        const quoteType = content.slice(openingQuote, openingQuote + 3);
        closingQuote = content.indexOf(quoteType, openingQuote + 3);
      } else {
        const quoteType = content[openingQuote];
        closingQuote = content.indexOf(quoteType, openingQuote + 1);
      }
      if (closingQuote === -1) break;
      pairs.push([openingQuote, closingQuote]);
      prevQuote = closingQuote;
    }
    let prevHash = 0;
    while (prevHash < content.length) {
      const hashIndex = content.slice(prevHash).search(/(?<!\\)#/g) + prevHash;
      if (hashIndex === prevHash - 1) {
        result += content.slice(prevHash);
        break;
      }
      const isInsideString = pairs.some(([start, end]) => hashIndex > start && hashIndex < end);
      const nextNewLine = content.indexOf('\n', hashIndex);
      if (!isInsideString) {
        if (nextNewLine === -1) {
          result += content.slice(prevHash);
          break;
        }
        result += `${content.slice(prevHash, hashIndex)}\n`;
      } else {
        if (nextNewLine === -1) {
          result += content.slice(prevHash);
          break;
        }
        result += `${content.slice(prevHash, nextNewLine)}\n`;
      }
      prevHash = nextNewLine + 1;
    }
    return result;
  }

  removeComments(content: string): string {
    let result = this.removeDocStrings(content);
    result = this.removeHashComments(result);
    return rtrimLines(result);
  }
}

const manipulators: Record<string, FileManipulator> = {};

const getOrCreateManipulator = (ext: string): FileManipulator => {
  if (!manipulators[ext]) {
    manipulators[ext] =
      ext === '.py' ? new PythonManipulator() : new StripCommentsManipulator('javascript');
  }
  return manipulators[ext];
};

export const getFileManipulator = (filePath: string): FileManipulator | null => {
  const ext = path.extname(filePath);
  return getOrCreateManipulator(ext) || null;
};
