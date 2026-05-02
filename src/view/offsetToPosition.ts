export function offsetToPosition(content: string, offset: number): { line: number; col: number } {
    const limit = Math.min(offset, content.length);
    let line = 0;
    let col = 0;
    for (let i = 0; i < limit; i++) {
        if (content.charAt(i) === "\n") {
            line++;
            col = 0;
        } else {
            col++;
        }
    }
    return { line, col };
}
