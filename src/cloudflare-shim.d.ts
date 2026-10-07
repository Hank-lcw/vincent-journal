interface D1Result<T = unknown> { results?: T[]; success: boolean; meta: { changes?: number; [key:string]: unknown }; error?: string; }
interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>;
}
interface D1Database { prepare(query:string):D1PreparedStatement; batch<T = unknown>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>; exec(query:string):Promise<any>; }
interface R2HTTPMetadata { contentType?: string; cacheControl?: string; contentDisposition?: string; contentEncoding?: string; contentLanguage?: string; expires?: Date; }
interface R2PutOptions { httpMetadata?: R2HTTPMetadata; customMetadata?: Record<string,string>; }
interface R2ObjectBody { body: ReadableStream; httpMetadata?: R2HTTPMetadata; customMetadata?: Record<string,string>; size:number; etag:string; httpEtag:string; writeHttpMetadata(headers:Headers):void; arrayBuffer():Promise<ArrayBuffer>; text():Promise<string>; blob():Promise<Blob>; }
interface R2Bucket { get(key:string):Promise<R2ObjectBody|null>; put(key:string,value:ReadableStream|ArrayBuffer|ArrayBufferView|string|Blob,options?:R2PutOptions):Promise<any>; delete(key:string|string[]):Promise<void>; }
interface Fetcher { fetch(input:Request|string,init?:RequestInit):Promise<Response>; }
interface ExecutionContext { waitUntil(promise:Promise<any>):void; passThroughOnException():void; }
interface ScheduledController { cron:string; scheduledTime:number; noRetry():void; }
