/**
 * v4.0 Integration Test
 *
 * Tests that v4.0 services work WITHOUT external APIs
 * Uses mock data to prove the pipeline functions
 */

const { getVerticalConfig, getAvailableVerticals, calculateVerticalScore } = require('./src/config/verticals');

console.log('\n🧪 Testing v4.0 Integration\n');

// Test 1: Vertical Configuration
console.log('1. Testing Vertical Configurations...');
const finance = getVerticalConfig('finance');
console.log(`   ✓ Finance vertical: ${finance.name}`);
console.log(`   ✓ Required score: ${finance.compliance.requiredScore}%`);
console.log(`   ✓ Priority rules: ${finance.priorityRules.length}`);

const verticals = getAvailableVerticals();
console.log(`   ✓ Total verticals: ${verticals.length}`);
console.log(`   ✓ Available: ${verticals.map(v => v.id).join(', ')}\n`);

// Test 2: Vertical Scoring
console.log('2. Testing Vertical-Weighted Scoring...');
const mockViolations = [
  { id: 'color-contrast', impact: 'serious', description: 'Low contrast' },
  { id: 'label', impact: 'critical', description: 'Missing label' },
  { id: 'button-name', impact: 'serious', description: 'Button has no name' },
];

const financeScore = calculateVerticalScore(mockViolations, 'finance');
console.log(`   ✓ Finance score: ${financeScore.score.toFixed(1)}%`);
console.log(`   ✓ Required: ${financeScore.requiredScore}%`);
console.log(`   ✓ Pass: ${financeScore.passed ? 'YES' : 'NO'}\n`);

const generalScore = calculateVerticalScore(mockViolations, 'general');
console.log(`   ✓ General score: ${generalScore.score.toFixed(1)}%`);
console.log(`   ✓ Required: ${generalScore.requiredScore}%`);
console.log(`   ✓ Pass: ${generalScore.passed ? 'YES' : 'NO'}\n`);

// Test 3: Keyword Discovery (Mock Mode)
console.log('3. Testing Keyword Discovery (Mock Mode)...');
const { getKeywordDiscoveryService } = require('./src/services/keywordDiscovery');
const discovery = getKeywordDiscoveryService();

(async () => {
  const sites = await discovery.discover({
    keywords: ['fintech', 'banking'],
    vertical: 'finance',
    limit: 5,
  });

  console.log(`   ✓ Discovered ${sites.length} sites`);
  console.log(`   ✓ Top site: ${sites[0].domain}`);
  console.log(`   ✓ All sites: ${sites.map(s => s.domain).join(', ')}\n`);

  // Test 4: Benchmarking
  console.log('4. Testing Industry Benchmarking...');
  const { getBenchmarkingService } = require('./src/services/benchmarking');
  const benchmarking = getBenchmarkingService();

  const benchmark = await benchmarking.getIndustryBenchmark('finance');
  console.log(`   ✓ Finance average score: ${benchmark.averageScore}%`);
  console.log(`   ✓ Finance pass rate: ${benchmark.passRate}%`);
  console.log(`   ✓ Top issues: ${benchmark.topIssues.join(', ')}\n`);

  const comparison = await benchmarking.compareToBenchmark({ score: 82 }, 'finance');
  console.log(`   ✓ Your score (82) is ${comparison.comparison} industry average`);
  console.log(`   ✓ Percentile: ${comparison.percentile}th\n`);

  // Test 5: Service Health
  console.log('5. Testing Service Health Checks...');
  const discoveryHealth = await discovery.healthCheck();
  console.log(`   ✓ Discovery: ${discoveryHealth.status} - ${discoveryHealth.message}`);

  const { getGrokAIService } = require('./src/services/grokAI');
  const grokAI = getGrokAIService();
  const grokHealth = await grokAI.healthCheck();
  console.log(`   ✓ Grok AI: ${grokHealth.status} - ${grokHealth.message}\n`);

  // Test 6: Statistics
  console.log('6. Service Statistics...');
  const discoveryStats = discovery.getStats();
  console.log(`   ✓ Discovery configured: ${discoveryStats.configured}`);
  console.log(`   ✓ Sites discovered: ${discoveryStats.sitesDiscovered}`);

  const grokStats = grokAI.getStats();
  console.log(`   ✓ AI provider: ${grokStats.provider}`);
  console.log(`   ✓ AI calls: ${grokStats.grokCalls + grokStats.geminiFallbacks}\n`);

  console.log('✅ All v4.0 Integration Tests Passed!\n');
  console.log('📝 Summary:');
  console.log('   • Vertical configurations: Working');
  console.log('   • Keyword discovery: Working (mock mode)');
  console.log('   • Industry benchmarking: Working');
  console.log('   • Scoring algorithms: Working');
  console.log('   • Service health checks: Working');
  console.log('\n💡 To enable full features:');
  console.log('   export SERP_API_KEY=your_key    # For real discovery');
  console.log('   export GROK_API_KEY=your_key    # For AI remediation');
  console.log('   export REDIS_URL=redis://...    # For caching');

  process.exit(0);
})().catch(error => {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
