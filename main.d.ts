declare namespace CompressJS {
     export class Stream {
          readByte(): number
     
          read(buf: ByteArray, bufOffset: number, length: number): number
     
          eof(): boolean
     
          seek(pos: number): void
     
          tell(): void 
     
          writeByte(byte: number): void;
     }

     export class BitStream extends Stream {
          readBits(n: number): number
     
          writeBitns(n: number, value: number): void;
     }

     type ByteArray = Buffer | number[] | Uint8Array

     type CompressionLevels = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
     interface CompressionMethod {
          compressFile(input: ByteArray, output?: void | null, compressionLevel?: CompressionLevels | object): number[]
          compressFile(input: ByteArray, output?: { writeByte: Stream["writeByte"] }, compressionLevel?: CompressionLevels | object): void

          decompressFile(input: ByteArray, output?: void | null): ByteArray
          decompressFile(input: ByteArray, output?: { writeByte: Stream["writeByte"] }): void
     }

     export const BWTC: CompressionMethod;
     export const Bzip2: CompressionMethod;
     export const Dmc: CompressionMethod;
     export const Lzjb: CompressionMethod;
     export const LzjbR: CompressionMethod;
     export const Lzp3: CompressionMethod;
     export const PPM: CompressionMethod;
     export const Simple: CompressionMethod;

     interface ModelCoder {
          encode(symbol: Symbol, ctx?: any): void;
          decode(ctx?: any): Symbol;
          factory(params: any): (size: number) => this;
     }

     export const Context1Model: ModelCoder;
     export const DefSumModel: ModelCoder;
     export const FenwickModel: ModelCoder;
     export const MTFModel: ModelCoder;
     export const NoModel: ModelCoder;
     export const Huffman: ModelCoder;
     export const RangeCoder: ModelCoder;
}

export = CompressJS