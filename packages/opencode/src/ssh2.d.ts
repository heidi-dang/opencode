declare module "ssh2" {
  import type { Writable } from "node:stream"

  export type ConnectConfig = {
    host?: string
    port?: number
    username?: string
    password?: string
    readyTimeout?: number
  }

  export interface ClientChannel extends Writable {
    stderr: Writable
    on(event: "close", listener: (code?: number) => void): this
    on(event: "data", listener: (chunk: Buffer | string) => void): this
  }

  export interface WriteStream extends Writable {
    on(event: "close", listener: () => void): this
    on(event: "error", listener: (err: Error) => void): this
  }

  export interface SFTPWrapper {
    createWriteStream(path: string, options?: { encoding?: string; mode?: number }): WriteStream
  }

  export class Client {
    on(event: "ready", listener: () => void): this
    on(event: "error", listener: (err: Error) => void): this
    connect(config: ConnectConfig): this
    exec(command: string, callback: (err: Error | undefined, stream: ClientChannel) => void): void
    sftp(callback: (err: Error | undefined, client: SFTPWrapper) => void): void
    end(): void
  }
}