
export interface Song {
  id: string;
  title: string;
  url: string;
  type?: 'audio' | 'separator'; // NEW: Distinguish audio from visual separators
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

// Estensione globale per Electron API
declare global {
  interface Window {
    electronAPI?: {
      saveDialog: (defaultName: string) => Promise<string | null>;
      selectFolder: () => Promise<string | null>; // NEW: Select Folder Dialog
      readFile: (path: string) => Promise<string>;
      writeFile: (path: string, content: string) => Promise<boolean>;
      copyFile: (src: string, dest: string) => Promise<boolean>; // NEW: Copy File
      createDir: (path: string) => Promise<boolean>; // NEW: Create Directory
      exists: (path: string) => Promise<boolean>;
      
      // SERVER API (V2.0)
      server: {
        start: (pin?: string) => Promise<{ ips: {name: string, address: string}[]; port: number } | null>;
        stop: () => Promise<boolean>;
        getIP: () => Promise<{name: string, address: string}[]>;
        send: (data: any) => Promise<void>;
        onClientMessage: (callback: (data: any) => void) => void;
        onClientStatus: (callback: (clients: any[]) => void) => void;
        kick: (clientId: string) => Promise<boolean>;
      };
    };
  }
}
