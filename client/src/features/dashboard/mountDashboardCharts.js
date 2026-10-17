// Port of purchased Orvexa assets/js/command-center-charts.js (ApexCharts 5.3.5).
// All series, sizes, gradients, tooltips and chart IDs match the original source.
// React owns the page; ApexCharts owns only its seven empty chart containers.
export function mountDashboardCharts(ApexCharts, root) {
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const dark = document.documentElement.classList.contains('dark');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
  const muted = css('--gc-muted') || '#68716b';
  const line = dark ? 'rgba(255,255,255,.08)' : 'rgba(65,65,58,.08)';
  const isGreen = () => document.documentElement.dataset.accentTheme !== 'yellow';
  const getChartPalette = () => isGreen()
    ? {
        amber: '#238759', mint: '#54b992',
        request: ['#a1d8bc','#8dcead','#79c8a0','#68bf95','#56b487','#45a979','#329b6a','#238759'],
        quality: ['#a1d8bc','#88cea9','#72c69e','#60bc93','#50b287','#40a77a','#2e986b','#238759'],
        latency: ['#6aa6b5','#62afa7','#59b59c','#4eb98e','#42b280','#33a671','#289765','#238759'],
        spend: ['#b2d9bb','#a2d4b0','#91cfa7','#7cc99a','#67bb8b','#50ad7c','#369a6b','#238759'],
        health: ['#54b992','#238759','#6e95d1','#8c8fd3'],
        healthGradients: ['#8bdcb5','#62c998','#94b7ec','#b4b4ef']
      }
    : {
        amber: '#e7a317', mint: '#4eb487',
        request: ['#8c86d8','#d56ca6','#e66d63','#ef8b35','#efab30','#d7bf49','#8ec86c','#53b890'],
        quality: ['#8290da','#729fd8','#64acd1','#59b6c1','#54b9ad','#52b99e','#50b98f','#4eb487'],
        latency: ['#e46d62','#e98647','#eea232','#efbd43','#d6c65b','#a8c978','#78c28c','#52b58c'],
        spend: ['#9184d8','#c870b7','#de6f88','#ea7659','#ee8f38','#efa932','#e9bd46','#d5c85d'],
        health: ['#4eb487','#e7a317','#6e95d1','#8c8fd3'],
        healthGradients: ['#7cd2ad','#f5bf63','#94b7ec','#b4b4ef']
      };
  const initialPalette = getChartPalette();
  const amber = initialPalette.amber;
  const mint = initialPalette.mint;
  const charts = new Map();

  const mount = (id, options) => {
    const el = root.querySelector(`#${id}`);
    if (!el) return;
    const chart = new ApexCharts(el, {
      ...options,
      chart: { ...options.chart, id }
    });
    charts.set(id, chart);
    // Rendering is owned by this page; no legacy scripts touch React elements.
    Promise.resolve(chart.render()).catch(() => {});
  };

  const base = {
    chart: {
      fontFamily: 'Manrope, Inter, Segoe UI, sans-serif',
      toolbar: { show: false },
      animations: { enabled: !reduced, speed: 720, animateGradually: { enabled: true, delay: 45 } },
      background: 'transparent',
      foreColor: muted
    },
    dataLabels: { enabled: false },
    grid: { borderColor: line },
    tooltip: { theme: dark ? 'dark' : 'light' },
    theme: { mode: dark ? 'dark' : 'light' }
  };

  const metricBars = (id, data, colors, formatter) => mount(id, {
    ...base,
    series: [{ name: 'Trend', data }],
    chart: {
      ...base.chart,
      type: 'bar',
      height: 112,
      sparkline: { enabled: true },
      parentHeightOffset: 0,
      animations: { enabled: !reduced, speed: 760, animateGradually: { enabled: true, delay: 55 } },
      dropShadow: { enabled: true, top: 8, left: 0, blur: 9, opacity: dark ? .18 : .10 }
    },
    colors,
    plotOptions: {
      bar: {
        distributed: true,
        columnWidth: '54%',
        borderRadius: 4,
        borderRadiusApplication: 'end',
        colors: {
          backgroundBarColors: [dark ? 'rgba(255,255,255,.045)' : 'rgba(75,84,77,.045)'],
          backgroundBarOpacity: 1,
          backgroundBarRadius: 4
        }
      }
    },
    fill: {
      type: 'gradient',
      gradient: {
        type: 'vertical',
        shadeIntensity: .08,
        opacityFrom: .98,
        opacityTo: .72,
        stops: [0, 100]
      }
    },
    stroke: { show: false },
    grid: { show: false, padding: { left: 2, right: 2, top: 6, bottom: 2 } },
    xaxis: { crosshairs: { show: false }, labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { show: false },
    legend: { show: false },
    states: {
      normal: { filter: { type: 'none' } },
      hover: { filter: { type: 'lighten', value: .08 } },
      active: { filter: { type: 'none' } }
    },
    tooltip: {
      theme: dark ? 'dark' : 'light',
      x: { show: false },
      marker: { show: false },
      y: { formatter }
    }
  });

  const requestPalette = initialPalette.request;
  const qualityPalette = initialPalette.quality;
  const latencyPalette = initialPalette.latency;
  const spendPalette = initialPalette.spend;

  metricBars('cc25-spark-requests', [39,47,54,62,68,76,86,96], requestPalette, (v) => `${Math.round(8400 + v * 46).toLocaleString()} req/min`);
  metricBars('cc25-spark-quality', [68,73,78,82,86,90,94,97.2], qualityPalette, (v) => `${Number(v).toFixed(v % 1 ? 1 : 0)}% quality`);
  metricBars('cc25-spark-latency', [100,91,84,76,69,61,54,47], latencyPalette, (v) => `${Math.round(680 + v * 3.45)} ms p95`);
  metricBars('cc25-spark-spend', [34,42,51,59,68,77,88,100], spendPalette, (v) => `$${Math.round(54500 + v * 742).toLocaleString()} MTD`);

  mount('cc25-flow-chart', {
    ...base,
    series: [
      { name: 'Routed requests', type: 'area', data: [7920,9350,10140,9780,9240,10080,11260,11830,11480,12920,15140,14310,15880,13620] },
      { name: 'Successful', type: 'line', data: [7560,9020,9820,9480,8910,9730,10890,11420,11070,12480,14660,13890,15240,13140] }
    ],
    chart: { ...base.chart, type: 'line', height: 170, parentHeightOffset: 0 },
    colors: [amber, mint],
    stroke: { curve: 'smooth', width: [2.6, 2], dashArray: [0, 5] },
    markers: { size: [2.1, 0], colors: [amber, mint], strokeColors: dark ? '#172123' : '#fffdf7', strokeWidth: 1.4, hover: { size: 3.5 } },
    fill: { type: ['gradient','solid'], opacity: [1, 1], gradient: { opacityFrom: .32, opacityTo: .025, stops: [0, 92, 100] } },
    legend: { show: false },
    xaxis: {
      categories: ['00:00','','','06:00','','','12:00','','','18:00','','','','24:00'],
      axisBorder: { show: false }, axisTicks: { show: false },
      labels: { rotate: 0, hideOverlappingLabels: true, style: { fontSize: '13px', fontWeight: 600, colors: Array(14).fill(muted) } }
    },
    yaxis: {
      min: 0, max: 20000, tickAmount: 4,
      labels: { formatter: (v) => v === 0 ? '0' : `${Math.round(v / 1000)}K`, style: { fontSize: '13px', fontWeight: 600, colors: [muted] } }
    },
    grid: { borderColor: line, strokeDashArray: 0, padding: { left: 0, right: 6, top: 4, bottom: -2 } },
    tooltip: { theme: dark ? 'dark' : 'light', y: { formatter: (v) => `${v.toLocaleString()} requests` } }
  });

  mount('cc25-health-chart', {
    ...base,
    series: [96, 92, 84, 95],
    chart: { ...base.chart, type: 'radialBar', height: 176, parentHeightOffset: 0 },
    colors: initialPalette.health,
    plotOptions: {
      radialBar: {
        inverseOrder: true,
        startAngle: -150,
        endAngle: 150,
        hollow: { size: '38%', background: dark ? 'rgba(17,27,29,.78)' : 'rgba(255,255,255,.86)' },
        track: { background: dark ? 'rgba(255,255,255,.08)' : 'rgba(76,102,90,.08)', strokeWidth: '100%', margin: 8 },
        dataLabels: {
          name: { show: false },
          value: { show: false },
          total: {
            show: true,
            label: 'Excellent',
            color: muted,
            fontSize: '14px',
            fontWeight: 700,
            formatter: () => '92'
          }
        }
      }
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'light',
        type: 'horizontal',
        gradientToColors: initialPalette.healthGradients,
        stops: [0, 100]
      }
    },
    labels: ['Performance', 'Quality', 'Load', 'Security'],
    stroke: { lineCap: 'round' },
    legend: { show: false }
  });

  mount('cc25-value-trend', {
    ...base,
    series: [{ name: 'Return curve', data: [18, 24, 28, 35, 42, 48, 57, 63, 71, 76, 82, 90] }],
    chart: { ...base.chart, type: 'bar', height: 86, sparkline: { enabled: true }, parentHeightOffset: 0 },
    colors: [amber],
    plotOptions: { bar: { borderRadius: 6, columnWidth: '58%', distributed: false } },
    dataLabels: { enabled: false },
    grid: { show: false },
    fill: {
      type: 'gradient',
      gradient: { shade: 'light', type: 'vertical', opacityFrom: .98, opacityTo: .34, stops: [0, 100] }
    },
    tooltip: { theme: dark ? 'dark' : 'light', x: { show: false }, y: { formatter: (v) => `${v.toFixed(0)} index` } }
  });

  const handleThemeChange = () => {
    const nextDark = document.documentElement.classList.contains('dark');
    const nextMuted = css('--gc-muted') || (nextDark ? '#aeb8b2' : '#68716b');
    const nextLine = nextDark ? 'rgba(255,255,255,.08)' : 'rgba(65,65,58,.08)';
    const reduceAnimations = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
    const nextPalette = getChartPalette();

    charts.forEach((chart, id) => {
      const update = {
        chart: { foreColor: nextMuted, animations: { enabled: !reduceAnimations } },
        theme: { mode: nextDark ? 'dark' : 'light' },
        tooltip: { theme: nextDark ? 'dark' : 'light' },
        grid: { borderColor: nextLine }
      };

      const sparkKey = {
        'cc25-spark-requests': 'request',
        'cc25-spark-quality': 'quality',
        'cc25-spark-latency': 'latency',
        'cc25-spark-spend': 'spend'
      }[id];
      if (sparkKey) update.colors = nextPalette[sparkKey];
      if (id === 'cc25-flow-chart') {
        update.colors = [nextPalette.amber, nextPalette.mint];
        update.markers = { colors: [nextPalette.amber, nextPalette.mint], strokeColors: nextDark ? '#172123' : '#fffdf7' };
      }
      if (id === 'cc25-value-trend') update.colors = [nextPalette.amber];
      if (id.startsWith('cc25-spark-')) {
        update.plotOptions = {
          bar: {
            colors: {
              backgroundBarColors: [nextDark ? 'rgba(255,255,255,.045)' : 'rgba(75,84,77,.045)']
            }
          }
        };
      }


      if (id === 'cc25-health-chart') {
        update.colors = nextPalette.health;
        update.fill = { type: 'gradient', gradient: { shade: 'light', type: 'horizontal', gradientToColors: nextPalette.healthGradients, stops: [0, 100] } };
        update.plotOptions = {
          radialBar: {
            hollow: { background: nextDark ? 'rgba(17,27,29,.78)' : 'rgba(255,255,255,.86)' },
            track: { background: nextDark ? 'rgba(255,255,255,.08)' : 'rgba(76,102,90,.08)' }
          }
        };
      }

      Promise.resolve(chart.updateOptions(update, false, false)).catch(() => {});
    });
  };

  // Orvexa's React header changes the root .dark class. Observe that class
  // instead of subscribing to the original vanilla-JS event, which is absent.
  const themeObserver = new MutationObserver(handleThemeChange);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-motion', 'data-accent-theme'] });

  return () => {
    themeObserver.disconnect();
    for (const chart of charts.values()) {
      try { chart.destroy(); } catch { /* Cleanup should never block route exit. */ }
    }
    charts.clear();
  };
}
