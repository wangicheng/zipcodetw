import type { SearchMatch } from '../core/types.ts';
import { ZipCodeTw } from '../ZipCodeTw.ts';
import { normalizeCityName, TAIWAN_DISTRICTS } from './taiwanDistricts.ts';

export type AddressStatus = 'empty' | 'incomplete' | 'need_selection' | 'exact' | 'no_match';

export interface AddressCandidate {
  zipcode: string;
  label: string;
}

export interface AddressChangeEventDetail {
  city: string;
  district: string;
  detail: string;
  fullAddress: string;
  zipcode: string;
  zipcode3: string;
  status: AddressStatus;
  isValid: boolean;
  isExact: boolean;
  candidates?: AddressCandidate[];
}

const CustomElementBase = typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as typeof HTMLElement);

export class TwAddressPicker extends CustomElementBase {
  private zipEngine: ZipCodeTw | null = null;
  private shadow: ShadowRoot;

  // DOM references inside Shadow Root
  private citySelect!: HTMLSelectElement;
  private districtSelect!: HTMLSelectElement;
  private detailInput!: HTMLInputElement;
  private badgeElement!: HTMLElement;
  private candidateContainer!: HTMLElement;
  private candidateMenu!: HTMLElement;

  // Internal state
  private currentCity = '';
  private currentDistrict = '';
  private currentDetail = '';
  private selectedZipcode = '';
  private currentMatches: SearchMatch[] = [];
  private isDropdownOpen = false;

  static get observedAttributes() {
    return ['prefixes-url', 'rules-url', 'disabled', 'name', 'theme'];
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
    }
  }

  /**
   * Inject or set ZipCodeTw instance programmatically.
   */
  public set zipCodeTw(engine: ZipCodeTw | null) {
    this.zipEngine = engine;
    this.calculateZipCode();
  }

  public get zipCodeTw(): ZipCodeTw | null {
    return this.zipEngine;
  }

  /**
   * Get complete structured result.
   */
  public get value(): AddressChangeEventDetail {
    const fullAddress = `${this.currentCity}${this.currentDistrict}${this.currentDetail}`.trim();
    const zipcode3 = this.getZipcode3();

    let status: AddressStatus = 'empty';
    let isExact = false;
    let isValid = false;
    let zipcode = '';
    let candidates: AddressCandidate[] | undefined = undefined;

    if (!this.currentCity || !this.currentDistrict) {
      status = 'empty';
    } else if (!this.currentDetail) {
      status = 'incomplete';
    } else if (this.currentMatches.length === 0) {
      status = 'no_match';
    } else if (this.selectedZipcode) {
      status = 'exact';
      zipcode = this.selectedZipcode;
      isExact = true;
      isValid = true;
    } else {
      status = 'need_selection';
      candidates = this.getCandidates(this.currentMatches);
    }

    return {
      city: this.currentCity,
      district: this.currentDistrict,
      detail: this.currentDetail,
      fullAddress,
      zipcode,
      zipcode3,
      status,
      isValid,
      isExact,
      ...(candidates ? { candidates } : {}),
    };
  }

  private getZipcode3(): string {
    if (!this.zipEngine || !this.currentCity || !this.currentDistrict) {
      return '';
    }
    // 1. If 6-digit zipcode is selected (or uniquely determined), return its 3-digit prefix
    if (this.selectedZipcode && this.selectedZipcode.length >= 3) {
      return this.selectedZipcode.slice(0, 3);
    }
    // 2. If detail is empty, calculate the majority 3-digit prefix for the district to avoid border exceptions
    const districtMatches = this.zipEngine.search(`${this.currentCity}${this.currentDistrict}`);
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

  /**
   * Set address programmatically.
   */
  public setAddress(address: { city?: string; district?: string; detail?: string }) {
    if (address.city !== undefined) {
      this.currentCity = normalizeCityName(address.city);
      if (this.citySelect) this.citySelect.value = this.currentCity;
      this.populateDistricts();
    }
    if (address.district !== undefined) {
      this.currentDistrict = address.district;
      if (this.districtSelect) this.districtSelect.value = this.currentDistrict;
    }
    if (address.detail !== undefined) {
      this.currentDetail = address.detail;
      if (this.detailInput) this.detailInput.value = this.currentDetail;
    }
    this.calculateZipCode();
  }

  private async initEngineFromAttributes() {
    const prefixesUrl = this.getAttribute('prefixes-url');
    const rulesUrl = this.getAttribute('rules-url');
    if (prefixesUrl && rulesUrl && !this.zipEngine) {
      try {
        this.zipEngine = await ZipCodeTw.create(prefixesUrl, rulesUrl);
        this.calculateZipCode();
      } catch (err) {
        console.error('TwAddressPicker failed to load ZipCodeTw engine:', err);
      }
    }
  }

  private render() {
    const style = `
      :host {
        display: block;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color-scheme: light dark;

        /* Low-key Dark Slate Gray Theme Variables */
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
        flex-direction: column;
        gap: 12px;
        width: 100%;
        background-color: var(--picker-bg);
        color: var(--picker-text);
        border: 1px solid var(--picker-border);
        border-radius: var(--radius);
        padding: 16px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        position: relative;
      }

      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }

      .select-group {
        display: flex;
        gap: 8px;
        flex: 1 1 260px;
      }

      select, input[type="text"] {
        padding: 10px 12px;
        font-size: 15px;
        border: 1px solid var(--picker-input-border);
        border-radius: var(--radius);
        background-color: var(--picker-input-bg);
        color: var(--picker-text);
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      option {
        background-color: var(--picker-input-bg);
        color: var(--picker-text);
      }

      select {
        flex: 1;
        min-width: 110px;
        cursor: pointer;
      }

      select:focus-visible, input:focus-visible {
        border-color: var(--primary-focus);
        box-shadow: 0 0 0 3px rgba(113, 113, 122, 0.25);
      }

      input[type="text"] {
        width: 100%;
      }

      .detail-wrapper {
        position: relative;
        width: 100%;
      }

      /* Clean Standard Low-Key Form Box ZipCode Badge Styling */
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

      /* Candidate Dropdown Popover */
      .candidate-popover {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 6px;
        width: 320px;
        background-color: var(--picker-bg);
        color: var(--picker-text);
        border: 1px solid var(--picker-border);
        border-radius: var(--radius);
        box-shadow: 0 10px 25px rgba(0,0,0,0.25);
        z-index: 100;
        display: none;
        overflow: hidden;
      }

      .candidate-popover.show {
        display: block;
      }

      .popover-header {
        padding: 8px 12px;
        background-color: var(--gray-bg);
        border-bottom: 1px solid var(--picker-border);
        font-size: 12px;
        font-weight: 600;
        color: var(--picker-text);
        opacity: 0.85;
      }

      .popover-item {
        padding: 10px 12px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
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
      }
    `;

    const citiesHtml = Object.keys(TAIWAN_DISTRICTS)
      .map((c) => `<option value="${c}">${c}</option>`)
      .join('');

    this.shadow.innerHTML = `
      <style>${style}</style>
      <div class="picker-container" role="region" aria-label="台灣地址與郵遞區號選擇器">
        <div class="row">
          <div class="select-group">
            <select id="citySelect" aria-label="選擇縣市">
              <option value="">-- 請選擇縣市 --</option>
              ${citiesHtml}
            </select>
            <select id="districtSelect" aria-label="選擇鄉鎮市區">
              <option value="">-- 請選擇區域 --</option>
            </select>
          </div>
          <div style="position: relative;">
            <div id="badge" class="zipcode-badge idle" role="status" aria-live="polite">
              <span id="badgeText">------</span>
            </div>
            <div id="candidatePopover" class="candidate-popover">
              <div class="popover-header" id="popoverHeader">符合的郵遞區號 (請點選)：</div>
              <div id="candidateList"></div>
            </div>
          </div>
        </div>
        <div class="row">
          <div class="detail-wrapper">
            <input type="text" id="detailInput" placeholder="請輸入門牌地址 (例如: 和平東路三段100號)" aria-label="門牌詳細地址">
          </div>
        </div>
      </div>
    `;

    this.citySelect = this.shadow.getElementById('citySelect') as HTMLSelectElement;
    this.districtSelect = this.shadow.getElementById('districtSelect') as HTMLSelectElement;
    this.detailInput = this.shadow.getElementById('detailInput') as HTMLInputElement;
    this.badgeElement = this.shadow.getElementById('badge') as HTMLElement;
    this.candidateContainer = this.shadow.getElementById('candidatePopover') as HTMLElement;
    this.candidateMenu = this.shadow.getElementById('candidateList') as HTMLElement;
  }

  private setupEventListeners() {
    this.citySelect.addEventListener('change', () => {
      this.currentCity = this.citySelect.value;
      this.populateDistricts();
      this.currentDistrict = this.districtSelect.value;
      this.calculateZipCode();
      this.emitChangeEvent();
    });

    this.districtSelect.addEventListener('change', () => {
      this.currentDistrict = this.districtSelect.value;
      this.calculateZipCode();
      this.emitChangeEvent();
    });

    this.detailInput.addEventListener('input', () => {
      this.currentDetail = this.detailInput.value;
      this.handlePasteAndAddressDetection();
      this.calculateZipCode();
      this.emitChangeEvent();
    });

    this.badgeElement.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.badgeElement.classList.contains('active') || this.badgeElement.classList.contains('need-select')) {
        this.toggleCandidatePopover();
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.composedPath().includes(this)) {
        this.closeCandidatePopover();
      }
    });
  }

  private populateDistricts() {
    const districts = TAIWAN_DISTRICTS[this.currentCity] || [];
    if (this.districtSelect) {
      this.districtSelect.innerHTML = '<option value="">-- 請選擇區域 --</option>' + districts.map((d) => `<option value="${d}">${d}</option>`).join('');
    }
    this.currentDistrict = '';
  }

  private handlePasteAndAddressDetection() {
    const text = this.currentDetail.trim();
    if (!text) return;

    for (const city of Object.keys(TAIWAN_DISTRICTS)) {
      const normalizedCity = city;
      const alias1 = city.replace('臺', '台');
      if (text.startsWith(normalizedCity) || text.startsWith(alias1)) {
        const matchCity = city;
        const remaining = text.replace(normalizedCity, '').replace(alias1, '');
        this.currentCity = matchCity;
        this.citySelect.value = matchCity;
        this.populateDistricts();

        const districts = TAIWAN_DISTRICTS[matchCity] || [];
        for (const dist of districts) {
          if (remaining.startsWith(dist)) {
            this.currentDistrict = dist;
            this.districtSelect.value = dist;
            this.currentDetail = remaining.replace(dist, '').trim();
            this.detailInput.value = this.currentDetail;
            break;
          }
        }
        break;
      }
    }
  }

  private calculateZipCode() {
    if (!this.zipEngine) {
      this.renderBadgeState('idle', '------');
      return;
    }

    const fullQuery = `${this.currentCity}${this.currentDistrict}${this.currentDetail}`.trim();
    if (!this.currentCity || !this.currentDistrict || !this.currentDetail) {
      this.selectedZipcode = '';
      this.currentMatches = [];
      this.renderBadgeState('idle', '------');
      return;
    }

    const matches = this.zipEngine.search(fullQuery);
    this.currentMatches = matches;

    if (matches.length === 0) {
      this.selectedZipcode = '';
      this.renderBadgeState('idle', '無匹配');
      return;
    }

    const uniqueZipcodes = Array.from(new Set(matches.map((m) => m.zipcode)));

    if (uniqueZipcodes.length === 1) {
      // Exactly 1 unique ZIP code: Auto select
      this.selectedZipcode = uniqueZipcodes[0];
      this.renderBadgeState('active', `${this.selectedZipcode} ▾`);
      this.renderCandidatePopover(matches);
    } else {
      // Multiple candidates: DO NOT AUTO SELECT! Force user to pick
      this.selectedZipcode = '';
      this.renderBadgeState('need-select', '請選擇 ▾');
      this.renderCandidatePopover(matches);
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
        <div class="popover-item ${item.zipcode === this.selectedZipcode ? 'selected' : ''}" data-zip="${item.zipcode}">
          <span style="font-size: 13px;">${item.label}</span>
          <span class="popover-zipcode">${item.zipcode}</span>
        </div>
      `,
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
    const isDisabled = this.hasAttribute('disabled');
    this.citySelect.disabled = isDisabled;
    this.districtSelect.disabled = isDisabled;
    this.detailInput.disabled = isDisabled;
  }

  private emitChangeEvent() {
    const eventDetail = this.value;
    this.dispatchEvent(
      new CustomEvent('address-change', {
        detail: eventDetail,
        bubbles: true,
        composed: true,
      }),
    );
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// Auto register custom element
if (typeof window !== 'undefined' && !customElements.get('tw-address-picker')) {
  customElements.define('tw-address-picker', TwAddressPicker);
}
