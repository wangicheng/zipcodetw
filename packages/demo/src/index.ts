import { type AddressChangeEventDetail, TwAddressPicker, ZipCodeTw } from 'zipcodetw';

const app = document.getElementById('app');

const init = async () => {
  if (!app) return;

  const container = document.createElement('div');
  container.innerHTML = `
    <div class="header">
      <div>
        <h1>ZipCodeTw 郵遞區號查詢</h1>
        <p style="margin: 4px 0 0 0; opacity: 0.8; font-size: 0.9rem;">台灣現代化 3+3 郵遞區號極速解析引擎</p>
      </div>
      <a href="https://github.com/wangicheng/zipcodetw" target="_blank" class="github-link">GitHub 專案</a>
    </div>
    <div style="padding: 20px; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 8px; text-align: center; color: var(--text-color);">
      正在載入郵遞區號數據...
    </div>
  `;
  app.appendChild(container);

  try {
    console.time('Init ZipCodeTw Engine');
    const zipCodeTw = await ZipCodeTw.create('./data/address_prefixes.txt', './data/zipcode_rules.json');
    console.timeEnd('Init ZipCodeTw Engine');

    container.innerHTML = `
      <div class="header">
        <div>
          <h1>ZipCodeTw 郵遞區號查詢</h1>
          <p style="margin: 4px 0 0 0; opacity: 0.8; font-size: 0.9rem;">台灣現代化 3+3 郵遞區號極速解析引擎</p>
        </div>
        <a href="https://github.com/wangicheng/zipcodetw" target="_blank" class="github-link">GitHub 專案</a>
      </div>

      <!-- Mode Switcher Tabs -->
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
        <button id="tabSearch" class="tab-button active" style="flex: 1 1 auto; padding: 8px 16px; border: 1px solid var(--border-color); background: #475569; color: #ffffff; font-weight: 600; border-radius: 6px; cursor: pointer; text-align: center;">
          自由地址查詢
        </button>
        <button id="tabWidget" class="tab-button" style="flex: 1 1 auto; padding: 8px 16px; border: 1px solid var(--border-color); background: transparent; color: var(--text-color); font-weight: 600; border-radius: 6px; cursor: pointer; text-align: center;">
          Web Component 表單選取組件範例
        </button>
      </div>

      <!-- Mode 1: Default Free Text Search View -->
      <div id="viewSearch">
        <input type="text" id="addressInput" placeholder="輸入地址 (例如: 台北市大安區和平東路三段、新竹市科學園區力行路)..." style="width: 100%; padding: 14px; font-size: 16px; box-sizing: border-box; border-radius: 8px; border: 1px solid var(--input-border); background-color: var(--input-bg); color: var(--text-color);">
        <div id="results" style="margin-top: 20px;"></div>
      </div>

      <!-- Mode 2: Web Component Demo View (Hidden by default) -->
      <div id="viewWidget" style="display: none;">
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <!-- Mode 1: Search Mode -->
          <section style="padding: 20px; border: 1px solid var(--border-color); border-radius: 12px; background-color: var(--input-bg);">
            <h3 style="margin-top: 0; color: var(--text-color);">1. 單欄純字串查詢組件 (&lt;tw-address-search&gt;)</h3>
            <p style="font-size: 0.9rem; opacity: 0.85; margin-bottom: 16px;">
              即插即用純文字輸入模式，自動解析完整地址與連動候選區劃。
            </p>

            <tw-address-search id="addressSearchWidget"></tw-address-search>

            <div style="margin-top: 16px; padding: 14px; background: #18181b; color: #f4f4f5; border: 1px solid var(--border-color); border-radius: 8px; font-family: monospace; font-size: 0.85rem; overflow-x: auto;">
              <div style="color: #a1a1aa; margin-bottom: 6px; font-weight: bold;">[組件即時事件輸出 (address-change event detail)]</div>
              <pre id="searchOutput" style="margin: 0; white-space: pre-wrap; word-break: break-all;">{ "status": "empty" }</pre>
            </div>
          </section>

          <!-- Mode 2: Standard Picker Mode -->
          <section style="padding: 20px; border: 1px solid var(--border-color); border-radius: 12px; background-color: var(--input-bg);">
            <h3 style="margin-top: 0; color: var(--text-color);">2. 傳統三階選單模式 (&lt;tw-address-picker&gt;)</h3>
            <p style="font-size: 0.9rem; opacity: 0.85; margin-bottom: 16px;">
              經典縣市/鄉鎮區下拉選單搭配門牌號碼帶入，適合標準結構化表單。
            </p>

            <tw-address-picker id="addressPickerWidget"></tw-address-picker>

            <div style="margin-top: 16px; padding: 14px; background: #18181b; color: #f4f4f5; border: 1px solid var(--border-color); border-radius: 8px; font-family: monospace; font-size: 0.85rem; overflow-x: auto;">
              <div style="color: #a1a1aa; margin-bottom: 6px; font-weight: bold;">[組件即時事件輸出 (address-change event detail)]</div>
              <pre id="widgetOutput" style="margin: 0; white-space: pre-wrap; word-break: break-all;">{ "status": "empty" }</pre>
            </div>
          </section>
        </div>
      </div>
    `;

    // Tab Switching Logic
    const tabSearch = document.getElementById('tabSearch') as HTMLButtonElement;
    const tabWidget = document.getElementById('tabWidget') as HTMLButtonElement;
    const viewSearch = document.getElementById('viewSearch') as HTMLElement;
    const viewWidget = document.getElementById('viewWidget') as HTMLElement;
    const input = document.getElementById('addressInput') as HTMLInputElement;

    tabSearch.addEventListener('click', () => {
      tabSearch.style.background = '#475569';
      tabSearch.style.color = '#ffffff';
      tabSearch.style.border = '1px solid #475569';

      tabWidget.style.background = 'transparent';
      tabWidget.style.color = 'var(--text-color)';
      tabWidget.style.border = '1px solid var(--border-color)';

      viewSearch.style.display = 'block';
      viewWidget.style.display = 'none';
      input.focus();
    });

    tabWidget.addEventListener('click', () => {
      tabWidget.style.background = '#475569';
      tabWidget.style.color = '#ffffff';
      tabWidget.style.border = '1px solid #475569';

      tabSearch.style.background = 'transparent';
      tabSearch.style.color = 'var(--text-color)';
      tabSearch.style.border = '1px solid var(--border-color)';

      viewWidget.style.display = 'block';
      viewSearch.style.display = 'none';
    });

    // 1. Initialize Mode Search Widget Engine
    const searchWidget = document.getElementById('addressSearchWidget') as TwAddressPicker;
    const searchOutput = document.getElementById('searchOutput') as HTMLElement;

    if (searchWidget) {
      searchWidget.zipCodeTw = zipCodeTw;
      searchOutput.textContent = JSON.stringify(searchWidget.value, null, 2);
      searchWidget.addEventListener('address-change', (e: Event) => {
        const detail = (e as CustomEvent<AddressChangeEventDetail>).detail;
        searchOutput.textContent = JSON.stringify(detail, null, 2);
      });
    }

    // 2. Initialize Standard Picker Widget Engine
    const pickerWidget = document.getElementById('addressPickerWidget') as TwAddressPicker;
    const widgetOutput = document.getElementById('widgetOutput') as HTMLElement;

    if (pickerWidget) {
      pickerWidget.zipCodeTw = zipCodeTw;
      widgetOutput.textContent = JSON.stringify(pickerWidget.value, null, 2);
      pickerWidget.addEventListener('address-change', (e: Event) => {
        const detail = (e as CustomEvent<AddressChangeEventDetail>).detail;
        widgetOutput.textContent = JSON.stringify(detail, null, 2);
      });
    }

    // 2. Setup Free Text Search Engine Listener
    const resultsDiv = document.getElementById('results')!;

    resultsDiv.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('zipcode')) {
        const zipcode = target.textContent;
        if (zipcode) {
          navigator.clipboard.writeText(zipcode);
          const originalColor = target.style.color;
          target.style.color = '#28a745';
          setTimeout(() => {
            target.style.color = originalColor;
          }, 300);
        }
      }
    });

    input.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value.trim();
      if (!query) {
        resultsDiv.innerHTML = '';
        return;
      }

      try {
        const startTime = performance.now();
        const matches = zipCodeTw.search(query);
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(1);

        const displayMatches = matches.slice(0, 50);

        resultsDiv.innerHTML = `
          <p style="font-weight: 500;">找到 ${matches.length.toLocaleString()} 項結果 (${duration} 毫秒)</p>
          ${displayMatches
            .map(
              (m) => `
            <div class="result-item">
              <span class="zipcode" title="點擊複製">${m.zipcode}</span>
              <span class="address">${m.part1}${m.part2} ${m.bulkName ? `(${m.bulkName})` : ''}</span>
            </div>
           `,
            )
            .join('')}`;
      } catch (err: any) {
        console.error(err);
        resultsDiv.innerHTML = `<div style="color: red">查詢錯誤: ${err.message}</div>`;
      }
    });

    // Auto focus on free text search box
    input.focus();
  } catch (error) {
    container.innerHTML += `<p style="color:red">無法載入數據: ${error}</p>`;
    console.error('Initialization Failed:', error);
  }
};

init();
