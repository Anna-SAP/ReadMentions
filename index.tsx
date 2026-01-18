import React from 'react';
import { createRoot } from 'react-dom/client';

const App = () => {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '40px', maxWidth: '800px', margin: '0 auto', lineHeight: '1.6' }}>
      <h1 style={{ color: '#066fac', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
        Plugin Files Generated Successfully!
      </h1>
      
      <div style={{ backgroundColor: '#e3f2fd', padding: '20px', borderRadius: '8px', border: '1px solid #bbdefb', marginBottom: '30px' }}>
        <h3 style={{ marginTop: 0, color: '#0d47a1' }}>✅ The "Manifest Missing" error is fixed.</h3>
        <p>
          I have generated the <code>manifest.json</code>, <code>popup.html</code>, and <code>content.js</code> files required for the Chrome Extension.
          These files are now sitting in your project folder alongside this index file.
        </p>
      </div>

      <h2>How to Install in Chrome</h2>
      <ol style={{ fontSize: '18px' }}>
        <li>Open Chrome and navigate to <code>chrome://extensions</code></li>
        <li>Toggle <strong>Developer mode</strong> in the top right corner.</li>
        <li>Click the <strong>Load unpacked</strong> button (top left).</li>
        <li>Select <strong>this entire project folder</strong> (the one containing manifest.json).</li>
        <li>The "RingCentral Smart Mentions" extension card should appear.</li>
      </ol>

      <hr style={{ margin: '40px 0', border: 'none', borderTop: '1px solid #eee' }} />

      <h3>What's Next?</h3>
      <ul>
        <li>Go to <strong>app.ringcentral.com</strong> and log in.</li>
        <li>Click the extension icon in your browser toolbar.</li>
        <li>Enter your <strong>Gemini API Key</strong> (recommended) or OpenAI Key.</li>
        <li>Click <strong>Analyze Mentions</strong> to summarize your messages.</li>
      </ul>
      
      <p style={{ color: '#666', fontSize: '14px', marginTop: '40px' }}>
        <em>Note: This page (index.html) is just a placeholder to provide these instructions. The actual extension interface is in popup.html.</em>
      </p>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);