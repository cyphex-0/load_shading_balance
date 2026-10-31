import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export interface StorageObjectMetadata {
  exists: boolean;
  sizeBytes: number;
  contentType: string;
  checksum?: string;
}

export interface SignedUploadUrlResult {
  uploadUrl: string;
  key: string;
  headers?: Record<string, string>;
}

export interface ObjectStorageProvider {
  generateUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds?: number
  ): Promise<SignedUploadUrlResult>;
  verifyObject(key: string): Promise<StorageObjectMetadata>;
  generateDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  putObject(key: string, data: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  deleteObject(key: string): Promise<void>;
  validateToken(key: string, token: string, expiresTimestamp: number): boolean;
}

/**
 * In-memory & local disk simulated storage provider with HMAC token validation.
 * Used for development and test execution without cloud vendor lock-in.
 */
export class SimulatedStorageProvider implements ObjectStorageProvider {
  private objects: Map<
    string,
    { buffer: Buffer; contentType: string; size: number; checksum: string; createdAt: number }
  > = new Map();
  private secret: string;

  constructor(secret?: string) {
    this.secret = secret || config.authSecret || 'simulated-storage-secret-key-32-chars';
  }

  private generateToken(key: string, expiresTimestamp: number): string {
    const payload = `${key}:${expiresTimestamp}`;
    return crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  validateToken(key: string, token: string, expiresTimestamp: number): boolean {
    if (Date.now() > expiresTimestamp) {
      return false; // Expired
    }
    const expected = this.generateToken(key, expiresTimestamp);
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  }

  async generateUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number = 300
  ): Promise<SignedUploadUrlResult> {
    const expiresTimestamp = Date.now() + expiresInSeconds * 1000;
    const token = this.generateToken(key, expiresTimestamp);
    const uploadUrl = `/api/v1/storage/upload?key=${encodeURIComponent(key)}&token=${token}&expires=${expiresTimestamp}`;

    return {
      uploadUrl,
      key,
      headers: {
        'Content-Type': contentType
      }
    };
  }

  async verifyObject(key: string): Promise<StorageObjectMetadata> {
    // 1. Check in-memory store
    const item = this.objects.get(key);
    if (item) {
      return {
        exists: true,
        sizeBytes: item.size,
        contentType: item.contentType,
        checksum: item.checksum
      };
    }

    // 2. Fallback check local filesystem
    const diskPath = path.resolve(config.upload.directory, key.replace(/^repair-photos\//, ''));
    if (fs.existsSync(diskPath)) {
      const stats = fs.statSync(diskPath);
      const ext = path.extname(diskPath).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
      const fileBuffer = fs.readFileSync(diskPath);
      const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      return {
        exists: true,
        sizeBytes: stats.size,
        contentType,
        checksum
      };
    }

    return {
      exists: false,
      sizeBytes: 0,
      contentType: ''
    };
  }

  async generateDownloadUrl(
    key: string,
    expiresInSeconds: number = 900
  ): Promise<string> {
    const expiresTimestamp = Date.now() + expiresInSeconds * 1000;
    const token = this.generateToken(key, expiresTimestamp);
    return `/api/v1/storage/download?key=${encodeURIComponent(key)}&token=${token}&expires=${expiresTimestamp}`;
  }

  async putObject(key: string, data: Buffer, contentType: string): Promise<void> {
    const checksum = crypto.createHash('sha256').update(data).digest('hex');
    this.objects.set(key, {
      buffer: data,
      contentType,
      size: data.length,
      checksum,
      createdAt: Date.now()
    });

    // Mirror to local disk directory if configured
    try {
      const targetDir = config.upload.directory;
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const fileName = path.basename(key);
      const diskPath = path.join(targetDir, fileName);
      fs.writeFileSync(diskPath, data);
    } catch (e: any) {
      logger.warn(`Failed to mirror object ${key} to disk: ${e.message}`);
    }
  }

  async getObject(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const item = this.objects.get(key);
    if (item) {
      return { data: item.buffer, contentType: item.contentType };
    }

    const diskPath = path.resolve(config.upload.directory, key.replace(/^repair-photos\//, ''));
    if (fs.existsSync(diskPath)) {
      const ext = path.extname(diskPath).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
      return { data: fs.readFileSync(diskPath), contentType };
    }

    return null;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  clear(): void {
    this.objects.clear();
  }
}

let storageProviderInstance: ObjectStorageProvider | null = null;

export const getStorageProvider = (): ObjectStorageProvider => {
  if (!storageProviderInstance) {
    storageProviderInstance = new SimulatedStorageProvider();
  }
  return storageProviderInstance;
};
