import { ZipCodeTw } from 'zipcodetw';

const app = document.getElementById('app');

const init = async () => {
  if (!app) return;

  const container = document.createElement('div');
  container.innerHTML = `
        <div class="header">
            <h1>ZipCodeTw Demo</h1>
            <a href="https://github.com/wangicheng/zipcodetw" target="_blank" class="github-link">GitHub</a>
        </div>
        <p>正在載入資料...</p>
    `;
  app.appendChild(container);

  try {
    // Initialize ZIP code service
    console.time('Init ZipCodeTw');
    const zipCodeTw = await ZipCodeTw.create('./data/address_prefixes.txt.gz', './data/zipcode_rules.json.gz');
    console.timeEnd('Init ZipCodeTw');

    container.innerHTML = `
            <div class="header">
                <h1>ZipCodeTw Demo</h1>
                <a href="https://github.com/wangicheng/zipcodetw" target="_blank" class="github-link">GitHub</a>
            </div>
            <p>資料載入完成！請輸入地址查詢。</p>
            <input type="text" id="addressInput" placeholder="輸入地址 ex: 台北市大安區..." style="width: 100%; padding: 12px; font-size: 16px; box-sizing: border-box;">
            <div id="results" style="margin-top: 20px;"></div>
      `;

    const input = document.getElementById('addressInput') as HTMLInputElement;
    const resultsDiv = document.getElementById('results')!;

    resultsDiv.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('zipcode')) {
        const zipcode = target.textContent;
        if (zipcode) {
          navigator.clipboard.writeText(zipcode);
          const originalColor = target.style.color;
          target.style.color = '#28a745'; // success green
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

        // Limit results to top 50 for performance in UI
        const displayMatches = matches.slice(0, 50);

        resultsDiv.innerHTML = `
                <p>${matches.length.toLocaleString()} 項結果 (${duration} 毫秒)</p>
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

    // Auto focus
    input.focus();
  } catch (error) {
    container.innerHTML += `<p style="color:red">無法載入資料: ${error}</p>`;
    console.error('Initialization Failed:', error);
  }
};

init();
