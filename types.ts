export interface Song {
  id: string;
  title: string;
  url: string;
  artist?: string;
  originalFileName?: string; // New field to store actual filename for export
  path?: string; // New field to store the full path/string from the playlist file
  // Editing parameters
  trimStart?: number; // Seconds
  trimEnd?: number;   // Seconds
  hasFadeOut?: boolean;
  customGain?: number; // 0.0 to 1.0 (default 1.0)
  note?: string; // Director's note
}

export interface SfxItem {
  id: string;
  label: string;
  url: string;
  originalFileName?: string; // Stores the filename for saving/loading
  path?: string; // New field to store the full path
  color?: string; // Optional color for the button
  // Editing parameters matching Song
  trimStart?: number;
  trimEnd?: number;
  hasFadeOut?: boolean;
  customGain?: number;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
}

export type AppMode = 'editing' | 'presentation';

export type Language = 'it' | 'en';