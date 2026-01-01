
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.attozero.regiamusiche',
  appName: 'Regia Musiche Attozero',
  webDir: 'dist',
  backgroundColor: '#020617',
  // CONFIGURAZIONE CRITICA PER WEBSOCKET LOCALE
  server: {
    androidScheme: 'http', // Forza HTTP (invece di HTTPS) per permettere ws://
    cleartext: true,       // Abilita traffico in chiaro
    allowNavigation: ['*'] // Permette navigazione verso IP locali
  },
  android: {
    backgroundColor: '#020617',
    allowMixedContent: true, // Permette risorse miste (http/https)
    captureInput: true
  }
};

export default config;
