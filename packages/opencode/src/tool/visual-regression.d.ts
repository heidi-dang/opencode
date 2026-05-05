declare module "pngjs" {
  export class PNG {
    width: number
    height: number
    data: Buffer
    static sync: {
      read: (data: Buffer) => PNG
      write: (png: PNG, stream: NodeJS.WriteStream) => void
    }
  }
}
