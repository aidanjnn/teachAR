export function mountShell(root: HTMLElement) {
  root.innerHTML = `
    <header class="masthead">
      <a class="brand" href="/" aria-label="Trail home"><span class="brand-mark" aria-hidden="true">⌁</span> Trail</a>
      <nav class="masthead-links" aria-label="Pages"><a href="/" aria-current="page">Motion workspace</a><a href="/voice-lab.html">Voice lab</a></nav>
      <span class="stage-label">Development preview</span>
    </header>
    <main>
      <div class="introduction">
        <div><h1>A movement, made visible.</h1><p>Explore a sample hand motion in workspace coordinates.</p></div>
        <span class="source-label">Synthetic fixture</span>
      </div>
      <div class="workspace-layout">
        <section class="player" aria-label="Motion replay">
          <div class="scene-wrap"><div id="scene"></div><span class="scene-caption">50 × 35 cm workspace</span><span class="scene-axis">+Y up &nbsp; / &nbsp; +Z toward learner</span></div>
          <div class="transport">
            <div class="transport-actions"><button id="play" class="primary" type="button">Play motion</button><button id="reset" type="button">Reset</button><output id="time" for="timeline">0.00 / 2.00 s</output></div>
            <label class="sr-only" for="timeline">Recording time</label>
            <input id="timeline" type="range" min="0" max="2000" value="0" step="1" />
            <div class="timeline-notes"><span>Start</span><span>Tracking gap at 0.90–1.17 s</span><span>End</span></div>
          </div>
        </section>
        <aside>
          <h2>Reach across the mat</h2>
          <p>A two-second diagnostic recording with all 25 named joints of the right hand.</p>
          <dl class="details"><div><dt>Right hand</dt><dd id="tracking" role="status">Tracked</dd></div><div><dt>Left hand</dt><dd>Not recorded</dd></div><div><dt>Source</dt><dd>Generated sample</dd></div><div><dt>Capture rate</dt><dd>30 Hz</dd></div></dl>
          <div class="fixture-note"><h3>Watch the tracking gap</h3><p>The hand disappears when a sample is missing. Scrub through the gap to inspect it.</p><button id="gap" type="button">Show tracking gap</button></div>
          <p class="scope-note">This preview shows recorded motion. It does not track your hands or verify a physical task.</p>
        </aside>
      </div>
      <section class="diagnostics" aria-label="Runtime diagnostics"><div><span>Local server</span><strong id="health" role="status">Checking…</strong></div><div><span>Immersive AR</span><strong id="xr">Checking…</strong></div><div><span>Integrations</span><strong id="providers">Checking…</strong></div><button id="refresh-health" type="button">Recheck server</button></section>
      <footer>Record once. Learn at your own pace.<span>Scaffold preview · Headset validation pending</span></footer>
    </main>`;
}
