export class AddressSearchEngineOptimized {
  private addresses: string[] = [];
  private index: Map<string, Uint16Array> = new Map();

  constructor(content: string) {
    this.preprocess(content);
  }

  private preprocess(content: string) {
    this.addresses = content.split(/\r?\n/).filter((line) => line.length > 0);
    const tempIndex = new Map<string, number[]>();

    for (let id = 0; id < this.addresses.length; id++) {
      const addr = this.addresses[id];
      const uniqueChars = new Set(addr);
      for (const char of uniqueChars) {
        let list = tempIndex.get(char);
        if (!list) {
          list = [];
          tempIndex.set(char, list);
        }
        list.push(id);
      }
    }

    for (const [char, list] of tempIndex) {
      this.index.set(char, new Uint16Array(list));
    }
  }

  public search(query: string): Array<{ text: string; index: number }> {
    if (!query) return [];
    const lists: Uint16Array[] = [];
    for (const char of query) {
      const list = this.index.get(char);
      if (!list) return [];
      lists.push(list);
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
      const addr = this.addresses[id];
      if (this.isSubsequence(addr, query)) {
        results.push({ text: addr, index: id });
      }
    }
    return results;
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
    return temp.slice(0, k);
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
