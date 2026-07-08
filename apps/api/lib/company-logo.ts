import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createLogger } from './logger';

const logger = createLogger('CompanyLogo');

let _logoBuffer: Buffer | null | undefined;
let _logoBase64: string | null | undefined;

function loadLogo(): void {
  if (_logoBuffer !== undefined) return; // Already loaded (or failed)

  try {
    const logoPath = resolve(process.cwd(), 'apps/web/public/microflex-logo.png');
    _logoBuffer = readFileSync(logoPath);
    _logoBase64 = `data:image/png;base64,${_logoBuffer.toString('base64')}`;
  } catch {
    logger.warn('Company logo not found at apps/web/public/microflex-logo.png');
    _logoBuffer = null;
    _logoBase64 = null;
  }
}

/** Returns the company logo PNG as a Node.js Buffer, or null if unavailable. */
export function getLogoBuffer(): Buffer | null {
  loadLogo();
  return _logoBuffer ?? null;
}

/** Returns the company logo as a base64 data URI (for jsPDF), or null if unavailable. */
export function getLogoBase64(): string | null {
  loadLogo();
  return _logoBase64 ?? null;
}
