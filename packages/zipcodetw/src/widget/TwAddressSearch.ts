import type { SearchMatch } from '../core/types.ts';
import { ZipCodeTw } from '../ZipCodeTw.ts';
import { parseCityDistrict } from './taiwanDistricts.ts';
import type { AddressCandidate, AddressChangeEventDetail, AddressStatus } from './TwAddressPicker.ts';

const CustomElementBase =
  typeof HTMLElement !== 'undefined'
    ? HTMLElement
    : (class {
        private _attrs: Record<string, string> = {};
        protected getAttribute(name: string): string | null {
          return this._attrs[name] !== undefined ? this._attrs[name] : null;
        }
        protected hasAttribute(name: string): boolean {
          return this._attrs[name] !== undefined;
        }
        protected setAttribute(name: string, value: string): void {
          this._attrs[name] = String(value);
        }
        protected removeAttribute(name: string): void {
          delete this._attrs[name];
        }
        public dispatchEvent(_event: any): boolean {
          return true;
        }
        public addEventListener(_type: string, _listener: any, _options?: any): void {}
        public removeEventListener(_type: string, _listener: any, _options?: any): void {}
      } as unknown as typeof HTMLElement);

export class TwAddressSearch extends CustomElementBase {
  private zipEngine: ZipCodeTw | null = null;
  private shadow: ShadowRoot;

  // DOM references inside Shadow Root
  private detailInput!: HTMLInputElement;
  private badgeElement!: HTMLElement;
  private candidateContainer!: HTMLElement;
  private candidateMenu!: HTMLElement;

  // Internal state
  private currentDetail = '';
  private selectedZipcode = '';
  private currentMatches: SearchMatch[] = [];
  private isDropdownOpen = false;

  static get observedAttributes() {
    return ['prefixes-url', 'rules-url', 'disabled', 'name', 'theme', 'placeholder'];
  }

  constructor() {
    super();
    if (typeof (this as any).attachShadow === 'function') {
      this.shadow = this.attachShadow({ mode: 'open' });
    } else {
      this.shadow = {} as ShadowRoot;
    }
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
    this.initEngineFromAttributes();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    if (name === 'prefixes-url' || name === 'rules-url') {
      this.initEngineFromAttributes();
    } else if (name === 'disabled') {
      this.updateDisabledState();
    } else if (name === 'placeholder') {
      this.updatePlaceholder();
    }
  }

  public set zipCodeTw(engine: ZipCodeTw | null) {
    this.zipEngine = engine;
    this.calculateZipCode();
  }

  public get zipCodeTw(): ZipCodeTw | null {
    return this.zipEngine;
  }

  public get value(): AddressChangeEventDetail {
    const fullAddress = this.currentDetail.trim();
    const parsed = fullAddress ? parseCityDistrict(fullAddress) : { city: '', district: '', detail: '' };

    let city = parsed.city;
    let district = parsed.district;
    let detail = parsed.detail || fullAddress;

    let status: AddressStatus = 'empty';
    let isExact = false;
    let isValid = false;
    let zipcode = '';
    let candidates: AddressCandidate[] | undefined = undefined;

    if (!fullAddress) {
      status = 'empty';
    } else if (this.currentMatches.length === 0) {
      status = 'no_match';
    } else if (this.selectedZipcode) {
      status = 'exact';
      zipcode = this.selectedZipcode;
      isExact = true;
      isValid = true;

      const topMatch = this.currentMatches.find((m) => m.zipcode === zipcode) || this.currentMatches[0];
      if (topMatch && (!city || !district)) {
        const matchParsed = parseCityDistrict(`${topMatch.part1}${topMatch.part2}`);
        if (!city) city = matchParsed.city;
        if (!district) district = matchParsed.district;
      }
    } else {
      status = 'need_selection';
      candidates = this.getCandidates(this.currentMatches);

      const topMatch = this.currentMatches[0];
      if (topMatch && (!city || !district)) {
        const matchParsed = parseCityDistrict(`${topMatch.part1}${topMatch.part2}`);
        if (!city) city = matchParsed.city;
        if (!district) district = matchParsed.district;
      }
    }

    const zipcode3 = this.getZipcode3(city, district);

    return {
      city,
      district,
      detail,
      fullAddress,
      zipcode,
      zipcode3,
      status,
      isValid,
      isExact,
      ...(candidates ? { candidates } : {}),
    };
  }

  private getZipcode3(city: string, district: string): string {
    if (!this.zipEngine) return '';

    if (this.selectedZipcode && this.selectedZipcode.length >= 3) {
      return this.selectedZipcode.slice(0, 3);
    }

    if (city && district) {
      const districtMatches = this.zipEngine.search(`${city}${district}`);
      if (districtMatches.length > 0) {
        const counts: Record<string, number> = {};
        let maxCount = 0;
        let majorityZ3 = '';

        for (const m of districtMatches) {
          if (m.zipcode && m.zipcode.length >= 3) {
            const z3 = m.zipcode.slice(0, 3);
            const newCount = (counts[z3] || 0) + 1;
            counts[z3] = newCount;
            if (newCount > maxCount) {
              maxCount = newCount;
              majorityZ3 = z3;
            }
          }
        }
        return majorityZ3;
      }
    }
    return '';
  }

  private getCandidates(matches: SearchMatch[]): AddressCandidate[] {
    const items: AddressCandidate[] = [];
    const seen = new Set<string>();

    for (const m of matches) {
      const key = `${m.zipcode}_${m.bulkName}`;
      if (!seen.has(key)) {
        seen.add(key);
        const label = m.bulkName ? `${m.part1}${m.part2} (${m.bulkName})` : `${m.part1}${m.part2}`;
        items.push({ zipcode: m.zipcode, label });
      }
    }
    return items;
  }

  public search(query: string) {
    this.currentDetail = query;
    if (this.detailInput) this.detailInput.value = query;
    this.selectedZipcode = '';
    this.calculateZipCode();
    this.emitChangeEvent();
  }

  public clear() {
    this.currentDetail = '';
    this.selectedZipcode = '';
    this.currentMatches = [];
    if (this.detailInput) this.detailInput.value = '';
    this.calculateZipCode();
    this.emitChangeEvent();
  }

  private async initEngineFromAttributes() {
    if (typeof this.getAttribute !== 'function') return;
    const prefixesUrl = this.getAttribute('prefixes-url');
    const rulesUrl = this.getAttribute('rules-url');
    if (prefixesUrl && rulesUrl && !this.zipEngine) {
      try {
        this.zipEngine = await ZipCodeTw.create(prefixesUrl, rulesUrl);
        this.calculateZipCode();
      } catch (err) {
        console.error('TwAddressSearch failed to load ZipCodeTw engine:', err);
      }
    }
  }

  private updatePlaceholder() {
    if (!this.detailInput) return;
    const customPlaceholder = typeof this.getAttribute === 'function' ? this.getAttribute('placeholder') : null;
    this.detailInput.placeholder = customPlaceholder || '請輸入完整地址 (例: 臺北市大安區和平東路三段1號)';
  }

  private render() {
    const style = `
      :host {
        display: block;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color-scheme: light dark;

        /* Theme Variables */
        --picker-bg: var(--bg-card, var(--bg-color, #18181b));
        --picker-text: var(--text-color, #f4f4f5);
        --picker-border: var(--border-color, #27272a);
        --picker-input-bg: var(--input-bg, #09090b);
        --picker-input-border: var(--input-border, #3f3f46);
        --primary-color: #52525b;
        --primary-focus: #71717a;

        --active-bg: #27272a;
        --active-text: #fafafa;
        --active-border: #52525b;

        --candidate-bg: #27272a;
        --candidate-text: #f4f4f5;
        --candidate-border: #3f3f46;

        --gray-bg: #18181b;
        --gray-text: #a1a1aa;
        --radius: 8px;
      }

      @media (prefers-color-scheme: light) {
        :host {
          --picker-bg: var(--bg-card, #ffffff);
          --picker-text: var(--text-color, #18181b);
          --picker-border: var(--border-color, #e4e4e7);
          --picker-input-bg: var(--input-bg, #ffffff);
          --picker-input-border: var(--input-border, #d4d4d8);
          --primary-color: #52525b;
          --primary-focus: #3f3f46;

          --active-bg: #f4f4f5;
          --active-text: #18181b;
          --active-border: #a1a1aa;

          --candidate-bg: #f4f4f5;
          --candidate-text: #18181b;
          --candidate-border: #e4e4e7;

          --gray-bg: #fafafa;
          --gray-text: #71717a;
        }
      }

      * {
        box-sizing: border-box;
      }

      .picker-container {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        width: 100%;
        background-color: var(--picker-bg);
        color: var(--picker-text);
        border: 1px solid var(--picker-border);
        border-radius: var(--radius);
        padding: 12px 16px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        position: relative;
      }

      input[type="text"] {
        padding: 10px 12px;
        font-size: 15px;
        border: 1px solid var(--picker-input-border);
        border-radius: var(--radius);
        background-color: var(--picker-input-bg);
        color: var(--picker-text);
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
        width: 100%;
      }

      input:focus-visible {
        border-color: var(--primary-focus);
        box-shadow: 0 0 0 3px rgba(113, 113, 122, 0.25);
      }

      .detail-wrapper {
        flex: 1 1 200px;
        min-width: 140px;
      }

      .badge-wrapper {
        position: relative;
        flex: 0 0 auto;
      }

      .zipcode-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 10px 12px;
        font-size: 15px;
        font-weight: 600;
        border-radius: var(--radius);
        transition: background-color 0.25s ease, border-color 0.25s ease;
        white-space: nowrap;
        user-select: none;
        min-width: 110px;
        text-align: center;
        height: 42px;
      }

      .zipcode-badge.idle {
        background-color: var(--gray-bg);
        color: var(--gray-text);
        border: 1px dashed var(--picker-border);
        cursor: default;
      }

      .zipcode-badge.active {
        background-color: var(--active-bg);
        color: var(--active-text);
        border: 1px solid var(--active-border);
        cursor: pointer;
      }

      .zipcode-badge.need-select {
        background-color: var(--candidate-bg);
        color: var(--candidate-text);
        border: 1px solid var(--candidate-border);
        cursor: pointer;
      }

      .zipcode-badge.active:hover, .zipcode-badge.need-select:hover {
        filter: brightness(0.95);
      }

      .candidate-popover {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        right: 0;
        width: 100%;
        max-height: 260px;
        background-color: var(--picker-bg);
        color: var(--picker-text);
        border: 1px solid var(--picker-border);
        border-radius: var(--radius);
        box-shadow: 0 10px 25px rgba(0,0,0,0.25);
        z-index: 100;
        display: none;
        overflow-y: auto;
      }

      .candidate-popover.show {
        display: block;
      }

      .popover-header {
        position: sticky;
        top: 0;
        padding: 8px 12px;
        background-color: var(--gray-bg);
        border-bottom: 1px solid var(--picker-border);
        font-size: 12px;
        font-weight: 600;
        color: var(--picker-text);
        opacity: 0.95;
        z-index: 1;
      }

      .popover-item {
        padding: 10px 12px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        font-size: 14px;
        border-bottom: 1px solid var(--picker-border);
        transition: background-color 0.15s;
        color: var(--picker-text);
      }

      .popover-item:last-child {
        border-bottom: none;
      }

      .popover-item:hover, .popover-item.selected {
        background-color: var(--candidate-bg);
      }

      .popover-zipcode {
        font-weight: bold;
        color: var(--picker-text);
        white-space: nowrap;
      }

      @media (max-width: 600px) {
        .picker-container {
          padding: 12px;
          gap: 8px;
        }

        .detail-wrapper {
          flex: 1 1 auto;
          min-width: 0;
        }

        input[type="text"] {
          font-size: 16px;
        }

        .badge-wrapper {
          flex: 0 0 auto;
        }
      }
    `;

    this.shadow.innerHTML = `
      <style>${style}</style>
      <div class="picker-container" part="container">
        <div class="detail-wrapper" part="detail-wrapper">
          <input type="text" id="detailInput" aria-label="詳細地址" part="input detail-input">
        </div>
        <div class="badge-wrapper" part="badge-wrapper">
          <div id="badge" class="zipcode-badge idle" title="郵遞區號運算狀態" part="badge zipcode-badge">
            <span id="badgeText" part="badge-text">郵遞區號</span>
          </div>
        </div>
        <div id="candidatePopover" class="candidate-popover" part="popover candidate-popover">
          <div class="popover-header" part="popover-header">請選擇正確投遞門牌範圍：</div>
          <div id="candidateList" part="popover-list candidate-list"></div>
        </div>
      </div>
    `;

    this.detailInput = this.shadow.getElementById('detailInput') as HTMLInputElement;
    this.badgeElement = this.shadow.getElementById('badge') as HTMLElement;
    this.candidateContainer = this.shadow.getElementById('candidatePopover') as HTMLElement;
    this.candidateMenu = this.shadow.getElementById('candidateList') as HTMLElement;

    this.updatePlaceholder();
  }

  private setupEventListeners() {
    this.detailInput.addEventListener('input', () => {
      this.currentDetail = this.detailInput.value;
      this.calculateZipCode();
      this.emitChangeEvent();
    });

    this.badgeElement.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.badgeElement.classList.contains('active') || this.badgeElement.classList.contains('need-select')) {
        this.toggleCandidatePopover();
      }
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('click', (e) => {
        if (!e.composedPath().includes(this)) {
          this.closeCandidatePopover();
        }
      });
    }
  }

  private calculateZipCode() {
    if (!this.zipEngine) {
      this.renderBadgeState('idle', '郵遞區號');
      return;
    }

    const query = this.currentDetail.trim();

    if (!query) {
      this.selectedZipcode = '';
      this.currentMatches = [];
      this.renderBadgeState('idle', '郵遞區號');
      return;
    }

    const matches = this.zipEngine.search(query);
    this.currentMatches = matches;

    const uniqueZipcodes = new Set(matches.map((m) => m.zipcode));

    if (uniqueZipcodes.size === 0) {
      this.selectedZipcode = '';
      this.renderBadgeState('idle', '未匹配');
    } else if (uniqueZipcodes.size === 1) {
      this.selectedZipcode = matches[0].zipcode;
      this.renderBadgeState('active', this.selectedZipcode);
    } else {
      if (!this.selectedZipcode || !uniqueZipcodes.has(this.selectedZipcode)) {
        this.selectedZipcode = '';
        this.renderBadgeState('need-select', '請選擇 ▾');
        this.renderCandidatePopover(matches);
      } else {
        this.renderBadgeState('active', `${this.selectedZipcode} ▾`);
      }
    }
  }

  private renderBadgeState(state: 'idle' | 'active' | 'need-select', text: string) {
    if (this.badgeElement) {
      this.badgeElement.className = `zipcode-badge ${state}`;
    }
    if (this.shadow && typeof this.shadow.getElementById === 'function') {
      const badgeText = this.shadow.getElementById('badgeText');
      if (badgeText) badgeText.textContent = text;
    }
  }

  private toggleCandidatePopover() {
    this.isDropdownOpen = !this.isDropdownOpen;
    if (this.candidateContainer) {
      if (this.isDropdownOpen) {
        this.candidateContainer.classList.add('show');
      } else {
        this.candidateContainer.classList.remove('show');
      }
    }
  }

  private closeCandidatePopover() {
    this.isDropdownOpen = false;
    if (this.candidateContainer) {
      this.candidateContainer.classList.remove('show');
    }
  }

  private renderCandidatePopover(matches: SearchMatch[]) {
    if (!this.candidateMenu) return;
    const items = this.getCandidates(matches);

    this.candidateMenu.innerHTML = items
      .map(
        (item) => `
        <div class="popover-item ${item.zipcode === this.selectedZipcode ? 'selected' : ''}" data-zip="${item.zipcode}" part="popover-item">
          <span style="font-size: 13px;">${item.label}</span>
          <span class="popover-zipcode" part="popover-zipcode">${item.zipcode}</span>
        </div>
      `
      )
      .join('');

    this.candidateMenu.querySelectorAll('.popover-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        const zip = (e.currentTarget as HTMLElement).dataset.zip;
        if (zip) {
          this.selectedZipcode = zip;
          this.renderBadgeState('active', `${zip} ▾`);
          this.closeCandidatePopover();
          this.emitChangeEvent();
        }
      });
    });
  }

  private updateDisabledState() {
    const isDisabled = typeof this.hasAttribute === 'function' ? this.hasAttribute('disabled') : false;
    if (this.detailInput) this.detailInput.disabled = isDisabled;
  }

  private emitChangeEvent() {
    const eventDetail = this.value;
    if (typeof this.dispatchEvent === 'function') {
      try {
        this.dispatchEvent(
          new CustomEvent('address-change', {
            detail: eventDetail,
            bubbles: true,
            composed: true,
          })
        );
        this.dispatchEvent(
          new CustomEvent('address-search', {
            detail: eventDetail,
            bubbles: true,
            composed: true,
          })
        );
        this.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {
        // Safe fallback for non-DOM test runners
      }
    }
  }
}

// Auto register custom element
if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  if (!customElements.get('tw-address-search')) {
    customElements.define('tw-address-search', TwAddressSearch);
  }
}
