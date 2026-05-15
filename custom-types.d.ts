declare module 'mammoth/mammoth.browser.js' {
    export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: any[] }>;
    // Add other functions if needed
}
