import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { orvexaAsset } from '@/config/orvexaAssets.js'
import DashboardCharts from '@/features/dashboard/DashboardCharts.jsx'
import LiveRequests from '@/features/dashboard/LiveRequests.jsx'

// Original Orvexa src/index.html > main#main-content > section.cc25-dashboard.
// The purchased HTML/CSS, demo figures, node map and SVG/SMIL animations are preserved.
// Links use React Router; charts and pagination are managed by their React components.
export default function DashboardPage() {
  return (
    <>
    <section className="cc25-dashboard reveal is-visible" data-delay="40" aria-label="AI Production Command Center dashboard">
      <div className="cc25-operations">
        <div className="cc25-side-stack left">
          <article className="cc25-card cc25-panel cc25-flow-panel">
            <div className="cc25-section-head">
              <span>
                <span className="cc25-icon">
                  <OrvexaIcon name="chart-no-axes-combined" />
                </span>
                <span>
                  <h3>AI Flow</h3>
                </span>
              </span>
              <span className="cc25-range cc25-flow-range">Last 24 hours</span>
            </div>
            <div className="cc25-flow-total">
              <div className="cc25-flow-total-inline">
                <span className="cc25-flow-summary">
                  <span>Total Requests</span>
                  <em>▲ 9.8% vs yesterday</em>
                </span>
                <strong>1,320,480</strong>
              </div>
            </div>
            <div id="cc25-flow-chart" aria-label="AI request flow over the last 24 hours" />
            <div className="cc25-flow-foot">
              <span>
                <small>Successful</small>
                <b>1,283,507</b>
                <em>97.2%</em>
              </span>
              <span>
                <small>Failed</small>
                <b>36,973</b>
                <em className="danger">2.8%</em>
              </span>
              <span>
                <small>Avg. Latency</small>
                <b>468 ms</b>
                <em>▼ 6.4%</em>
              </span>
            </div>
          </article>
          <article className="cc25-card cc25-panel cc25-runtime-panel">
            <div className="cc25-section-head">
              <span>
                <span className="cc25-icon mint">
                  <OrvexaIcon name="cpu" />
                </span>
                <span>
                  <h3>Runtime</h3>
                  <p>Live system overview</p>
                </span>
              </span>
              <span className="cc25-live">Live</span>
            </div>
            <div className="cc25-runtime-list">
              <div className="cc25-runtime-row">
                <i>
                  <OrvexaIcon name="inbox" />
                </i>
                <span>Concurrent Requests</span>
                <b>343</b>
                <em>+8.1%</em>
              </div>
              <div className="cc25-runtime-row">
                <i>
                  <OrvexaIcon name="binary" />
                </i>
                <span>Tokens / min</span>
                <b>1.82M</b>
                <em>+11.4%</em>
              </div>
              <div className="cc25-runtime-row">
                <i>
                  <OrvexaIcon name="circle-check-big" />
                </i>
                <span>Success Rate</span>
                <b>97.2%</b>
                <em>+0.4%</em>
              </div>
              <div className="cc25-runtime-row">
                <i>
                  <OrvexaIcon name="timer" />
                </i>
                <span>Avg. Response Time</span>
                <b>468 ms</b>
                <em>-6.4%</em>
              </div>
            </div>
          </article>
        </div>
        <section className="cc25-core-stage" aria-label="Orvexa live production fabric">
          <div className="cc25-core-haze" aria-hidden="true" />
          <svg className="cc25-flow-map" viewBox="0 0 720 630" aria-hidden="true" focusable="false">
            <defs>
              <filter id="cc25Glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="cc25FlowGold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#efc560" stopOpacity=".10" />
                <stop offset=".50" stopColor="#dfa01a" stopOpacity=".95" />
                <stop offset="1" stopColor="#f8df9b" stopOpacity=".14" />
              </linearGradient>
              <linearGradient id="cc25FlowMint" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#4eae83" stopOpacity=".12" />
                <stop offset=".52" stopColor="#62c59a" stopOpacity=".92" />
                <stop offset="1" stopColor="#dff6eb" stopOpacity=".12" />
              </linearGradient>
            </defs>
            <circle className="cc25-orbit-ring ring-a" cx="360" cy="330" r="166" />
            <circle className="cc25-orbit-ring ring-b" cx="360" cy="330" r="204" />
            <circle className="cc25-orbit-ring ring-c" cx="360" cy="330" r="236" />
            <path id="cc25-path-apps" className="cc25-flow-path" d="M360 294 C360 226 360 140 360 58" />
            <path id="cc25-path-routing" className="cc25-flow-path" d="M318 310 C270 282 222 246 164 214" />
            <path id="cc25-path-knowledge" className="cc25-flow-path" d="M402 310 C450 282 498 246 556 214" />
            <path id="cc25-path-realtime" className="cc25-flow-path mint" d="M316 365 C268 392 220 420 160 438" />
            <path id="cc25-path-tools" className="cc25-flow-path" d="M404 365 C452 392 500 420 560 438" />
            <path id="cc25-path-review" className="cc25-flow-path mint" d="M360 398 C360 450 360 520 360 582" />
            <g className="cc25-flow-particles" filter="url(#cc25Glow)">
              <circle r="3.8" fill="#e4a51d">
                <animateMotion dur="3.6s" repeatCount="indefinite">
                  <mpath href="#cc25-path-apps" />
                </animateMotion>
              </circle>
              <circle r="2.8" fill="#fff2bd">
                <animateMotion dur="4.9s" begin="-1.3s" repeatCount="indefinite">
                  <mpath href="#cc25-path-apps" />
                </animateMotion>
              </circle>
              <circle r="3.4" fill="#efc560">
                <animateMotion dur="4.8s" begin="-.8s" repeatCount="indefinite">
                  <mpath href="#cc25-path-routing" />
                </animateMotion>
              </circle>
              <circle r="2.9" fill="#fff2bd">
                <animateMotion dur="5.2s" begin="-2.2s" repeatCount="indefinite">
                  <mpath href="#cc25-path-routing" />
                </animateMotion>
              </circle>
              <circle r="3.4" fill="#efc560">
                <animateMotion dur="4.4s" begin="-1.7s" repeatCount="indefinite">
                  <mpath href="#cc25-path-knowledge" />
                </animateMotion>
              </circle>
              <circle r="2.9" fill="#fff2bd">
                <animateMotion dur="5.4s" begin="-2.7s" repeatCount="indefinite">
                  <mpath href="#cc25-path-knowledge" />
                </animateMotion>
              </circle>
              <circle r="3.6" fill="#56b78b">
                <animateMotion dur="4.1s" begin="-.9s" repeatCount="indefinite">
                  <mpath href="#cc25-path-realtime" />
                </animateMotion>
              </circle>
              <circle r="2.8" fill="#dff6eb">
                <animateMotion dur="5.6s" begin="-2.1s" repeatCount="indefinite">
                  <mpath href="#cc25-path-realtime" />
                </animateMotion>
              </circle>
              <circle r="3.4" fill="#e4a51d">
                <animateMotion dur="4.6s" begin="-2.1s" repeatCount="indefinite">
                  <mpath href="#cc25-path-tools" />
                </animateMotion>
              </circle>
              <circle r="2.8" fill="#fff2bd">
                <animateMotion dur="5.3s" begin="-3.1s" repeatCount="indefinite">
                  <mpath href="#cc25-path-tools" />
                </animateMotion>
              </circle>
              <circle r="3.6" fill="#56b78b">
                <animateMotion dur="3.9s" begin="-1.2s" repeatCount="indefinite">
                  <mpath href="#cc25-path-review" />
                </animateMotion>
              </circle>
              <circle r="2.9" fill="#dff6eb">
                <animateMotion dur="5.1s" begin="-2.9s" repeatCount="indefinite">
                  <mpath href="#cc25-path-review" />
                </animateMotion>
              </circle>
            </g>
          </svg>
          <div className="cc25-core-particles" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <Link className="cc25-node apps" to="/demo/applications">
            <i>
              <OrvexaIcon name="layout-grid" />
            </i>
            <span>
              <b>Applications</b>
              <small>18 Active</small>
            </span>
            <span className="cc25-node-pulse mint" />
          </Link>
          <Link className="cc25-node routing" to="/demo/models-routing">
            <i>
              <OrvexaIcon name="route" />
            </i>
            <span>
              <b>Routing</b>
              <small>Model Router</small>
            </span>
            <span className="cc25-node-pulse" />
          </Link>
          <Link className="cc25-node knowledge" to="/demo/knowledge-rag">
            <i>
              <OrvexaIcon name="database-zap" />
            </i>
            <span>
              <b>Knowledge</b>
              <small>362 Sources</small>
            </span>
            <span className="cc25-node-pulse" />
          </Link>
          <Link className="cc25-node realtime" to="/demo/contact-center">
            <i>
              <OrvexaIcon name="audio-waveform" />
            </i>
            <span>
              <b>Realtime AI</b>
              <small>Live</small>
            </span>
            <span className="cc25-node-pulse mint" />
          </Link>
          <Link className="cc25-node tools" to="/demo/tools-mcp">
            <i>
              <OrvexaIcon name="wrench" />
            </i>
            <span>
              <b>Tools</b>
              <small>47 Integrated</small>
            </span>
            <span className="cc25-node-pulse" />
          </Link>
          <Link className="cc25-node review" to="/demo/human-review">
            <i>
              <OrvexaIcon name="user-check" />
            </i>
            <span>
              <b>Human Review</b>
              <small>14 Pending</small>
            </span>
            <span className="cc25-node-pulse mint" />
          </Link>
          <div className="cc25-robot">
            <span className="cc25-robot-aura" />
            <span className="cc25-pedestal-rings" aria-hidden="true" />
            <img alt="Orvexa production operator" src={orvexaAsset("images/orvexa-command-robot-v1.png")} width="1024" height="1024" fetchPriority="high" decoding="async" />
            <span className="cc25-core-beacon" />
          </div>
        </section>
        <div className="cc25-side-stack right">
          <article className="cc25-card cc25-panel cc25-applications-panel">
            <div className="cc25-section-head">
              <span>
                <span className="cc25-icon">
                  <OrvexaIcon name="blocks" />
                </span>
                <span>
                  <h3>Applications</h3>
                </span>
              </span>
              <span className="cc25-live">Live</span>
              <Link className="cc25-link" to="/demo/applications">View all</Link>
            </div>
            <div className="cc25-app-columns">
              <span>Application</span>
              <span>Requests/min</span>
              <span>P95 Latency</span>
              <span>Quality</span>
            </div>
            <div className="cc25-app-list">
              <div className="cc25-app-row">
                <i>
                  <OrvexaIcon name="headphones" />
                </i>
                <span>
                  <b>Support AI</b>
                  <small>v7.8 · Production</small>
                </span>
                <em>
                  <b>1,164</b>
                  <small>▲ 8%</small>
                </em>
                <strong>684ms</strong>
                <strong className="good">97.1%</strong>
              </div>
              <div className="cc25-app-row">
                <i>
                  <OrvexaIcon name="phone-call" />
                </i>
                <span>
                  <b>AI Contact Center</b>
                  <small>v5.4 · Production</small>
                </span>
                <em>
                  <b>942</b>
                  <small>▲ 6%</small>
                </em>
                <strong>742ms</strong>
                <strong className="good">96.7%</strong>
              </div>
              <div className="cc25-app-row">
                <i>
                  <OrvexaIcon name="file-search" />
                </i>
                <span>
                  <b>Document Intelligence</b>
                  <small>v3.2 · Production</small>
                </span>
                <em>
                  <b>418</b>
                  <small>▲ 4%</small>
                </em>
                <strong>1,180ms</strong>
                <strong className="good">97.8%</strong>
              </div>
            </div>
            <Link className="cc25-add-app" to="/demo/applications">
              <OrvexaIcon name="plus" />
 Add Application            </Link>
          </article>
          <article className="cc25-card cc25-panel cc25-issues-panel">
            <div className="cc25-section-head">
              <span>
                <span className="cc25-icon">
                  <OrvexaIcon name="sparkles" />
                </span>
                <span>
                  <h3>AI Issues &amp; Insights</h3>
                </span>
              </span>
              <Link className="cc25-link" to="/demo/ai-issues">View all</Link>
            </div>
            <div className="cc25-issue-list">
              <div className="cc25-issue">
                <i>
                  <OrvexaIcon name="triangle-alert" />
                </i>
                <span>
                  <b>Provider latency elevated</b>
                  <small>INC-2047 · Orbit AI route · P95 1.42s</small>
                </span>
                <em className="high">High</em>
                <time>2m ago</time>
              </div>
              <div className="cc25-issue">
                <i>
                  <OrvexaIcon name="database-zap" />
                </i>
                <span>
                  <b>Knowledge sources stale</b>
                  <small>12 sources haven't synced in 48+ hours</small>
                </span>
                <em>Medium</em>
                <time>18m ago</time>
              </div>
              <div className="cc25-issue">
                <i>
                  <OrvexaIcon name="badge-alert" />
                </i>
                <span>
                  <b>Safety review queued</b>
                  <small>3 escalations are waiting for human approval</small>
                </span>
                <em>Medium</em>
                <time>32m ago</time>
              </div>
              <div className="cc25-issue">
                <i>
                  <OrvexaIcon name="circle-dollar-sign" />
                </i>
                <span>
                  <b>Cost anomaly detected</b>
                  <small>ISS-0827-03 · spend 18% above daily forecast</small>
                </span>
                <em className="low">Low</em>
                <time>1h ago</time>
              </div>
            </div>
          </article>
        </div>
      </div>
      <div className="cc25-kpi-grid" aria-label="Production KPI summary">
        <article className="cc25-card cc25-kpi">
          <div className="cc25-kpi-head">
            <span className="cc25-icon">
              <OrvexaIcon name="activity" />
            </span>
            <span>Requests / min</span>
          </div>
          <strong>
2,842             <small>/min</small>
          </strong>
          <div className="cc25-delta">
            <b>▲ 9.8%</b>
 vs yesterday          </div>
          <div className="cc25-spark" id="cc25-spark-requests" aria-label="Request rate trend" />
        </article>
        <article className="cc25-card cc25-kpi">
          <div className="cc25-kpi-head">
            <span className="cc25-icon mint">
              <OrvexaIcon name="shield-check" />
            </span>
            <span>Quality Score</span>
          </div>
          <strong>97.1%</strong>
          <div className="cc25-delta">
            <b>▲ 0.6%</b>
 vs yesterday          </div>
          <div className="cc25-spark" id="cc25-spark-quality" aria-label="Production quality trend" />
        </article>
        <article className="cc25-card cc25-kpi">
          <div className="cc25-kpi-head">
            <span className="cc25-icon">
              <OrvexaIcon name="timer" />
            </span>
            <span>Latency (p95)</span>
          </div>
          <strong>
742             <small>ms</small>
          </strong>
          <div className="cc25-delta">
            <b>▼ 6.4%</b>
 vs yesterday          </div>
          <div className="cc25-spark" id="cc25-spark-latency" aria-label="P95 latency trend" />
        </article>
        <article className="cc25-card cc25-kpi">
          <div className="cc25-kpi-head">
            <span className="cc25-icon">
              <OrvexaIcon name="circle-dollar-sign" />
            </span>
            <span>Spend (MTD)</span>
          </div>
          <strong>$10,640</strong>
          <div className="cc25-delta">
            <b>▲ 3.8%</b>
 vs last month          </div>
          <div className="cc25-spark" id="cc25-spark-spend" aria-label="Month-to-date AI spend trend" />
        </article>
      </div>
      <div className="cc25-insight-grid">
        <article className="cc25-card cc25-insight-card cc25-capability-card">
          <div className="cc25-section-head">
            <span>
              <span className="cc25-icon">
                <OrvexaIcon name="sliders-horizontal" />
              </span>
              <span>
                <h3>Capability Usage</h3>
              </span>
            </span>
            <span className="cc25-range">This Month</span>
          </div>
          <div className="cc25-capability-list">
            <div>
              <span>Natural Language</span>
              <i>
                <b style={{ "--p": "82%" }} />
              </i>
              <em>82%</em>
            </div>
            <div>
              <span>Reasoning</span>
              <i>
                <b style={{ "--p": "68%" }} />
              </i>
              <em>68%</em>
            </div>
            <div>
              <span>Data Analysis</span>
              <i>
                <b style={{ "--p": "61%" }} />
              </i>
              <em>61%</em>
            </div>
            <div>
              <span>Code Generation</span>
              <i>
                <b style={{ "--p": "41%" }} />
              </i>
              <em>41%</em>
            </div>
            <div>
              <span>Vision</span>
              <i>
                <b style={{ "--p": "35%" }} />
              </i>
              <em>35%</em>
            </div>
          </div>
          <Link className="cc25-card-link" to="/demo/usage-analytics">
View full report             <OrvexaIcon name="arrow-right" />
          </Link>
        </article>
        <article className="cc25-card cc25-insight-card">
          <div className="cc25-section-head">
            <span>
              <span className="cc25-icon mint">
                <OrvexaIcon name="shield-check" />
              </span>
              <span>
                <h3>System Health</h3>
              </span>
            </span>
          </div>
          <div className="cc25-health-body">
            <div className="cc25-health-chart" id="cc25-health-chart" />
            <div className="cc25-health-facts">
              <div>
                <span>Model Performance</span>
                <b className="good">Excellent</b>
              </div>
              <div>
                <span>Data Quality</span>
                <b>Good</b>
              </div>
              <div>
                <span>System Load</span>
                <b>Normal</b>
              </div>
              <div>
                <span>Security</span>
                <b className="good">Excellent</b>
              </div>
            </div>
          </div>
          <Link className="cc25-card-link" to="/demo/performance-slo">
View health details             <OrvexaIcon name="arrow-right" />
          </Link>
        </article>
        <article className="cc25-card cc25-insight-card cc25-value-card">
          <div className="cc25-section-head">
            <span>
              <span className="cc25-icon">
                <OrvexaIcon name="circle-dollar-sign" />
              </span>
              <span>
                <h3>Cost &amp; Value</h3>
              </span>
            </span>
            <span className="cc25-range">This Month</span>
          </div>
          <div className="cc25-value-main">
            <span>
              <strong>$10,640</strong>
              <span>Total Spend</span>
            </span>
            <em>
▲ 3.8%              <small>vs last month</small>
            </em>
          </div>
          <div className="cc25-value-grid">
            <div>
              <small>Verified Savings</small>
              <b>$1,520</b>
            </div>
            <div>
              <small>Budget Remaining</small>
              <b>$1,360</b>
            </div>
          </div>
          <div className="cc25-value-trend" id="cc25-value-trend" aria-label="Month-to-date AI value trend" />
          <Link className="cc25-card-link" to="/demo/cost-budgets">
View full breakdown             <OrvexaIcon name="arrow-right" />
          </Link>
        </article>
      </div>
      <LiveRequests />
    </section>
      <DashboardCharts />
    </>
  )
}
