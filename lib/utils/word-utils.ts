import mammoth from 'mammoth';

// Debug configuration
const DEBUG = process.env.NODE_ENV !== 'production';

// Logging utility
const log = {
  debug: (...args: any[]) => DEBUG && console.log('[Word Utility Debug]', ...args),
  error: (...args: any[]) => console.error('[Word Utility Error]', ...args),
  timing: (label: string, startTime: number) => DEBUG && 
    console.log(`[Word Utility Timing] ${label}: ${Date.now() - startTime}ms`)
};

/**
 * Extracts text content from a Word document buffer
 * @param buffer - The Word document as a buffer
 * @returns The extracted text
 */
export async function extractTextFromWord(buffer: Buffer): Promise<string> {
  const startTime = Date.now();
  log.debug('Starting Word document text extraction');
  
  try {
    const result = await mammoth.extractRawText({ buffer });
    log.debug(`Extracted ${result.value.length} characters from Word document`);
    log.timing('Word extraction', startTime);
    return result.value || '[No text content found in Word document]';
  } catch (error) {
    log.error('Error processing Word document:', error);
    throw new Error(`Failed to extract text from Word document: ${error instanceof Error ? error.message : String(error)}`);
  }
}
