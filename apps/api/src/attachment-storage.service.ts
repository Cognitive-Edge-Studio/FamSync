import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { StorageApiError, StorageClient } from "@supabase/storage-js";
import {createHash} from 'node:crypto';

export const maxAttachmentBytes = 5 * 1024 * 1024;
const bucketName = "famsync-attachments";
const downloadLifetime = 60;

@Injectable()
export class AttachmentStorageService {
  private readonly logger = new Logger(AttachmentStorageService.name);
  private readonly storage?: StorageClient;
  private ready?: Promise<void>;

  constructor() {
    const url = process.env.SUPABASE_STORAGE_URL;
    const key = process.env.SUPABASE_STORAGE_KEY;
    if (!url || !key) return;
    const headers: Record<string, string> = { apikey: key };
    if (!key.startsWith("sb_secret_")) headers.Authorization = "Bearer " + key;
    this.storage = new StorageClient(url.replace(/\/$/, ""), headers,
      (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }));
  }

  private async bucket() {
    if (!this.storage) throw new ServiceUnavailableException("Attachment storage is temporarily unavailable.");
    this.ready ??= this.prepare(this.storage).catch(() => {
      this.ready = undefined;
      throw new ServiceUnavailableException("Attachment storage is temporarily unavailable.");
    });
    await this.ready;
    return this.storage.from(bucketName);
  }

  private async prepare(storage: StorageClient) {
    const existing = await storage.getBucket(bucketName);
    if (existing.data) {
      if (existing.data.public) throw new Error("The attachment bucket must be private.");
      return;
    }
    if (!(existing.error instanceof StorageApiError) || existing.error.statusCode !== "404") throw existing.error;
    const created = await storage.createBucket(bucketName, { public: false, fileSizeLimit: maxAttachmentBytes });
    if (created.error) {
      const retried = await storage.getBucket(bucketName);
      if (!retried.data || retried.data.public) throw created.error;
    }
  }

  async upload(key: string, file: Buffer) {
    const bucket = await this.bucket();
    const { error } = await bucket.upload(key, file, {
      contentType: "application/octet-stream", cacheControl: "0", upsert: false,
    });
    if (error) throw new ServiceUnavailableException("We couldn’t save the attachment. Try again.");
  }

  async discard(key: string) {
    try {
      const bucket = await this.bucket();
      const { error } = await bucket.remove([key]);
      if (error) throw error;
    } catch {
      this.logger.warn("An incomplete attachment upload could not be removed.");
    }
  }

  async download(key: string, fileName: string) {
    const bucket = await this.bucket();
    const { data } = await bucket.createSignedUrl(key, downloadLifetime);
    if (!data) throw new ServiceUnavailableException("We couldn’t open the attachment. Try again.");
    const url = new URL(data.signedUrl);
    url.searchParams.set("download", fileName);
    return { url: url.href };
  }

  async uploadFile(key:string,bytes:Buffer,mime:string,hash:string){
    const bucket=await this.bucket(),result=await bucket.upload(key,bytes,{contentType:mime,cacheControl:'0',upsert:false});
    if(!result.error)return;
    if(/already exists|duplicate/i.test(result.error.message)){
      const saved=await bucket.download(key);
      if(saved.data&&createHash('sha256').update(Buffer.from(await saved.data.arrayBuffer())).digest('hex')===hash)return;
    }
    throw new ServiceUnavailableException('We couldn’t save the file. Retry the same selected file.');
  }
  async removeFile(key:string){const bucket=await this.bucket();const {error}=await bucket.remove([key]);if(error)throw new ServiceUnavailableException('Incomplete file cleanup could not finish.');}
  async readFile(key:string){const bucket=await this.bucket();const {data}=await bucket.download(key);if(!data)throw new ServiceUnavailableException('We couldn’t read this file. Try again.');return Buffer.from(await data.arrayBuffer());}
  async openFile(key:string,fileName:string,inline=false){const bucket=await this.bucket();const {data}=await bucket.createSignedUrl(key,downloadLifetime);if(!data)throw new ServiceUnavailableException('We couldn’t open this file. Try again.');const url=new URL(data.signedUrl);if(!inline)url.searchParams.set('download',fileName);return{url:url.href,expiresAt:new Date(Date.now()+downloadLifetime*1000).toISOString(),fileName};}
}
