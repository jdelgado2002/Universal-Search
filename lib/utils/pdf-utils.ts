import pdfParse from 'pdf-parse';

// Debug configuration
const DEBUG = process.env.NODE_ENV !== 'production';

// Logging utility
const log = {
  debug: (...args: any[]) => DEBUG && console.log('[PDF Utility Debug]', ...args),
  error: (...args: any[]) => console.error('[PDF Utility Error]', ...args),
  timing: (label: string, startTime: number) => DEBUG && 
    console.log(`[PDF Utility Timing] ${label}: ${Date.now() - startTime}ms`)
};

/**
 * Extracts text content from a PDF buffer
 * @param pdfBuffer - The PDF file as a buffer
 * @returns The extracted text
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  const startTime = Date.now();
  log.debug('Starting PDF text extraction');
  
  try {
    const data = await pdfParse(pdfBuffer);
    log.debug(`Extracted ${data.text.length} characters from PDF`);
    log.timing('PDF extraction', startTime);
    return data.text;
  } catch (error) {
    log.error('Error parsing PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}