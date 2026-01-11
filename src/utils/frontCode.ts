/**
 * Decodes a Front Coded string into a full string.
 * Format: <shared_len>\t<remainder>
 *
 * @param content The raw Front Coded content
 * @returns The decoded fully expanded content (joined by newlines)
 */
export function decodeFrontCode(content: string): string {
  if (!content) return '';

  // Quick check if it looks like Front Coded (starts with number + tab)
  // Determine if check is needed or if we assume caller knows.
  // Ideally, this utility just does one thing.
  // But for robustness, we can process line by line.

  const lines = content.split(/\r?\n/);
  const result: string[] = [];
  let prevLine = '';

  for (const line of lines) {
    if (!line) continue;

    // Check for tab separator
    const sepIndex = line.indexOf('\t');
    if (sepIndex !== -1) {
      // Try to parse the prefix length
      // If the file is mixed or malformed, we might want fallback?
      // Assuming strictly generated FC format here for speed.
      const sharedLenStr = line.substring(0, sepIndex);

      // Optimization: check if it is a number
      if (/^\d+$/.test(sharedLenStr)) {
        const sharedLen = parseInt(sharedLenStr, 10);
        const remainder = line.substring(sepIndex + 1);
        const fullLine = prevLine.substring(0, sharedLen) + remainder;
        result.push(fullLine);
        prevLine = fullLine;
        continue;
      }
    }

    // Fallback: treat as plain line (or first line if 0\t is explicit)
    // Actually, usually first line is 0\tLine.
    // If we encounter a line without tab, we just treat it as new full line?
    // Let's assume standard FC: always <len>\t<string>
    // But my compressor might produce mixed? No, Compressor produces always shared\t...
    // The previous implementation handled lines without tab as "full line".

    result.push(line);
    prevLine = line;
  }

  return result.join('\n');
}

/**
 * Encodes a list of strings using Front Coding.
 * Format: <shared_len>\t<remainder>
 *
 * @param lines The list of strings to encode (must be sorted for effectiveness)
 * @returns The encoded content (lines joined by newlines)
 */
export function encodeFrontCode(lines: string[]): string {
  const resultLines: string[] = [];
  let prevLine = '';

  for (const line of lines) {
    let shared = 0;
    const minLen = Math.min(prevLine.length, line.length);
    while (shared < minLen && prevLine[shared] === line[shared]) {
      shared++;
    }
    const remainder = line.slice(shared);
    resultLines.push(`${shared}\t${remainder}`);
    prevLine = line;
  }
  return resultLines.join('\n');
}
