import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, Minimize2, Maximize2, Move, Minus, Edit3, Save, MessageSquarePlus, Highlighter, Play, Pause, List, FilePlus, BookOpen, Upload, MapPin, Crosshair } from 'lucide-react';
import mammoth from 'mammoth/mammoth.browser.js';

interface ScriptPanelProps {
    isOpen: boolean;
    onClose: () => void;
    appMode?: 'editing' | 'presentation';
    leftPanelWidth?: number;
    isCompactView?: boolean;
    onSaveScript?: (html: string, pos: {x: number, y: number}, size: {width: number, height: number}, isAutoSave?: boolean) => void;
    initialPosition?: {x: number, y: number};
    initialSize?: {width: number, height: number};
    initialHtml?: string;
}

const ScriptPanel: React.FC<ScriptPanelProps> = ({ isOpen, onClose, appMode, leftPanelWidth, isCompactView, onSaveScript, initialPosition, initialSize, initialHtml }) => {
    const [isMaximized, setIsMaximized] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(true);
    
    // Position/Size logic
    const [position, setPosition] = useState(initialPosition || { x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 200 });
    const [size, setSize] = useState(initialSize || { width: 600, height: 400 });
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (initialPosition) setPosition(initialPosition);
        if (initialSize) setSize(initialSize);
    }, [initialPosition, initialSize]);
    
    // File reading logic
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [scriptContentHtml, setScriptContentHtml] = useState<string>(initialHtml || '');
    const contentRef = useRef<HTMLDivElement>(null);

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    useEffect(() => {
        if (initialHtml) {
            setScriptContentHtml(initialHtml);
        }
    }, [initialHtml]);

    useEffect(() => {
        if (isOpen) {
            setIsEditing(!scriptContentHtml || scriptContentHtml.trim() === '');
        }
    }, [isOpen]);


    // Editing mode
    const [isEditing, setIsEditing] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'marker' | 'highlight', range?: Range | null } | null>(null);
    interface MarkerItem {
        id: string;
        label: string;
        type: string;
        node: HTMLElement;
        top: number;
    }
    interface GroupedMarker {
        id: string;
        markers: MarkerItem[];
        top: number;
    }
    interface PageGroup {
        pageNum: number;
        groups: GroupedMarker[];
    }

    const [showMarkersList, setShowMarkersList] = useState(false);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const [markersByPage, setMarkersByPage] = useState<PageGroup[]>([]);
    const [nextMarkerPage, setNextMarkerPage] = useState<number | null>(null);
    const [markersListPos, setMarkersListPos] = useState({ x: typeof window !== 'undefined' ? window.innerWidth - 300 : 800, y: 100 });
    const markersListDrag = useRef({ isDragging: false, startX: 0, startY: 0, initPx: 0, initPy: 0 });

    useEffect(() => {
        if (showMarkersList && contentRef.current) {
            const markers = contentRef.current.querySelectorAll('.script-marker');
            let currentPageNum = 0;
            let currentGroups: GroupedMarker[] = [];
            let allPages: PageGroup[] = [];

            const pushCurrentPage = () => {
                if (currentGroups.length > 0) {
                    allPages.push({ pageNum: currentPageNum, groups: currentGroups });
                }
            };

            let lastTop = -100;
            
            for (let i = 0; i < markers.length; i++) {
                const n = markers[i] as HTMLElement;
                if (n.getAttribute('data-type') === 'page') {
                    pushCurrentPage();
                    currentPageNum++;
                    currentGroups = [];
                } else {
                    let id = n.id;
                    if (!id) {
                        id = `marker-toc-${i}-${Date.now()}`;
                        n.id = id;
                    }
                    let label = n.childNodes[0]?.textContent?.trim() || n.innerText;
                    const type = n.getAttribute('data-type') || 'note';
                    
                    if (type === 'multi') {
                        const multiData = n.getAttribute('data-multi-content');
                        if (multiData) {
                            try {
                                const items = JSON.parse(multiData);
                                const typeIcons: Record<string, string> = { 'playlist': '🎵', 'sfx': '🔊', 'light': '💡', 'proj': '📽', 'info': 'ℹ️', 'multi': '⚡' };
                                label = items.map((item: any) => typeIcons[item.type] || '📍').join(' ');
                            } catch (e) {}
                        }
                    } else if (type === 'info') {
                        label = 'ℹ️ Info';
                    }
                    
                    const top = n.offsetTop;
                    
                    const markerItem = { id, label, type, node: n, top };
                    
                    if (currentGroups.length > 0 && Math.abs(top - lastTop) < 20 && currentGroups[currentGroups.length - 1].markers.length < 5) {
                        currentGroups[currentGroups.length - 1].markers.push(markerItem);
                    } else {
                        currentGroups.push({ id: `group-${id}`, markers: [markerItem], top });
                        lastTop = top;
                    }
                }
            }
            pushCurrentPage();
            setMarkersByPage(allPages);
            
            // Auto scroll to current page in list
            setTimeout(() => {
                const el = document.getElementById(`toc-page-${currentPage}`);
                if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
            }, 50);
        }
    }, [scriptContentHtml, showMarkersList, currentPage]);

    // Drag handlers for Context Menu
    const isContextMenuDragging = useRef(false);
    const contextMenuDragStart = useRef({ x: 0, y: 0 });

    const handleContextMenuDragStart = (e: React.MouseEvent) => {
        if (!contextMenu) return;
        isContextMenuDragging.current = true;
        contextMenuDragStart.current = { x: e.clientX - contextMenu.x, y: e.clientY - contextMenu.y };
    };

    const handleContextMenuDragMove = (e: React.MouseEvent | MouseEvent) => {
        if (!isContextMenuDragging.current || !contextMenu) return;
        setContextMenu({
            ...contextMenu,
            x: e.clientX - contextMenuDragStart.current.x,
            y: e.clientY - contextMenuDragStart.current.y
        });
    };

    const handleContextMenuDragEnd = () => {
        isContextMenuDragging.current = false;
    };

    // Attach global mouse listeners for Context Menu dragging
    useEffect(() => {
        if (contextMenu && isContextMenuDragging.current) {
            window.addEventListener('mousemove', handleContextMenuDragMove);
            window.addEventListener('mouseup', handleContextMenuDragEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleContextMenuDragMove);
            window.removeEventListener('mouseup', handleContextMenuDragEnd);
        };
    }, [contextMenu]);

    const [markerPrompt, setMarkerPrompt] = useState<{ x: number, y: number, range: Range } | null>(null);

    interface MultiMarkerItem {
        id: string;
        type: string;
        title: string;
    }
    const [multiItems, setMultiItems] = useState<MultiMarkerItem[]>([]);

    const [markerType, setMarkerType] = useState('note');
    const [markerTitle, setMarkerTitle] = useState('');
    const [markerNote, setMarkerNote] = useState('');
    const [markerPinned, setMarkerPinned] = useState(false);

    const [isAutoSaving, setIsAutoSaving] = useState(false);
    const [isPaginationMode, setIsPaginationMode] = useState(false);
    const theoreticalScrollTop = useRef<number>(-1);
    const [isDeviated, setIsDeviated] = useState(false);
    const isDeviatedRef = useRef(false);
    const isCentering = useRef(false);
    
    // Goto Page Modal state
    const [gotoPrompt, setGotoPrompt] = useState(false);
    const [gotoPageNum, setGotoPageNum] = useState<string>('');

    // Call this helper to commit changes and auto-save silently
    const commitChange = () => {
        if (contentRef.current) {
            const h = contentRef.current.innerHTML;
            setScriptContentHtml(h);
            setHasUnsavedChanges(false);
            setIsAutoSaving(true);
            if (onSaveScript) onSaveScript(h, position, size, true);
            setTimeout(() => setIsAutoSaving(false), 2000);
        }
    };

    // Global drag for pinned notes
    const draggedNote = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const move = (e: MouseEvent) => {
            if (draggedNote.current) {
                const x = e.clientX - parseInt(draggedNote.current.getAttribute('data-start-x') || '0');
                const y = e.clientY - parseInt(draggedNote.current.getAttribute('data-start-y') || '0');
                const initL = parseInt(draggedNote.current.getAttribute('data-init-l') || '0');
                const initT = parseInt(draggedNote.current.getAttribute('data-init-t') || '0');
                draggedNote.current.style.left = `${initL + x}px`;
                draggedNote.current.style.top = `${initT + y}px`;
            }
        };

        const up = () => {
            if (draggedNote.current) {
                draggedNote.current = null;
                commitChange();
            }
        };

        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
        };
    }, [position, size, onSaveScript]);

    // Autoscroll (Gobbo) logic
    const [isAutoScrolling, setIsAutoScrolling] = useState(false);
    const [scrollSpeed, setScrollSpeed] = useState<number>(1);
    const scrollIntervalRef = useRef<any>(null);

    useEffect(() => {
        if (isAutoScrolling && contentRef.current) {
            const container = contentRef.current.parentElement;
            if (container) {
                if (theoreticalScrollTop.current === -1) {
                    theoreticalScrollTop.current = container.scrollTop;
                }
                scrollIntervalRef.current = setInterval(() => {
                    theoreticalScrollTop.current += scrollSpeed;
                    
                    if (!isDeviatedRef.current && !isCentering.current) {
                        container.scrollTop = theoreticalScrollTop.current;
                    }
                }, 50);
            }
        } else {
            if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
            theoreticalScrollTop.current = -1;
            isDeviatedRef.current = false;
            setIsDeviated(false);
        }
        return () => {
            if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
        }
    }, [isAutoScrolling, scrollSpeed]);

    const handleCenterScroll = () => {
        if (contentRef.current?.parentElement && theoreticalScrollTop.current !== -1) {
            isCentering.current = true;
            contentRef.current.parentElement.scrollTo({ top: theoreticalScrollTop.current, behavior: 'smooth' });
            
            isDeviatedRef.current = false;
            setIsDeviated(false);
            
            setTimeout(() => {
                isCentering.current = false;
            }, 1000); // Allow smooth scroll to finish without fighting
        }
    };

    const handleSyncScroll = () => {
        if (contentRef.current?.parentElement) {
            theoreticalScrollTop.current = contentRef.current.parentElement.scrollTop;
            isDeviatedRef.current = false;
            setIsDeviated(false);
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (!contentRef.current) return;
        const container = e.currentTarget;
        const markers = contentRef.current.querySelectorAll('.script-marker');
        
        let passedPageMarkers = 0;
        let nextPFound: number | null = null;
        let lastPassedIdx = -1;

        const scrollThreshold = container.scrollTop + container.clientHeight / 2;

        for (let i = 0; i < markers.length; i++) {
            const m = markers[i] as HTMLElement;
            const isPage = m.getAttribute('data-type') === 'page';
            
            if (isPage) {
                passedPageMarkers++;
                if (m.offsetTop <= scrollThreshold) {
                    lastPassedIdx = passedPageMarkers - 1;
                }
            } else {
                if (nextPFound === null && m.offsetTop > scrollThreshold) {
                    nextPFound = passedPageMarkers;
                }
            }
        }
        
        const calculatedPage = lastPassedIdx + 1;
        if (currentPage !== calculatedPage) setCurrentPage(calculatedPage);
        if (nextMarkerPage !== nextPFound) setNextMarkerPage(nextPFound);

        if (isAutoScrolling && theoreticalScrollTop.current !== -1 && !isCentering.current) {
            const diff = Math.abs(container.scrollTop - theoreticalScrollTop.current);
            const isCurrentlyDeviated = diff > 20;
            if (isCurrentlyDeviated !== isDeviatedRef.current) {
                isDeviatedRef.current = isCurrentlyDeviated;
                setIsDeviated(isCurrentlyDeviated);
            }
        }
    };

    const executeGotoPage = () => {
        const pageNum = parseInt(gotoPageNum, 10);
        if (isNaN(pageNum)) {
            setGotoPrompt(false);
            return;
        }
        
        if (contentRef.current) {
            const container = contentRef.current.parentElement;
            if (!container) return;
            
            if (isAutoScrolling) {
                isDeviatedRef.current = true;
                setIsDeviated(true);
            }

            if (pageNum <= 0) {
                container.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                const pages = contentRef.current.querySelectorAll('.script-marker[data-type="page"]');
                const targetMarker = pages[pageNum - 1] as HTMLElement;
                if (targetMarker) {
                    container.scrollTo({ top: targetMarker.offsetTop - 32, behavior: 'smooth' }); // -32 for top padding
                } else if (pages.length > 0) {
                    const lastMarker = pages[pages.length - 1] as HTMLElement;
                    container.scrollTo({ top: lastMarker.offsetTop - 32, behavior: 'smooth' });
                }
            }
        }
        setGotoPrompt(false);
        setGotoPageNum('');
    };

    // Prevent dragging when maximized
    const handleDragStart = (e: React.MouseEvent) => {
        if (isMaximized) return;
        isDragging.current = true;
        dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };

    const handleDragMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        let minY = 0;
        let minX = 0;
        let maxY = window.innerHeight - 96 - size.height; // bottom player controls height
        let maxX = window.innerWidth - size.width;

        if (appMode === 'presentation') {
            const leftW = typeof leftPanelWidth === 'number' ? leftPanelWidth : 35;
            const leftPaneW = window.innerWidth * (leftW / 100);
            minX = leftPaneW + 120; // 120px for the SFX column we stacked
            minY = isCompactView ? 60 : 90; // waveform height approx
        }

        let newX = e.clientX - dragStart.current.x;
        let newY = e.clientY - dragStart.current.y;
        
        if (newX < minX) newX = minX;
        if (newX > maxX) newX = maxX;
        if (newY < minY) newY = minY;
        if (newY > maxY) newY = maxY > minY ? maxY : minY;

        setPosition({ x: newX, y: newY });
    };

    const handleDragEnd = () => {
        isDragging.current = false;
    };

    useEffect(() => {
        window.addEventListener('mousemove', handleDragMove);
        window.addEventListener('mouseup', handleDragEnd);
        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [size.height, size.width, appMode, leftPanelWidth, isCompactView]); 

    // Auto-position on enter presentation mode
    useEffect(() => {
        if (isOpen && appMode === 'presentation') {
            setIsMaximized(false);
            const leftW = typeof leftPanelWidth === 'number' ? leftPanelWidth : 40;
            const leftPaneW = window.innerWidth * (leftW / 100);
            const sfxColumnWidth = 240; // approx width of SFX column + padding
            const newX = leftPaneW + sfxColumnWidth;
            const newY = 16;
            const newWidth = window.innerWidth - newX - 16;
            const newHeight = window.innerHeight - 96 - 32; // bottom bar (96px) + some margins
            setPosition({ x: newX, y: newY });
            setSize({ width: Math.max(400, newWidth), height: Math.max(300, newHeight) });
        }
    }, [appMode, isOpen]); // only reacts to mode and visibility

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            if (file.name.endsWith('.docx')) {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.convertToHtml({ arrayBuffer });
                setScriptContentHtml(result.value);
            } else if (file.name.endsWith('.rtf')) {
                const text = await file.text();
                let stripped = text.replace(/\\([a-z]+)[0-9]*\s?/ig, '').replace(/[\{\}]/g, '');
                setScriptContentHtml(`<p>${stripped.replace(/\n/g, '<br/>')}</p>`);
            } else if (file.name.endsWith('.html')) {
                const text = await file.text();
                // Simple inner html extraction or just load direct
                const bodyMatch = text.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                setScriptContentHtml(bodyMatch ? bodyMatch[1] : text);
            } else if (file.name.endsWith('.txt')) {
                const text = await file.text();
                setScriptContentHtml(`<p>${text.replace(/\n/g, '<br/>')}</p>`);
            } else {
                alert('Formato non supportato. Usa DOCX, TXT, HTML o RTF.');
            }
            setHasUnsavedChanges(true);
        } catch (err) {
            console.error("Errore lettura file:", err);
            alert('Errore durante la lettura del file. Assicurati che sia un file valido.');
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const [editingMarkerNode, setEditingMarkerNode] = useState<HTMLElement | null>(null);

    const getPromptPos = () => {
        if (contentRef.current?.parentElement) {
            const rect = contentRef.current.parentElement.getBoundingClientRect();
            return { x: rect.left + rect.width / 2 - 160, y: rect.top + 10 };
        }
        return { x: window.innerWidth / 2 - 160, y: window.innerHeight / 2 - 200 };
    };

    const handleContentMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('pinned-note-box')) {
             const rect = target.getBoundingClientRect();
             if (e.clientX > rect.right - 20 && e.clientY > rect.bottom - 20) {
                 const upResize = () => {
                     if (contentRef.current) setScriptContentHtml(contentRef.current.innerHTML);
                     window.removeEventListener('mouseup', upResize);
                 };
                 window.addEventListener('mouseup', upResize);
                 return;
             }
             e.stopPropagation();
             draggedNote.current = target;
             target.setAttribute('data-start-x', e.clientX.toString());
             target.setAttribute('data-start-y', e.clientY.toString());
             target.setAttribute('data-init-l', (parseInt(target.style.left) || '0').toString());
             target.setAttribute('data-init-t', (parseInt(target.style.top) || '0').toString());
        }
    };

    const handleContentClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('.pinned-note-box')) return;
        
        // Handle pagination cursor insert
        if (isPaginationMode && !target.classList.contains('script-marker') && !target.closest('.script-marker')) {
            const range = document.caretRangeFromPoint(e.clientX, e.clientY);
            if (range && contentRef.current) {
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
                
                const html = `<span class="script-marker" contenteditable="false" data-type="page">Pagina</span>`;
                document.execCommand('insertHTML', false, html);
                
                // Renumber pages
                if (contentRef.current) {
                    const pages = contentRef.current.querySelectorAll('.script-marker[data-type="page"]');
                    pages.forEach((p, idx) => {
                         p.innerHTML = `Pagina ${idx + 1}`;
                    });
                }
                commitChange();
                return;
            }
        }

        let markerNode = target.classList.contains('script-marker') ? target : target.closest('.script-marker') as HTMLElement;
        if (markerNode && isEditing) {
            e.preventDefault();
            const type = markerNode.getAttribute('data-type') || 'note';
            const note = markerNode.getAttribute('data-note') || '';
            const pinned = markerNode.getAttribute('data-pinned') === 'true';
            
            if (type === 'multi' || type === 'info') {
                const multiData = markerNode.getAttribute('data-multi-content');
                if (multiData) {
                    try {
                        setMultiItems(JSON.parse(multiData));
                    } catch (e) {
                         setMultiItems([]);
                    }
                } else {
                    setMultiItems([]);
                }
            } else {
                const rawLabel = markerNode.childNodes[0]?.textContent?.trim() || markerNode.innerText || '';
                const typeIcons: Record<string, string> = {
                    'time': '⏱',
                    'playlist': '🎵',
                    'sfx': '🔊',
                    'light': '💡',
                    'proj': '📽',
                    'note': '📝'
                };
                const icon = typeIcons[type] || '📍';
                let title = rawLabel.startsWith(icon) ? rawLabel.substring(icon.length).trim() : rawLabel;
                
                if (type === 'note') {
                    setMultiItems([]);
                } else {
                    setMultiItems([{ id: `legacy-${Date.now()}`, type: type, title: title }]);
                }
            }

            setEditingMarkerNode(markerNode);
            setMarkerType('multi');
            setMarkerTitle('');
            setMarkerNote(note);
            setMarkerPinned(pinned);
            const pos = getPromptPos();
            setMarkerPrompt({ x: pos.x, y: pos.y, range: null as any }); // range is not needed for edit
            setContextMenu(null);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        if (!isEditing) return;
        e.preventDefault();
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            setContextMenu({ x: e.clientX, y: e.clientY, type: 'highlight', range: selection.getRangeAt(0).cloneRange() });
        } else if (selection && selection.rangeCount > 0) {
            setEditingMarkerNode(null);
            const pos = getPromptPos();
            setMarkerPrompt({ x: pos.x, y: pos.y, range: selection.getRangeAt(0).cloneRange() });
            setMarkerType('multi');
            setMarkerTitle('');
            setMarkerNote('');
            setMarkerPinned(false);
            setMultiItems([]);
            setContextMenu(null);
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (!isEditing) return;
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            setEditingMarkerNode(null);
            const pos = getPromptPos();
            setMarkerPrompt({ x: pos.x, y: pos.y, range: selection.getRangeAt(0).cloneRange() });
            setMarkerType('multi');
            setMarkerTitle('');
            setMarkerNote('');
            setMarkerPinned(false);
            setMultiItems([]);
            setContextMenu(null);
        }
    };

    const applyHighlight = (className: string) => {
        if (!contextMenu?.range) return;
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(contextMenu.range);
        
        if (className === 'clear') {
            // Find parent highlight and unwrap it
            let node: Node | null = selection?.anchorNode || null;
            if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
            let el = node as HTMLElement;
            let found = false;
            while (el && el !== contentRef.current) {
                if (el.nodeName === 'SPAN' && el.className.includes('hl-')) {
                    const parent = el.parentNode;
                    while(el.firstChild) {
                        parent?.insertBefore(el.firstChild, el);
                    }
                    parent?.removeChild(el);
                    found = true;
                    break;
                }
                el = el.parentNode as HTMLElement;
            }
            if (!found) {
                // Fallback: try to execute removeFormat
                document.execCommand('removeFormat', false, '');
            }
            commitChange();
        } else {
            let text = selection?.toString() || '';
            if (text) {
                const html = `<span class="${className}">${text}</span>`;
                document.execCommand('insertHTML', false, html);
                commitChange();
            }
        }
        setContextMenu(null);
    };



    const promptDrag = useRef({ isDragging: false, startX: 0, startY: 0, initPx: 0, initPy: 0 });

    const handlePromptDragStart = (e: React.MouseEvent) => {
        if (!markerPrompt) return;
        promptDrag.current = { isDragging: true, startX: e.clientX, startY: e.clientY, initPx: markerPrompt.x, initPy: markerPrompt.y };
    };

    const handlePromptDragMove = (e: React.MouseEvent) => {
        if (!promptDrag.current.isDragging || !markerPrompt) return;
        const dx = e.clientX - promptDrag.current.startX;
        const dy = e.clientY - promptDrag.current.startY;
        setMarkerPrompt({ ...markerPrompt, x: promptDrag.current.initPx + dx, y: promptDrag.current.initPy + dy });
    };

    const handlePromptDragEnd = () => {
        promptDrag.current.isDragging = false;
    };

    const deleteMarker = () => {
        if (editingMarkerNode) {
            if (window.confirm("Vuoi rimuovere questo marker?")) {
                const parent = editingMarkerNode.parentNode;
                editingMarkerNode.remove();
                if (parent) parent.normalize();
                commitChange();
            }
        }
        setMarkerPrompt(null);
        setEditingMarkerNode(null);
    };

    const insertMarker = () => {
        const typeIcons: Record<string, string> = {
            'playlist': '🎵',
            'sfx': '🔊',
            'light': '💡',
            'proj': '📽',
            'info': 'ℹ️',
            'multi': '⚡'
        };
        
        let finalType = 'multi';
        let labelText = '';
        let multiDataAttr = '';

        if (multiItems.length === 0) {
            finalType = 'info';
            labelText = 'ℹ️';
            multiDataAttr = ` data-multi-content='[]'`;
        } else {
            labelText = multiItems.map(item => {
                const itemIcon = typeIcons[item.type] || '📍';
                return `<span class="multi-subitem">${itemIcon} ${item.title}</span>`;
            }).join('<span class="mx-1 text-slate-500">|</span>');
            
            if (multiItems.length > 1) {
                labelText = `⚡ <span class="ml-1">${labelText}</span>`;
            }
            multiDataAttr = ` data-multi-content='${JSON.stringify(multiItems).replace(/'/g, "&apos;")}'`;
        }

        const cleanNote = markerNote.replace(/"/g, '&quot;');
        const isPinned = markerPinned;

        if (editingMarkerNode) {
            // Update existing marker
            editingMarkerNode.setAttribute('data-type', finalType);
            editingMarkerNode.setAttribute('data-note', cleanNote);
            editingMarkerNode.setAttribute('data-pinned', isPinned.toString());
            
            if (finalType === 'multi' || finalType === 'info') {
                editingMarkerNode.setAttribute('data-multi-content', JSON.stringify(multiItems));
            } else {
                editingMarkerNode.removeAttribute('data-multi-content');
            }
            
            const existingBox = editingMarkerNode.querySelector('.pinned-note-box') as HTMLElement;
            const style = existingBox ? (existingBox.getAttribute('style') || "left: 0px; top: 30px; width: 200px; height: 100px;") : "left: 0px; top: 30px; width: 200px; height: 100px;";

            editingMarkerNode.innerHTML = labelText;
            if (isPinned) {
                 editingMarkerNode.innerHTML += `<div class="pinned-note-box" style="${style}">${cleanNote}</div>`;
            }
        } else if (markerPrompt?.range) {
            // Insert new marker
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(markerPrompt.range);
            
            let htmlInner = labelText;
            if (isPinned) {
                 htmlInner += `<div class="pinned-note-box" style="left: 0px; top: 30px; width: 200px; height: 100px;">${cleanNote}</div>`;
            }

            const html = `&nbsp;<span class="script-marker" contenteditable="false" data-type="${finalType}" data-note="${cleanNote}" data-pinned="${isPinned}"${multiDataAttr}>${htmlInner}</span>&nbsp;`;
            document.execCommand('insertHTML', false, html);
        }
        
        commitChange();
        setMarkerPrompt(null);
        setEditingMarkerNode(null);
    };

    const maximizedStyle: React.CSSProperties = {
        top: '16px',
        right: '16px',
        bottom: '112px',
        width: 'min(50%, 800px)',
        height: 'auto',
    };

    if (!isOpen) return null;

    if (isMinimized) {
        return (
            <div className="fixed bottom-28 right-4 z-[110]">
                <button 
                    onClick={() => setIsMinimized(false)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-emerald-500/50 hover:border-emerald-500 rounded-full shadow-lg shadow-emerald-900/20 text-emerald-400 font-bold transition-all"
                >
                    <FileText className="w-4 h-4" />
                    Copione Minimizzato
                </button>
            </div>
        );
    }

    return (
        <div 
            className={`fixed z-[110] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden transition-all shadow-[0_0_50px_rgba(0,0,0,0.5)]`}
            style={isMaximized ? maximizedStyle : {
                left: position.x,
                top: position.y,
                width: size.width,
                height: size.height
            }}
        >
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept=".docx,.rtf,.txt,.html" 
            />

            {/* Header */}
            <div 
                className={`h-10 bg-slate-800 border-b border-slate-700 flex items-center px-4 shrink-0 select-none ${isMaximized ? '' : 'cursor-move'}`}
                onMouseDown={handleDragStart}
            >
                <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-bold text-slate-300">
                            Copione - Pagina {currentPage}
                        </span>
                    </div>
                    {nextMarkerPage !== null && (
                        <span className="text-xs font-semibold text-slate-500 bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700/50 shadow-inner">
                            Prossimo: pag {nextMarkerPage}
                        </span>
                    )}
                </div>
                <div className="flex flex-1 justify-center pointer-events-none opacity-30">
                    {!isMaximized && <Move className="w-4 h-4" />}
                </div>
                <div className="flex items-center gap-2 flex-1 justify-end">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }}
                        className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                        title="Riduci a icona"
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsMaximized(!isMaximized); }}
                        className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                        title={isMaximized ? "Finestra mobile" : "Massimizza a lato"}
                    >
                        {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        className="p-1 hover:bg-red-900/80 rounded text-slate-400 hover:text-white transition-colors"
                        title="Chiudi pannello"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="h-10 bg-slate-800/50 border-b border-slate-700 flex items-center px-2 gap-2 shrink-0">
                <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="p-1.5 bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 rounded transition-colors border border-slate-600 shadow-sm"
                    title="Alterna Tema (Chiaro/Scuro)"
                >
                    {isDarkMode ? '☀️' : '🌙'}
                </button>

                {isEditing && (
                    <>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-1.5 bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 rounded transition-colors border border-slate-600 shadow-sm"
                            title="Carica Copione"
                        >
                            <Upload className="w-4 h-4 text-sky-400" />
                        </button>
                        <div className="w-px h-4 bg-slate-600 mx-1"></div>
                    </>
                )}
                
                {!isEditing && (
                    <>
                        <button
                            onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                            className={`px-3 py-1 flex items-center gap-1 text-xs font-bold rounded transition-colors border shadow-sm ${isAutoScrolling ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}
                            title={isAutoScrolling ? "Pausa Scorrimento" : "Avvia Scorrimento"}
                        >
                            {isAutoScrolling ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            {isAutoScrolling ? 'Pausa Gobbo' : 'Gobbo'}
                        </button>
                        {isAutoScrolling && isDeviated && (
                            <>
                                <button 
                                    onClick={handleCenterScroll}
                                    className="px-2 py-1 bg-sky-600 text-white font-bold text-xs rounded hover:bg-sky-500 flex items-center gap-1 ml-1"
                                    title="Torna alla posizione originale del gobbo"
                                >
                                    <Crosshair className="w-3 h-3" />
                                    Centra
                                </button>
                                <button 
                                    onClick={handleSyncScroll}
                                    className="px-2 py-1 bg-emerald-600 text-white font-bold text-xs rounded hover:bg-emerald-500 flex items-center gap-1 ml-1 shadow-sm"
                                    title="Riallinea il timing alla posizione corrente"
                                >
                                    <Play className="w-3 h-3" fill="currentColor" />
                                    Riallinea
                                </button>
                            </>
                        )}
                        <div className="flex items-center gap-0 border border-slate-600 rounded overflow-hidden shadow-sm">
                            <button 
                                onClick={() => setScrollSpeed(prev => Number((Math.max(0.1, prev - 0.1)).toFixed(1)))}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white border-r border-slate-600 transition-colors"
                                title="Riduci Velocità"
                            ><Minus className="w-3 h-3" /></button>
                            <div className="px-2 py-1 text-xs font-bold bg-slate-800 text-slate-300 w-10 text-center">{scrollSpeed}x</div>
                            <button 
                                onClick={() => setScrollSpeed(prev => Number((Math.min(10, prev + 0.1)).toFixed(1)))}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white border-l border-slate-600 transition-colors"
                                title="Aumenta Velocità"
                            ><span className="text-xl leading-none w-3 h-3 flex items-center justify-center">+</span></button>
                        </div>
                        <div className="w-px h-4 bg-slate-600 mx-1"></div>
                    </>
                )}

                <button 
                    onClick={() => setShowMarkersList(!showMarkersList)}
                    className={`p-1.5 flex items-center justify-center rounded transition-colors border shadow-sm ${showMarkersList ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}
                    title="Sommario Markers"
                >
                    <List className="w-4 h-4 text-emerald-400" />
                </button>

                <div className="w-px h-4 bg-slate-600 mx-1"></div>

                {isEditing && (
                    <>
                        <button 
                            onClick={() => setIsPaginationMode(!isPaginationMode)}
                            className={`p-1.5 flex items-center justify-center rounded transition-colors border shadow-sm ${isPaginationMode ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}
                            title="Modalità Impaginazione"
                        >
                            <FilePlus className="w-4 h-4 text-amber-400" />
                        </button>
                        <div className="w-px h-4 bg-slate-600 mx-1"></div>
                    </>
                )}

                <button 
                    onClick={() => { setGotoPrompt(true); setGotoPageNum(''); }}
                    className="p-1.5 flex items-center justify-center rounded transition-colors border shadow-sm bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                    title="Vai a Pagina"
                >
                    <MapPin className="w-4 h-4 text-rose-400" />
                </button>

                <div className="w-px h-4 bg-slate-600 mx-1"></div>

                <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={`p-1.5 flex items-center justify-center rounded transition-colors border shadow-sm ${isEditing ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}
                    title="Modifica Copione"
                >
                    <Edit3 className="w-4 h-4 text-indigo-400" />
                </button>
                
                {isEditing && (
                    <button 
                        onClick={() => {
                            if (contentRef.current) {
                                setScriptContentHtml(contentRef.current.innerHTML);
                                setHasUnsavedChanges(false);
                                if (onSaveScript) {
                                    onSaveScript(contentRef.current.innerHTML, position, size);
                                }
                            }
                        }}
                        disabled={!hasUnsavedChanges && !isAutoSaving}
                        className={`px-3 py-1 flex items-center gap-1 text-xs font-bold rounded transition-colors border shadow-sm ${!hasUnsavedChanges && !isAutoSaving ? 'bg-slate-700 border-slate-600 text-slate-500 cursor-not-allowed opacity-50' : (isAutoSaving ? 'bg-emerald-400 border-emerald-300 text-slate-900 animate-pulse' : 'bg-emerald-700 border-emerald-600 text-white hover:bg-emerald-600')}`}
                    >
                        <Save className="w-3 h-3" />
                        Salva
                    </button>
                )}
                <div className="flex-1"></div>
                {isEditing && (
                    <span className="text-xs text-slate-400 italic px-2">Doppio click / Selezione per Highlight e Marker</span>
                )}
            </div>

            {/* Content Area */}
            <div className={`flex-1 flex overflow-hidden ${isDarkMode ? 'bg-[#121212] text-[#e0e0e0]' : 'bg-slate-100 text-slate-900'} ${isPaginationMode ? (isDarkMode ? 'bg-[#1e1e1e] ring-inset ring-2 ring-amber-500/50' : 'bg-amber-50') : ''}`} onClick={() => setContextMenu(null)}>
                <div 
                    className={`flex-1 overflow-y-auto relative custom-scrollbar ${isPaginationMode ? 'pagination-mode' : ''}`}
                    onScroll={handleScroll}
                >
                    {scriptContentHtml ? (
                        <div 
                            ref={contentRef}
                            contentEditable={isEditing}
                            suppressContentEditableWarning={true}
                            spellCheck={false}
                            className={`p-8 font-serif leading-relaxed text-base max-w-full overflow-x-hidden script-content min-h-full outline-none ${isEditing ? 'cursor-text focus:ring-4 ring-indigo-500/20 ring-inset' : ''} ${isPaginationMode ? 'cursor-pointer' : ''}`}
                            dangerouslySetInnerHTML={{ __html: scriptContentHtml }}
                            onClick={handleContentClick}
                            onMouseDown={handleContentMouseDown}
                            onContextMenu={handleContextMenu}
                            onDoubleClick={handleDoubleClick}
                            onInput={() => setHasUnsavedChanges(true)}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center min-h-full opacity-50 p-6">
                            <FileText className="w-16 h-16 mb-4 text-slate-500" />
                            <p className="text-center italic text-slate-600">Nessun copione caricato.</p>
                            <p className="text-xs text-slate-500 mt-2">Usa il pulsante in alto per importare un file .docx, .rtf, .html o .txt</p>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Goto Prompt Modal */}
            {gotoPrompt && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4 w-64 z-[1005] flex flex-col items-center">
                    <h3 className="font-bold text-slate-200 mb-3 text-sm flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-rose-400" />
                        Vai a Pagina
                    </h3>
                    <input 
                        type="number" 
                        min="1"
                        autoFocus
                        value={gotoPageNum}
                        onChange={e => setGotoPageNum(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') executeGotoPage(); else if (e.key === 'Escape') setGotoPrompt(false); }}
                        className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded mb-4 text-center font-bold outline-none focus:border-rose-500"
                        placeholder={`Pagina attuale: ${currentPage}`}
                    />
                    <div className="flex gap-2 w-full">
                        <button onClick={() => setGotoPrompt(false)} className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm font-bold transition-colors">Annulla</button>
                        <button onClick={executeGotoPage} className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-sm font-bold transition-colors">Vai</button>
                    </div>
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div 
                    className="fixed z-[1000] bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-1 w-48 flex flex-col"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div 
                        className="h-4 bg-slate-700/50 rounded-t-md mb-1 cursor-move flex items-center justify-center border-b border-slate-600/50 hover:bg-slate-600 transition-colors"
                        onMouseDown={handleContextMenuDragStart}
                        title="Trascina menu"
                    >
                        <div className="w-8 h-1 rounded-full bg-slate-500"></div>
                    </div>
                    {contextMenu.type === 'highlight' && (
                        <>
                            <div className="text-xs font-bold text-slate-400 p-2 uppercase tracking-wider">Evidenzia</div>
                            <button onClick={() => applyHighlight('hl-shout')} className="px-3 py-2 text-left text-sm hover:bg-slate-700 text-slate-200 rounded flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-yellow-400"></span> Urlato (Giallo)
                            </button>
                            <button onClick={() => applyHighlight('hl-enter-exit')} className="px-3 py-2 text-left text-sm hover:bg-slate-700 text-slate-200 rounded flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-sky-400"></span> Entrata/Uscita
                            </button>
                            <div className="w-full h-px bg-slate-600/50 my-1"></div>
                            <button onClick={() => applyHighlight('clear')} className="px-3 py-2 text-left text-sm hover:bg-slate-700 text-slate-200 rounded flex items-center gap-2">
                                <X className="w-3 h-3 text-red-400" /> Rimuovi Evidenziazione
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Marker Prompt Modal */}
            {markerPrompt && (
                <div 
                    className="fixed bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4 w-80 text-white z-[1001]"
                    style={{ left: markerPrompt.x, top: markerPrompt.y }}
                    onMouseMove={handlePromptDragMove}
                    onMouseUp={handlePromptDragEnd}
                    onMouseLeave={handlePromptDragEnd}
                >
                    <div className="h-full w-full flex flex-col">
                        <div 
                            className="font-bold mb-4 cursor-move border-b border-slate-700 pb-2 flex items-center justify-between"
                            onMouseDown={handlePromptDragStart}
                        >
                            <span>
                                {editingMarkerNode ? 'Modifica Marker' : 'Nuovo Marker'}
                            </span>
                            <Move className="w-4 h-4 text-slate-500" />
                        </div>
                        
                        <div className="flex flex-col gap-2 mb-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                            <label className="block text-xs font-bold text-slate-400">Azioni (Opzionali)</label>
                            {multiItems.map((item, idx) => (
                                <div key={item.id} className="flex gap-2 items-center">
                                    <select 
                                        value={item.type} 
                                        onChange={(e) => {
                                            const newItems = [...multiItems];
                                            newItems[idx].type = e.target.value;
                                            setMultiItems(newItems);
                                        }}
                                        className="bg-slate-700 border border-slate-600 rounded p-1.5 text-xs outline-none focus:border-indigo-500 w-24"
                                    >
                                        <option value="playlist">🎵 Scaletta</option>
                                        <option value="sfx">🔊 SFX</option>
                                        <option value="light">💡 Luci</option>
                                        <option value="proj">📽 Proiezione</option>
                                    </select>
                                    <input 
                                        type="text" 
                                        value={item.title}
                                        onChange={(e) => {
                                            const newItems = [...multiItems];
                                            newItems[idx].title = e.target.value;
                                            setMultiItems(newItems);
                                        }}
                                        className="flex-1 bg-slate-700 border border-slate-600 rounded p-1.5 text-xs outline-none focus:border-indigo-500"
                                        placeholder="Etichetta"
                                    />
                                    <button 
                                        onClick={() => setMultiItems(multiItems.filter((_, i) => i !== idx))}
                                        className="text-red-400 hover:text-red-300 p-1"
                                        title="Rimuovi"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                            <button 
                                onClick={() => setMultiItems([...multiItems, { id: `sub-${Date.now()}`, type: 'playlist', title: '' }])}
                                className="border border-dashed border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500 hover:bg-slate-700 rounded p-1.5 text-xs text-center mt-1 transition-colors"
                            >
                                + Aggiungi Azione
                            </button>
                        </div>
                        
                        <label className="block text-xs font-bold text-slate-400 mb-1">Nota Dettagliata Condivisa</label>
                        <textarea 
                            rows={3}
                            placeholder="Descrizione estesa visibile al passaggio del mouse..."
                            value={markerNote}
                            onChange={(e) => setMarkerNote(e.target.value)}
                            className="w-full bg-slate-700 border border-slate-600 rounded p-2 mb-2 text-sm resize-none"
                        />
                        <label className="flex items-center gap-2 mb-4 text-sm text-slate-300 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={markerPinned} 
                                onChange={(e) => setMarkerPinned(e.target.checked)}
                                className="rounded border-slate-600 bg-slate-800"
                            />
                            Fissa nota nel copione
                        </label>

                        <div className="flex gap-2 justify-end">
                            {editingMarkerNode && (
                                <button onClick={deleteMarker} className="px-4 py-2 rounded bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white text-sm mr-auto font-bold">
                                    Elimina
                                </button>
                            )}
                            <button onClick={() => { setMarkerPrompt(null); setEditingMarkerNode(null); }} className="px-4 py-2 rounded text-slate-300 hover:bg-slate-700 text-sm">
                                Annulla
                            </button>
                            <button onClick={insertMarker} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm">
                                {editingMarkerNode ? 'Salva' : 'Inserisci'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* 8 Resizer Handles for All Edges and Corners */}
            {!isMaximized && (
                <>
                    {/* Top */}
                    <div className="absolute top-0 left-0 w-full h-2 cursor-n-resize bg-transparent hover:bg-emerald-500/30 transition-colors z-10" onMouseDown={(e) => { e.stopPropagation(); const sy = e.clientY, sh = size.height, py = position.y; const move = (re: MouseEvent) => { const dy = re.clientY - sy; const nh = sh - dy; if(nh >= 200) { setSize(s => ({...s, height: nh})); setPosition(p => ({...p, y: py + dy})); } }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                    {/* Bottom */}
                    <div className="absolute bottom-0 left-0 w-full h-2 cursor-s-resize bg-transparent hover:bg-emerald-500/30 transition-colors z-10" onMouseDown={(e) => { e.stopPropagation(); const sy = e.clientY, sh = size.height; const move = (re: MouseEvent) => { setSize(s => ({...s, height: Math.max(200, sh + (re.clientY - sy))})); }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                    {/* Left */}
                    <div className="absolute top-0 left-0 w-2 h-full cursor-w-resize bg-transparent hover:bg-emerald-500/30 transition-colors z-10" onMouseDown={(e) => { e.stopPropagation(); const sx = e.clientX, sw = size.width, px = position.x; const move = (re: MouseEvent) => { const dx = re.clientX - sx; const nw = sw - dx; if(nw >= 300) { setSize(s => ({...s, width: nw})); setPosition(p => ({...p, x: px + dx})); } }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                    {/* Right */}
                    <div className="absolute top-0 right-0 w-2 h-full cursor-e-resize bg-transparent hover:bg-emerald-500/30 transition-colors z-10" onMouseDown={(e) => { e.stopPropagation(); const sx = e.clientX, sw = size.width; const move = (re: MouseEvent) => { setSize(s => ({...s, width: Math.max(300, sw + (re.clientX - sx))})); }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                    
                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-20" onMouseDown={(e) => { e.stopPropagation(); const sx = e.clientX, sy = e.clientY, sw = size.width, sh = size.height, px = position.x, py = position.y; const move = (re: MouseEvent) => { const dx = re.clientX - sx, dy = re.clientY - sy; if(sw - dx >= 300 && sh - dy >= 200) { setSize({width: sw - dx, height: sh - dy}); setPosition({x: px + dx, y: py + dy}); } }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                    <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-20" onMouseDown={(e) => { e.stopPropagation(); const sx = e.clientX, sy = e.clientY, sw = size.width, sh = size.height, py = position.y; const move = (re: MouseEvent) => { const dx = re.clientX - sx, dy = re.clientY - sy; if(sh - dy >= 200) { setSize({width: Math.max(300, sw + dx), height: sh - dy}); setPosition(p=>({...p, y: py + dy})); } }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                    <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-20" onMouseDown={(e) => { e.stopPropagation(); const sx = e.clientX, sy = e.clientY, sw = size.width, sh = size.height, px = position.x; const move = (re: MouseEvent) => { const dx = re.clientX - sx, dy = re.clientY - sy; if(sw - dx >= 300) { setSize({width: sw - dx, height: Math.max(200, sh + dy)}); setPosition(p=>({...p, x: px + dx})); } }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                    <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20 flex items-end justify-end p-[2px]" onMouseDown={(e) => { e.stopPropagation(); const sx = e.clientX, sy = e.clientY, sw = size.width, sh = size.height; const move = (re: MouseEvent) => { setSize({width: Math.max(300, sw + (re.clientX - sx)), height: Math.max(200, sh + (re.clientY - sy))}); }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }}> 
                        <svg className="w-3 h-3 text-slate-500 opacity-50 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v6h-6M21 21l-7-7" /></svg>
                    </div>
                </>
            )}
            
            {/* Floating Marker List */}
            {showMarkersList && (
                <div 
                    className="fixed z-[1002] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl flex flex-col w-72 max-h-[500px]"
                    style={{ top: markersListPos.y, left: markersListPos.x }}
                >
                    <div 
                        className="p-2 bg-slate-700 text-xs font-bold text-slate-300 border-b border-slate-600 flex justify-between items-center cursor-move rounded-t-lg select-none"
                        onMouseDown={(e) => {
                            markersListDrag.current = { isDragging: true, startX: e.clientX, startY: e.clientY, initPx: markersListPos.x, initPy: markersListPos.y };
                            const move = (me: MouseEvent) => {
                                if (!markersListDrag.current.isDragging) return;
                                setMarkersListPos({
                                    x: markersListDrag.current.initPx + (me.clientX - markersListDrag.current.startX),
                                    y: markersListDrag.current.initPy + (me.clientY - markersListDrag.current.startY)
                                });
                            };
                            const up = () => {
                                markersListDrag.current.isDragging = false;
                                window.removeEventListener('mousemove', move);
                                window.removeEventListener('mouseup', up);
                            };
                            window.addEventListener('mousemove', move);
                            window.addEventListener('mouseup', up);
                        }}
                    >
                        <div className="flex items-center gap-2 pointer-events-none">
                            <List className="w-3 h-3 text-emerald-400" />
                            <span>Elenco Marker</span>
                        </div>
                        <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setShowMarkersList(false)} className="hover:text-white text-slate-400"><X className="w-3 h-3"/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 gap-2 flex flex-col">
                        {markersByPage.length === 0 && <span className="text-xs text-slate-500 p-2 italic">Nessun marker</span>}
                        {markersByPage.map((pageGrp, i) => (
                            <div key={i} id={`toc-page-${pageGrp.pageNum}`} className="mb-2">
                                <div className="text-xs font-bold text-slate-400 mb-1 border-b border-slate-700 pb-1">Pagina {pageGrp.pageNum}</div>
                                {pageGrp.groups.map(g => (
                                    <div key={g.id} className="flex gap-1 mb-1">
                                        {g.markers.map(m => (
                                            <button
                                                key={m.id}
                                                onClick={() => {
                                                    if (isAutoScrolling) {
                                                        isDeviatedRef.current = true;
                                                        setIsDeviated(true);
                                                    }
                                                    m.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                }}
                                                className={`text-xs p-1.5 bg-slate-900 rounded hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors shadow-sm flex items-center justify-center truncate ${g.markers.length > 1 ? 'flex-1' : 'w-full justify-start'}`}
                                                title={m.label}
                                            >
                                                {isAutoScrolling && pageGrp.pageNum < currentPage && (
                                                    <span className="text-emerald-500 mr-1 font-bold">✓</span>
                                                )}
                                                <span className="truncate">{g.markers.length > 1 ? m.label.split(' ')[0] : m.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                .script-content p { margin-bottom: 0.75rem; }
                .script-content h1, .script-content h2, .script-content h3 { font-weight: bold; margin-bottom: 1rem; margin-top: 1.5rem; }
                .script-content h1 { font-size: 1.5rem; }
                .script-content h2 { font-size: 1.25rem; }
                .script-content ul { list-style: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
                .script-content table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
                .script-content td, .script-content th { border: 1px solid #cbd5e1; padding: 0.5rem; }
                
                /* Highlighting Classes */
                .hl-shout { background-color: #ffff00; color: #000000; font-weight: bold; padding: 0 4px; border-radius: 2px; }
                .hl-enter-exit { background-color: #38bdf8; color: #082f49; font-style: italic; font-weight: bold; padding: 0 4px; border-radius: 4px; display: inline-block; }

                /* Markers */
                .script-marker {
                    display: inline-block;
                    white-space: nowrap;
                    align-items: center;
                    justify-content: center;
                    background-color: #1e293b;
                    color: #bae6fd;
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-size: 0.75rem;
                    font-family: ui-sans-serif, system-ui, sans-serif;
                    margin: 0 4px;
                    cursor: pointer;
                    user-select: none;
                    border: 1px solid #0ea5e9;
                    position: relative;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    font-weight: bold;
                    vertical-align: middle;
                }
                .script-marker[data-type="page"] {
                    display: block !important;
                    width: 100%;
                    margin: 2rem 0;
                    border: none !important;
                    border-top: 2px dashed #94a3b8 !important;
                    background: transparent !important;
                    color: #94a3b8 !important;
                    font-size: 0.75rem !important;
                    text-align: right;
                    padding: 4px 0 0 0 !important;
                    box-shadow: none !important;
                    pointer-events: none;
                    border-radius: 0 !important;
                    text-shadow: none !important;
                }
                .pagination-mode .script-marker[data-type="page"] {
                    display: inline-flex !important;
                    width: auto !important;
                    margin: 0 4px !important;
                    color: white !important;
                    background-color: #eab308 !important;
                    border: 2px solid #a16207 !important;
                    border-radius: 9999px !important;
                    padding: 2px 8px !important;
                    font-size: 0.75rem !important;
                    font-weight: 900 !important;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3) !important;
                    pointer-events: auto !important;
                }
                .script-marker[data-type="time"] { border-color: #8b5cf6; color: #ddd6fe; border-width: 2px;}
                .script-marker[data-type="playlist"] { border-color: #4ade80; color: #4ade80; text-shadow: 0 0 5px rgba(74,222,128,0.5); border-width: 2px; } 
                .script-marker[data-type="sfx"] { border-color: #00ffff; color: #00ffff; text-shadow: 0 0 5px rgba(0,255,255,0.5); border-width: 2px;}
                .script-marker[data-type="light"] { border-color: #ff6700; color: #ff6700; text-shadow: 0 0 5px rgba(255,103,0,0.5); border-width: 2px;}
                .script-marker[data-type="proj"] { border-color: #ec4899; color: #fbcfe8; border-width: 2px;}
                .script-marker[data-type="note"] { border-color: #22c55e; color: #4ade80; border-width: 2px;}
                .script-marker[data-type="info"] { border-color: #3b82f6; color: #bfdbfe; border-width: 2px;}
                .script-marker[data-type="multi"] { border-color: #fbbf24; color: #fef3c7; border-width: 2px;}
                .script-marker[data-type="multi"] .multi-subitem { display: inline-flex; align-items: center; }

                .script-marker[data-pinned="true"]:hover::after {
                     display: none !important;
                }

                .script-marker .pinned-note-box {
                    position: absolute;
                    background-color: #fef08a; /* amber-200 */
                    color: #713f12; /* amber-900 */
                    border: 1px solid #fbbf24; /* amber-400 */
                    padding: 8px;
                    border-radius: 4px;
                    white-space: pre-wrap;
                    z-index: 40;
                    min-width: 100px;
                    min-height: 50px;
                    resize: both;
                    overflow: auto;
                    box-shadow: 2px 4px 6px rgba(0,0,0,0.3);
                    font-size: 0.8rem;
                    font-weight: normal;
                    font-family: ui-sans-serif, system-ui, sans-serif;
                    cursor: move;
                    text-align: left;
                }

                .script-marker[data-note]:not([data-note=""]):hover::after {
                    content: attr(data-note);
                    position: absolute;
                    background: #0f172a;
                    color: #e0f2fe;
                    padding: 8px 12px;
                    border-radius: 6px;
                    top: -45px;
                    left: 50%;
                    transform: translateX(-50%);
                    white-space: pre-wrap;
                    min-width: 150px;
                    text-align: center;
                    z-index: 50;
                    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.5);
                    border: 1px solid #38bdf8;
                    font-size: 0.8rem;
                    font-weight: normal;
                }
            `}</style>
        </div>
    );
};

export default ScriptPanel;
