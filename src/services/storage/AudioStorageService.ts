/**
 * Store raw audio for transcription audit (S3 when configured, local disk fallback).
 */
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config';
import { logger } from '../../config/logger';

const LOCAL_AUDIO_DIR = path.join(process.cwd(), 'uploads', 'transcription-audio');

export class AudioStorageService {
  async storeAudio(buffer: Buffer, interviewId?: string): Promise<string> {
    const key = `${interviewId ?? 'unknown'}/${Date.now()}_${uuidv4()}.wav`;

    if (config.storage.endpoint && config.storage.accessKey && config.storage.bucket) {
      try {
        return await this.storeToS3(key, buffer);
      } catch (e) {
        logger.warn('S3 upload failed, falling back to local storage', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return this.storeLocally(key, buffer);
  }

  private async storeLocally(key: string, buffer: Buffer): Promise<string> {
    const fullPath = path.join(LOCAL_AUDIO_DIR, key);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);
    return `local://${key}`;
  }

  private async storeToS3(key: string, buffer: Buffer): Promise<string> {
    // Minimal S3-compatible PUT via fetch (works with R2, MinIO, etc.)
    const endpoint = config.storage.endpoint!.replace(/\/$/, '');
    const bucket = config.storage.bucket!;
    const url = `${endpoint}/${bucket}/${key}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(buffer.length),
        Authorization: `Bearer ${config.storage.accessKey}`,
      },
      body: new Uint8Array(buffer),
    });

    if (!res.ok) {
      throw new Error(`S3 upload failed: ${res.status} ${res.statusText}`);
    }
    return `s3://${bucket}/${key}`;
  }
}

export const audioStorageService = new AudioStorageService();
