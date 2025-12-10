export type Language = 'it' | 'en';

export const translations = {
  it: {
    // 1. File Loader
    browse_device: "Sfoglia Dispositivo",
    search_internal: "Cerca nella memoria interna",
    load_file: "Carica File",
    select_audio_title: "Seleziona Audio",
    select_playlist_title: "Seleziona Playlist (.txt) e Audio",
    new_playlist: "Nuova Playlist",
    start_scratch: "Inizia da zero",
    info_credits: "Info & Credits",
    file_explorer: "Esplora Risorse",
    select_file: "Seleziona File",
    empty_folder: "Cartella vuota",
    error_read_folder: "Impossibile leggere la cartella",
    error_permission: "Permesso di archiviazione negato",
    android_permission_hint_title: "Non vedi i file Playlist (.txt)?",
    android_permission_hint_text: "Android nasconde i file di testo per sicurezza. Devi abilitare manualmente 'Gestione di tutti i file' nelle Impostazioni del Tablet > App > Regia Musiche > Permessi (o Accesso Speciale).",
    
    // 2. Playlist & Modes
    mode_editing: "Editing",
    mode_live: "Live",
    tracks: "Tracce",
    played_counter: "Eseguite", // + X su Y logic in component
    reset_show: "Reset Show",
    reset_tooltip: "Reset playlist all'inizio",
    save_playlist: "Salva Playlist",
    load_new: "Carica nuova playlist", // Tooltip
    load_btn: "Load", // Short button
    add_track: "Aggiungi Traccia",
    missing_file: "File mancante",
    played_status: "Eseguito",
    file_error: "Errore File",
    relink_tooltip_badge: "Clicca per cambiare file (Relink)",
    relink_tooltip_icon: "Clicca per ricollegare file",
    
    // 3. Editor & Controls
    time_start: "Inizio",
    time_end: "Fine",
    time_duration: "Durata",
    mark_in: "Mark In",
    mark_out: "Mark Out",
    volume: "Volume",
    fade_btn: "FADE",
    director_note: "Nota di Regia", // Modal Title
    edit_note_tooltip: "Modifica Nota Regia",
    no_note_placeholder: "Nessuna nota per questo brano.",
    sfx_section: "Effetti Sonori (SFX)",
    waveform_hidden: "Waveform Nascosta",
    waveform_loading: "Caricamento Spettro...",
    play_raw_tooltip: "Play Raw (dal cursore)",
    commit_tooltip: "Applica/Memorizza modifiche editing",
    reset_track_tooltip: "Reset",

    // 4. Player
    now_playing: "Riproduzione in corso...",
    waiting: "In attesa",
    fade_pause_tooltip: "Sfumare e Pausa",
    stop_reset_tooltip: "STOP e Reset a Inizio Traccia",
    no_track_title: "Nessun brano",

    // 5. Modals & Messages
    btn_confirm: "Conferma",
    btn_cancel: "Annulla",
    btn_close: "Chiudi",
    btn_save: "Salva",
    btn_apply: "Applica",
    btn_ok: "OK",
    
    saved_title: "Salvato!",
    file_updated: "File aggiornato",
    file_name_label: "Nome File",
    
    switch_live_title: "Passa a Live",
    switch_live_msg: "Passare alla modalità Live? L'interfaccia verrà semplificata.",
    switch_edit_title: "Torna a Editing",
    switch_edit_msg: "Tornare a Editing? La riproduzione verrà interrotta.",
    
    delete_track_title: "Elimina Traccia",
    delete_track_msg: "Vuoi rimuovere questa traccia dalla playlist?",
    delete_sfx_title: "Elimina SFX",
    delete_sfx_msg: "Vuoi rimuovere questo effetto sonoro?",
    
    load_new_title: "Carica Nuova",
    load_new_msg: "Le modifiche andranno perse. Continuare?",
    
    reset_show_msg: "Sei sicuro di voler resettare lo spettacolo e tornare all'inizio?",
    
    license_title: "Licenza d'uso e Disclaimer",
    
    // Info Text (HTML/JSX Content mapped to strings)
    license_freeware_title: "LICENZA FREEWARE:",
    license_freeware_text: "Questo software è distribuito gratuitamente. È concesso l'uso libero per scopi personali, educativi e professionali, inclusa la gestione audio per spettacoli teatrali ed eventi dal vivo. La vendita o la ridistribuzione a pagamento di questo software senza il consenso dell'autore è vietata.",
    
    license_asis_title: "LIMITAZIONE DI RESPONSABILITÀ (AS IS):",
    license_asis_text: "Il software viene fornito \"COSÌ COM'È\", senza garanzie di alcun tipo, esplicite o implicite, incluse ma non limitate alle garanzie di commerciabilità, idoneità per uno scopo particolare e non violazione.",
    
    license_liability_text: "L'autore non si assume alcuna responsabilità per malfunzionamenti, crash, interruzioni di spettacoli, perdita di dati, danni hardware o qualsiasi altro danno diretto o indiretto derivante dall'uso o dall'impossibilità di utilizzare questo applicativo.",
    
    license_warning_text: "L'utente finale è l'unico responsabile della verifica dell'affidabilità del sistema (hardware e software) prima dell'utilizzo in ambienti di produzione e durante performance dal vivo (Live Shows). Si consiglia vivamente di effettuare test approfonditi.",
    
    credits_opensource: "Riconoscimenti Open Source",
    credits_libs: "Regia Musiche Attozero utilizza librerie Open Source:",
    
    // Language Modal
    select_language: "Seleziona Lingua / Select Language"
  },
  en: {
    // 1. File Loader
    browse_device: "Browse Device",
    search_internal: "Search internal storage",
    load_file: "Load File",
    select_audio_title: "Select Audio",
    select_playlist_title: "Select Playlist (.txt) & Audio",
    new_playlist: "New Playlist",
    start_scratch: "Start from scratch",
    info_credits: "Info & Credits",
    file_explorer: "File Explorer",
    select_file: "Select File",
    empty_folder: "Empty folder",
    error_read_folder: "Cannot read folder",
    error_permission: "Storage permission denied",
    android_permission_hint_title: "Can't see Playlist (.txt) files?",
    android_permission_hint_text: "Android hides text files for security. You must manually enable 'All Files Access' in Tablet Settings -> Apps -> Regia Musiche -> Permissions (or Special Access).",
    
    // 2. Playlist & Modes
    mode_editing: "Editing",
    mode_live: "Live",
    tracks: "Tracks",
    played_counter: "Played",
    reset_show: "Reset Show",
    reset_tooltip: "Reset playlist to start",
    save_playlist: "Save Playlist",
    load_new: "Load New",
    load_btn: "Load",
    add_track: "Add Track",
    missing_file: "Missing file",
    played_status: "Played",
    file_error: "File Error",
    relink_tooltip_badge: "Click to Relink File",
    relink_tooltip_icon: "Click to relink file",
    
    // 3. Editor & Controls
    time_start: "Start",
    time_end: "End",
    time_duration: "Duration",
    mark_in: "Mark In",
    mark_out: "Mark Out",
    volume: "Volume",
    fade_btn: "FADE",
    director_note: "Director Note",
    edit_note_tooltip: "Edit Director Note",
    no_note_placeholder: "No note for this track.",
    sfx_section: "Sound Effects (SFX)",
    waveform_hidden: "Waveform Hidden",
    waveform_loading: "Loading Waveform...",
    play_raw_tooltip: "Play Raw (from cursor)",
    commit_tooltip: "Commit/Save changes",
    reset_track_tooltip: "Reset",

    // 4. Player
    now_playing: "Now Playing...",
    waiting: "Waiting / Ready",
    fade_pause_tooltip: "Fade out & Pause",
    stop_reset_tooltip: "STOP & Reset to Start",
    no_track_title: "No Track",

    // 5. Modals & Messages
    btn_confirm: "Confirm",
    btn_cancel: "Cancel",
    btn_close: "Close",
    btn_save: "Save",
    btn_apply: "Apply",
    btn_ok: "OK",
    
    saved_title: "Saved!",
    file_updated: "File updated",
    file_name_label: "File Name",
    
    switch_live_title: "Switch to Live",
    switch_live_msg: "Switch to Live mode? The interface will be simplified.",
    switch_edit_title: "Back to Editing",
    switch_edit_msg: "Back to Editing? Playback will stop.",
    
    delete_track_title: "Delete Track",
    delete_track_msg: "Do you want to remove this track from the playlist?",
    delete_sfx_title: "Delete SFX",
    delete_sfx_msg: "Do you want to remove this sound effect?",
    
    load_new_title: "Load New",
    load_new_msg: "Changes will be lost. Continue?",
    
    reset_show_msg: "Are you sure you want to reset the show and go back to the start?",
    
    license_title: "License & Disclaimer",
    
    // Info Text
    license_freeware_title: "FREEWARE LICENSE:",
    license_freeware_text: "This software is distributed for free. Free use is granted for personal, educational, and professional purposes, including audio management for theatrical shows and live events. Sale or paid redistribution of this software without the author's consent is prohibited.",
    
    license_asis_title: "LIMITATION OF LIABILITY (AS IS):",
    license_asis_text: "The software is provided \"AS IS\", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and non-infringement.",
    
    license_liability_text: "The author assumes no responsibility for malfunctions, crashes, show interruptions, data loss, hardware damage, or any other direct or indirect damage resulting from the use or inability to use this application.",
    
    license_warning_text: "The end user is solely responsible for verifying the system reliability (hardware and software) before use in production environments and during live performances. Extensive testing is highly recommended.",
    
    credits_opensource: "Open Source Credits",
    credits_libs: "Regia Musiche Attozero uses Open Source libraries:",
    
    // Language Modal
    select_language: "Seleziona Lingua / Select Language"
  }
};