import { promises as fs } from 'fs';
import path from 'path';

const DOCUMENTS_DIR = path.join(process.cwd(), 'public', 'documents');

export async function ensureDocumentsDir(): Promise<void> {
  try {
    await fs.access(DOCUMENTS_DIR);
  } catch {
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
  }
}

export async function storeDocument(
  file: Buffer,
  filename: string,
  employeeId: string
): Promise<string> {
  await ensureDocumentsDir();
  
  const employeeDir = path.join(DOCUMENTS_DIR, employeeId);
  await fs.mkdir(employeeDir, { recursive: true });
  
  // Sanitize filename
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = path.join(employeeDir, sanitizedFilename);
  
  await fs.writeFile(filePath, file);
  
  // Return relative path from public directory
  return `/documents/${employeeId}/${sanitizedFilename}`;
}

export function getDocumentPath(documentUrl: string): string {
  // documentUrl should be like /documents/{employeeId}/{filename}
  if (!documentUrl.startsWith('/documents/')) {
    throw new Error('Invalid document URL');
  }
  return path.join(process.cwd(), 'public', documentUrl);
}

export async function deleteDocument(documentUrl: string): Promise<void> {
  const filePath = getDocumentPath(documentUrl);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // File might not exist, ignore error
    console.warn('Failed to delete document:', filePath, error);
  }
}

export async function documentExists(documentUrl: string): Promise<boolean> {
  try {
    const filePath = getDocumentPath(documentUrl);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}


