import { getDocument as readPDF, version as pdfJsVersion } from 'pdfjs-dist';
import type { DocumentInitParameters } from 'pdfjs-dist/types/src/display/api';

// Debug configuration
const DEBUG = process.env.NODE_ENV !== 'production';

// Logging utility
const log = {
  debug: (...args: any[]) => DEBUG && console.log('[PDF Utility Debug]', ...args),
  error: (...args: any[]) => console.error('[PDF Utility Error]', ...args),
  timing: (label: string, startTime: number) => DEBUG && 
    console.log(`[PDF Utility Timing] ${label}: ${Date.now() - startTime}ms`)
};

// Configure PDF.js for Node.js environment
// This prevents the worker error in Next.js server environment
if (typeof window === 'undefined') {
  // Use dynamic import for server environment
  // The GlobalWorkerOptions is available directly from the main package
  import('pdfjs-dist').then(pdfjs => {
    if (pdfjs.GlobalWorkerOptions) {
      // Set a dummy worker source for server-side
      pdfjs.GlobalWorkerOptions.workerSrc = '';
    }
  }).catch(err => {
    log.error('Error loading PDF.js in server environment:', err);
  });
}

interface PDFExtractOptions {
  maxPages?: number;
  pageNumbers?: number[];
  password?: string;
}

interface PDFExtractResult {
  text: string;
  numPages?: number;
  info?: any;
  metadata?: any;
}

// Type definitions for pdfjs-dist
type PdfDocument = Awaited<ReturnType<Awaited<typeof readPDF>>['promise']>;
type PdfPage = Awaited<ReturnType<Awaited<PdfDocument['getPage']>>>;
type PdfTextContent = Awaited<ReturnType<PdfPage['getTextContent']>>;

// Helper function to parse text content from PDF
const parseText = (textContent: PdfTextContent) => {
  let lastY = undefined;
  const text = [];
  for (const item of textContent.items) {
    if ('str' in item) {
      if (lastY == item.transform[5] || !lastY) {
        text.push(item.str);
      } else {
        text.push(`\n${item.str}`);
      }
      lastY = item.transform[5];
    }
  }
  return text.join('');
};

/**
 * Extracts text content from a PDF buffer
 * @param pdfBuffer - The PDF file as a buffer
 * @param options - Options for PDF extraction
 * @returns The extracted text and metadata
 */
export async function extractTextFromPDF(
  pdfBuffer: Buffer | ArrayBuffer, 
  options: PDFExtractOptions = {}
): Promise<PDFExtractResult> {
  const startTime = Date.now();
  log.debug('Starting PDF text extraction');
  
  try {
    // Prepare the data as ArrayBuffer
    const data = pdfBuffer instanceof Buffer 
      ? pdfBuffer.buffer.slice(
          pdfBuffer.byteOffset, 
          pdfBuffer.byteOffset + pdfBuffer.byteLength
        ) 
      : pdfBuffer;
    
    // Parse PDF with options
    const params: DocumentInitParameters = { 
      data,
      password: options.password,
      isEvalSupported: false,
      useWorkerFetch: false,  // Disable worker fetch to prevent issues in Next.js
      disableAutoFetch: true, // Disable auto fetch
      disableStream: true     // Disable streaming for better reliability in Node.js
    };
    
    const document = await readPDF(params).promise;
    const { info, metadata } = await document
      .getMetadata()
      .catch(() => ({ info: null, metadata: null }));
    
    // Extract text from pages
    const pages = [];
    let pagesToRead = document.numPages;
    
    if (options.maxPages && options.maxPages < document.numPages) {
      pagesToRead = options.maxPages;
    }
    
    // If specific page numbers are requested
    if (options.pageNumbers && options.pageNumbers.length) {
      for (const pageNum of options.pageNumbers) {
        if (pageNum > 0 && pageNum <= document.numPages) {
          const page = await document.getPage(pageNum);
          const text = await page.getTextContent().then(parseText);
          pages.push(text);
        }
      }
    } else {
      // Otherwise read up to maxPages
      for (let i = 1; i <= pagesToRead; i++) {
        const page = await document.getPage(i);
        const text = await page.getTextContent().then(parseText);
        pages.push(text);
      }
    }
    
    const text = pages.join('\n\n');
    
    log.debug(`Extracted ${text.length} characters from PDF`);
    log.timing('PDF extraction', startTime);
    
    return {
      text,
      numPages: document.numPages,
      info,
      metadata: metadata?.getAll()
    };
  } catch (error) {
    log.error('Error parsing PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}