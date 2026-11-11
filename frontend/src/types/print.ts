// Session-only data. No browser storage or server upload is used by printing.
export interface CropRect { x: number; y: number; width: number; height: number }
export interface PrintPhoto {
  id: string;
  kind: 'photo';
  name: string;
  source: 'ocr' | 'print';
  original: string;
  output: string;
  width: number;
  height: number;
  crop: CropRect | null;
  rotation: number;
}
export interface PrintBlank { id: string; kind: 'blank'; size: number }
export type PrintItem = PrintPhoto | PrintBlank;
export interface PrintSettings {
  width: number; gap: number; margin: number;
  cut: boolean; caption: boolean; gray: boolean; blankLabel: boolean;
}
