import { ZipCodeTw } from 'zipcodetw';

const app = document.getElementById('app');

const init = async () => {
  if (!app) return;

  const container = document.createElement('div');
  container.innerHTML = `
    <div class="header">
      <div>
        <h1>ZipCodeTw 郵遞區號查詢</h1>
        <p style="margin: 4px 0 0 0; opacity: 0.8; font-size: 0.9rem;">台灣現代化 3+3 郵遞區號極速解析 JS SDK</p>
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
    const zipCodeTw = await ZipCodeTw.create('./data/address_prefixes.bin', './data/zipcode_rules.bin');
    console.timeEnd('Init ZipCodeTw Engine');

    container.innerHTML = `
      <div class="header">
        <div>
          <h1>ZipCodeTw 郵遞區號查詢</h1>
          <p style="margin: 4px 0 0 0; opacity: 0.8; font-size: 0.9rem;">台灣現代化 3+3 郵遞區號極速解析 JS SDK</p>
        </div>
        <a href="https://github.com/wangicheng/zipcodetw" target="_blank" class="github-link">GitHub 專案</a>
      </div>

      <!-- Mode Switcher Tabs -->
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
        <button id="tabSearch" class="tab-button active" style="flex: 1 1 auto; padding: 8px 16px; border: 1px solid #475569; background: #475569; color: #ffffff; font-weight: 600; border-radius: 6px; cursor: pointer; text-align: center;">
          1. 智慧自由地址查詢 (API Search)
        </button>
        <button id="tabSelect" class="tab-button" style="flex: 1 1 auto; padding: 8px 16px; border: 1px solid var(--border-color); background: transparent; color: var(--text-color); font-weight: 600; border-radius: 6px; cursor: pointer; text-align: center;">
          2. 原生連動下拉選單範例 (Cascading Select)
        </button>
      </div>

      <!-- Tab 1: Free Text Address Search -->
      <div id="viewSearch">
        <p style="font-size: 0.95rem; opacity: 0.85; margin-bottom: 12px;">
          傳入任意地址字串（例如：<code>台北市大安區和平東路三段1號</code>），直接透過 <code>zipCodeTw.search()</code> 獲取精準的 6 碼郵遞區號。
        </p>
        <input type="text" id="addressInput" placeholder="請輸入完整或部分地址..." style="width: 100%; padding: 14px; font-size: 16px; box-sizing: border-box; border-radius: 8px; border: 1px solid var(--input-border); background-color: var(--input-bg); color: var(--text-color);">
        <div id="results" style="margin-top: 20px;"></div>
      </div>

      <!-- Tab 2: Cascading Select Demo -->
      <div id="viewSelect" style="display: none;">
        <section style="padding: 20px; border: 1px solid var(--border-color); border-radius: 12px; background-color: var(--input-bg);">
          <h3 style="margin-top: 0; color: var(--text-color);">原生 HTML Select 連動範例</h3>
          <p style="font-size: 0.9rem; opacity: 0.85; margin-bottom: 16px;">
            展示如何利用 SDK 提供的 <code>ZipCodeTw.getCities()</code> 與 <code>ZipCodeTw.getDistricts(city)</code> 建立純前端地址連動表單。
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px;">
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: bold; margin-bottom: 4px;">縣市 (City)</label>
              <select id="demoCity" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-color);"></select>
            </div>
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: bold; margin-bottom: 4px;">鄉鎮市區 (District)</label>
              <select id="demoDistrict" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-color);"></select>
            </div>
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: bold; margin-bottom: 4px;">門牌詳細地址 (Detail)</label>
              <input id="demoDetail" type="text" placeholder="例如: 和平東路三段1號" style="width: 100%; padding: 10px; box-sizing: border-box; border-radius: 6px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-color);" />
            </div>
          </div>

          <div style="padding: 16px; background: rgba(71, 85, 105, 0.1); border: 1px dashed var(--border-color); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div>
              <div style="font-size: 0.85rem; opacity: 0.8;">解析 6 碼郵遞區號：</div>
              <div id="demoZipcodeResult" style="font-size: 1.5rem; font-weight: bold; color: #3b82f6;">-</div>
            </div>
            <div id="demoStatusInfo" style="font-size: 0.9rem; opacity: 0.85;">
              請選擇縣市鄉鎮區並輸入門牌號碼
            </div>
          </div>

          <details style="margin-top: 20px;">
            <summary style="cursor: pointer; font-weight: bold; font-size: 0.9rem;">查看程式碼實作範例 (Vanilla JS)</summary>
            <pre style="margin-top: 10px; padding: 14px; background: #18181b; color: #f4f4f5; border-radius: 8px; font-family: monospace; font-size: 0.85rem; overflow-x: auto;">
// 1. 初始化載入 SDK
const zipCodeTw = await ZipCodeTw.create('./data/address_prefixes.bin', './data/zipcode_rules.bin');

// 2. 填入縣市選項
const cities = zipCodeTw.getCities(); // ["臺北市", "新北市", ...]
citySelect.innerHTML = cities.map(c => \`&lt;option value="\${c}"&gt;\${c}&lt;/option&gt;\`).join('');

// 3. 縣市變更時，更新鄉鎮區選單
citySelect.addEventListener('change', () => {
  const districts = zipCodeTw.getDistricts(citySelect.value);
  districtSelect.innerHTML = districts.map(d => \`&lt;option value="\${d}"&gt;\${d}&lt;/option&gt;\`).join('');
});

// 4. 輸入門牌時，查詢 6 碼郵遞區號
detailInput.addEventListener('input', () => {
  const fullAddress = \`\${citySelect.value}\${districtSelect.value}\${detailInput.value}\`;
  const [match] = zipCodeTw.search(fullAddress);
  zipcodeBadge.textContent = match ? match.zipcode : '無匹配結果';
});</pre>
          </details>
        </section>
      </div>
    `;

    // Elements
    const tabSearch = document.getElementById('tabSearch') as HTMLButtonElement;
    const tabSelect = document.getElementById('tabSelect') as HTMLButtonElement;
    const viewSearch = document.getElementById('viewSearch') as HTMLElement;
    const viewSelect = document.getElementById('viewSelect') as HTMLElement;
    const input = document.getElementById('addressInput') as HTMLInputElement;

    // Tab Switching
    tabSearch.addEventListener('click', () => {
      tabSearch.style.background = '#475569';
      tabSearch.style.color = '#ffffff';
      tabSearch.style.borderColor = '#475569';

      tabSelect.style.background = 'transparent';
      tabSelect.style.color = 'var(--text-color)';
      tabSelect.style.borderColor = 'var(--border-color)';

      viewSearch.style.display = 'block';
      viewSelect.style.display = 'none';
      input.focus();
    });

    tabSelect.addEventListener('click', () => {
      tabSelect.style.background = '#475569';
      tabSelect.style.color = '#ffffff';
      tabSelect.style.borderColor = '#475569';

      tabSearch.style.background = 'transparent';
      tabSearch.style.color = 'var(--text-color)';
      tabSearch.style.borderColor = 'var(--border-color)';

      viewSelect.style.display = 'block';
      viewSearch.style.display = 'none';
    });

    // --- Tab 1 Logic: Free Text Search ---
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

    // --- Tab 2 Logic: Cascading Select ---
    const demoCity = document.getElementById('demoCity') as HTMLSelectElement;
    const demoDistrict = document.getElementById('demoDistrict') as HTMLSelectElement;
    const demoDetail = document.getElementById('demoDetail') as HTMLInputElement;
    const demoZipcodeResult = document.getElementById('demoZipcodeResult') as HTMLElement;
    const demoStatusInfo = document.getElementById('demoStatusInfo') as HTMLElement;

    const populateDistricts = () => {
      const selectedCity = demoCity.value;
      const districts = zipCodeTw.getDistricts(selectedCity);
      demoDistrict.innerHTML = districts.map((d) => `<option value="${d}">${d}</option>`).join('');
      updateSelectZipcode();
    };

    const updateSelectZipcode = () => {
      const city = demoCity.value;
      const district = demoDistrict.value;
      const detail = demoDetail.value.trim();
      const fullAddress = `${city}${district}${detail}`;

      const matches = zipCodeTw.search(fullAddress);
      if (matches.length > 0) {
        demoZipcodeResult.textContent = matches[0].zipcode;
        demoZipcodeResult.style.color = '#10b981'; // Green
        demoStatusInfo.textContent = `匹配至: ${matches[0].part1}${matches[0].part2}`;
      } else {
        demoZipcodeResult.textContent = '未匹配';
        demoZipcodeResult.style.color = '#ef4444'; // Red
        demoStatusInfo.textContent = '請檢查門牌地址格式';
      }
    };

    // Initialize City Dropdown
    const cities = zipCodeTw.getCities();
    demoCity.innerHTML = cities.map((c) => `<option value="${c}">${c}</option>`).join('');
    demoCity.value = '臺北市';
    populateDistricts();

    demoCity.addEventListener('change', populateDistricts);
    demoDistrict.addEventListener('change', updateSelectZipcode);
    demoDetail.addEventListener('input', updateSelectZipcode);

    // Initial Focus
    input.focus();
  } catch (error) {
    container.innerHTML += `<p style="color:red">無法載入數據: ${error}</p>`;
    console.error('Initialization Failed:', error);
  }
};

init();
