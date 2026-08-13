export class BinaryPrefixSearchEngine {
  private buffer: Uint8Array;
  private view: DataView;

  public readonly stringCount: number;
  public readonly charCount: number;
  public readonly blockSize: number;
  public readonly blockCount: number;

  private charMapOffset: number;
  private postingStreamOffset: number;
  private blockIndexOffset: number;
  private textStreamOffset: number;

  constructor(arrayBuffer: ArrayBuffer | Uint8Array) {
    if (arrayBuffer instanceof Uint8Array) {
      this.buffer = arrayBuffer;
    } else {
      this.buffer = new Uint8Array(arrayBuffer);
    }
    this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);

    const magic = String.fromCharCode(this.buffer[0]!, this.buffer[1]!, this.buffer[2]!, this.buffer[3]!);
    if (magic !== 'ZPF1') {
      throw new Error(`Invalid binary prefixes magic header: ${magic}`);
    }

    this.stringCount = this.view.getUint32(6, true);
    this.charCount = this.view.getUint16(10, true);
    this.blockSize = this.view.getUint16(12, true);
    this.blockCount = this.view.getUint16(14, true);

    this.charMapOffset = this.view.getUint32(16, true);
    this.postingStreamOffset = this.view.getUint32(20, true);
    this.blockIndexOffset = this.view.getUint32(24, true);
    this.textStreamOffset = this.view.getUint32(28, true);
  }

  /**
   * Search candidate strings matching query with zero-expansion
   */
  public search(query: string): Array<{ text: string; index: number }> {
    if (!query) return [];

    for (const char of query) {
      if ((char.codePointAt(0) ?? 0) > 0xffff) {
        return [];
      }
    }

    const lists: Uint16Array[] = [];
    for (let c = 0; c < query.length; c++) {
      const code = query.charCodeAt(c);
      const postingList = this.getPostingList(code);
      if (!postingList || postingList.length === 0) return [];
      lists.push(postingList);
    }

    lists.sort((a, b) => a.length - b.length);
    let candidateIds = lists[0];

    for (let i = 1; i < lists.length; i++) {
      candidateIds = this.intersectSortedUint16(candidateIds, lists[i]);
      if (candidateIds.length === 0) return [];
    }

    const results: Array<{ text: string; index: number }> = [];
    for (let i = 0; i < candidateIds.length; i++) {
      const id = candidateIds[i];
      const addr = this.decodeStringById(id);
      if (this.isSubsequence(addr, query)) {
        results.push({ text: addr, index: id });
      }
    }
    return results;
  }

  private getPostingList(charCode: number): Uint16Array | null {
    let left = 0;
    let right = this.charCount - 1;

    while (left <= right) {
      const mid = (left + right) >>> 1;
      const pos = this.charMapOffset + mid * 10;
      const code = this.view.getUint16(pos, true);

      if (code < charCode) {
        left = mid + 1;
      } else if (code > charCode) {
        right = mid - 1;
      } else {
        const pOffset = this.view.getUint32(pos + 2, true);
        const pLen = this.view.getUint32(pos + 6, true);
        const absByteOffset = this.buffer.byteOffset + this.postingStreamOffset + pOffset;

        return new Uint16Array(this.buffer.buffer, absByteOffset, pLen);
      }
    }

    return null;
  }

  private stringCache: Map<number, string> = new Map();

  /**
   * Lazily decode string by string ID from its 64-string block (cached)
   */
  public decodeStringById(targetId: number): string {
    if (targetId < 0 || targetId >= this.stringCount) return '';

    const cached = this.stringCache.get(targetId);
    if (cached !== undefined) return cached;

    const blockIdx = Math.floor(targetId / this.blockSize);
    const offsetInBlock = targetId % this.blockSize;

    const blockPos = this.blockIndexOffset + blockIdx * 8;
    const relTextOffset = this.view.getUint32(blockPos, true);

    let cursor = this.textStreamOffset + relTextOffset;
    const decoder = new TextDecoder('utf-8');

    // Decode Anchor String (String 0 in block)
    const anchorLen = this.view.getUint16(cursor, true);
    cursor += 2;

    if (offsetInBlock === 0) {
      const anchorStr = decoder.decode(this.buffer.subarray(cursor, cursor + anchorLen));
      if (this.stringCache.size < 5000) this.stringCache.set(targetId, anchorStr);
      return anchorStr;
    }

    const currentBytes = new Uint8Array(128);
    currentBytes.set(this.buffer.subarray(cursor, cursor + anchorLen), 0);
    let currentLen = anchorLen;
    cursor += anchorLen;

    // Decode Front Coded byte streams in block up to offsetInBlock
    for (let i = 1; i <= offsetInBlock; i++) {
      const sharedBytes = this.buffer[cursor++];
      const remLen = this.buffer[cursor++];

      currentBytes.set(this.buffer.subarray(cursor, cursor + remLen), sharedBytes);
      currentLen = sharedBytes + remLen;
      cursor += remLen;
    }

    const decodedStr = decoder.decode(currentBytes.subarray(0, currentLen));
    if (this.stringCache.size < 5000) this.stringCache.set(targetId, decodedStr);
    return decodedStr;
  }

  private intersectSortedUint16(arr1: Uint16Array, arr2: Uint16Array): Uint16Array {
    const maxLen = Math.min(arr1.length, arr2.length);
    const temp = new Uint16Array(maxLen);
    let i = 0,
      j = 0,
      k = 0;
    const len1 = arr1.length,
      len2 = arr2.length;

    while (i < len1 && j < len2) {
      const val1 = arr1[i],
        val2 = arr2[j];
      if (val1 < val2) i++;
      else if (val1 > val2) j++;
      else {
        temp[k++] = val1;
        i++;
        j++;
      }
    }
    return temp.subarray(0, k);
  }

  private isSubsequence(text: string, query: string): boolean {
    let textIdx = 0,
      queryIdx = 0;
    const queryLen = query.length;
    while (queryIdx < queryLen) {
      const foundIdx = text.indexOf(query[queryIdx], textIdx);
      if (foundIdx === -1) return false;
      textIdx = foundIdx + 1;
      queryIdx++;
    }
    return true;
  }
}
