import { test, expect } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:3100';
const DASHBOARD_BASE = 'http://127.0.0.1:3001';

test('check chart colors and CSS variables', async ({ page, request }) => {
  const sessionsRes = await request.get(`${API_BASE}/api/sessions`);
  const sessions = await sessionsRes.json();
  const sessionId = sessions.sessions[0].id;

  await page.goto(`${DASHBOARD_BASE}/session/${sessionId}`, { timeout: 60000 });
  await page.waitForSelector('[role="tab"]', { timeout: 30000 });

  // Click Charts tab
  const chartsTab = page.locator('[role="tab"]').filter({ hasText: /charts/i });
  await chartsTab.first().click();
  await page.waitForTimeout(3000);

  // Check CSS variable values
  const cssVars = await page.evaluate(() => {
    const root = document.documentElement;
    const styles = getComputedStyle(root);

    return {
      chart1: styles.getPropertyValue('--chart-1').trim(),
      chart2: styles.getPropertyValue('--chart-2').trim(),
      chart3: styles.getPropertyValue('--chart-3').trim(),
      chart4: styles.getPropertyValue('--chart-4').trim(),
      primary: styles.getPropertyValue('--primary').trim(),
    };
  });

  console.log('\n=== CSS Variables ===');
  console.log('--chart-1:', cssVars.chart1);
  console.log('--chart-2:', cssVars.chart2);
  console.log('--chart-3:', cssVars.chart3);
  console.log('--chart-4:', cssVars.chart4);
  console.log('--primary:', cssVars.primary);

  // Check what stroke values are actually applied to line paths
  const lineInfo = await page.evaluate(() => {
    const wrappers = document.querySelectorAll('.recharts-wrapper');
    const results: any[] = [];

    wrappers.forEach((wrapper, idx) => {
      const parent = wrapper.closest('[class*="Card"]');
      const title = parent?.querySelector('[class*="CardTitle"]')?.textContent || `Chart ${idx}`;

      // Check line elements
      const lineGroups = wrapper.querySelectorAll('.recharts-line');
      const lineDetails: any[] = [];

      lineGroups.forEach((lineGroup, lineIdx) => {
        const path = lineGroup.querySelector('path.recharts-line-curve');
        if (path) {
          const computedStroke = window.getComputedStyle(path).stroke;
          const inlineStroke = path.getAttribute('stroke');
          const d = path.getAttribute('d');

          lineDetails.push({
            index: lineIdx,
            computedStroke,
            inlineStroke,
            dLength: d?.length || 0,
            dContent: d ? d.substring(0, 100) : null,
          });
        }
      });

      results.push({
        title,
        lineDetails,
      });
    });

    return results;
  });

  console.log('\n=== Line Stroke Analysis ===');
  lineInfo.forEach(chart => {
    console.log(`\n${chart.title}:`);
    if (chart.lineDetails.length === 0) {
      console.log('  No line elements found');
    } else {
      chart.lineDetails.forEach((line: any) => {
        console.log(`  Line ${line.index}:`);
        console.log(`    Inline stroke: ${line.inlineStroke}`);
        console.log(`    Computed stroke: ${line.computedStroke}`);
        console.log(`    Path d length: ${line.dLength}`);
        if (line.dContent) {
          console.log(`    Path d preview: ${line.dContent}...`);
        }
      });
    }
  });

  // Check if there are any SVG paths at all
  const svgAnalysis = await page.evaluate(() => {
    const allPaths = document.querySelectorAll('.recharts-wrapper path');
    const pathInfo: any[] = [];

    allPaths.forEach((path, idx) => {
      const d = path.getAttribute('d');
      const stroke = path.getAttribute('stroke');
      const fill = path.getAttribute('fill');
      const className = path.getAttribute('class');

      if (d && d.length > 0) {
        pathInfo.push({
          index: idx,
          className,
          stroke,
          fill,
          dLength: d.length,
        });
      }
    });

    return pathInfo;
  });

  console.log('\n=== All SVG Paths with d attribute ===');
  console.log(`Total paths: ${svgAnalysis.length}`);
  svgAnalysis.slice(0, 10).forEach(p => {
    console.log(`  Path ${p.index}: class="${p.className}", stroke="${p.stroke}", fill="${p.fill}", d length=${p.dLength}`);
  });

  // Check the LineChart data prop by looking at what Recharts rendered
  const rechartsData = await page.evaluate(() => {
    // Try to access Recharts internal data
    const wrappers = document.querySelectorAll('.recharts-wrapper');
    const results: any[] = [];

    wrappers.forEach((wrapper, idx) => {
      const svg = wrapper.querySelector('svg');
      if (!svg) return;

      // Check for any elements with data attributes
      const dataElements = wrapper.querySelectorAll('[data-*]');

      results.push({
        index: idx,
        svgWidth: svg.getAttribute('width'),
        svgHeight: svg.getAttribute('height'),
        viewBox: svg.getAttribute('viewBox'),
        childCount: svg.childElementCount,
        hasYAxis: !!wrapper.querySelector('.recharts-yAxis'),
        yAxisTicks: Array.from(wrapper.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value')).map(t => t.textContent),
      });
    });

    return results;
  });

  console.log('\n=== Recharts Render State ===');
  rechartsData.forEach(chart => {
    console.log(`Chart ${chart.index}:`);
    console.log(`  SVG: ${chart.svgWidth}x${chart.svgHeight}, viewBox: ${chart.viewBox}`);
    console.log(`  Has Y-Axis: ${chart.hasYAxis}`);
    console.log(`  Y-Axis ticks: ${chart.yAxisTicks.join(', ') || 'NONE'}`);
  });
});
