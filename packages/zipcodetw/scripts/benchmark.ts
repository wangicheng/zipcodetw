import { createZipCodeTw } from '../src/node';

async function main() {
  const numTests = 10000;
  
  // Measure initial memory
  const initialMem = process.memoryUsage().heapUsed;
  
  // Initialize and measure load memory
  console.log('Loading zipcodetw...');
  const startLoad = performance.now();
  const zipCodeTw = await createZipCodeTw();
  const endLoad = performance.now();
  const finalMem = process.memoryUsage().heapUsed;
  
  const memoryUsed = (finalMem - initialMem) / 1024 / 1024;
  console.log(`Memory Used: ${memoryUsed.toFixed(2)} MB`);
  console.log(`Load time: ${(endLoad - startLoad).toFixed(2)} ms`);

  const queries = [
    '台北市大安區和平東路三段',
    '新竹市東區科學園區力行路',
    '台中市西屯區台灣大道三段99號',
    '高雄市苓雅區四維三路2號',
    '桃園市中壢區中大路300號'
  ];

  console.log(`Running ${numTests} queries...`);
  const startSearch = performance.now();
  for (let i = 0; i < numTests; i++) {
    const query = queries[i % queries.length];
    zipCodeTw.search(query);
  }
  const endSearch = performance.now();
  
  const totalTime = endSearch - startSearch;
  const avgTime = totalTime / numTests;
  console.log(`Total time: ${totalTime.toFixed(2)} ms`);
  console.log(`Average time per query: ${avgTime.toFixed(4)} ms`);
}

main().catch(console.error);
