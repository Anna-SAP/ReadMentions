document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const scanBtn = document.getElementById('scanBtn');
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');
  const providerRadios = document.getElementsByName('provider');

  // Load saved settings
  chrome.storage.local.get(['rc_api_key', 'rc_provider'], (result) => {
    if (result.rc_api_key) apiKeyInput.value = result.rc_api_key;
    if (result.rc_provider) {
      for (const radio of providerRadios) {
        if (radio.value === result.rc_provider) radio.checked = true;
      }
    }
  });

  // Save settings on change
  const saveSettings = () => {
    const provider = Array.from(providerRadios).find(r => r.checked).value;
    chrome.storage.local.set({ 
      rc_api_key: apiKeyInput.value,
      rc_provider: provider
    });
  };
  apiKeyInput.addEventListener('change', saveSettings);
  providerRadios.forEach(r => r.addEventListener('change', saveSettings));

  scanBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus("Please enter an API Key first", "error");
      return;
    }

    const provider = Array.from(providerRadios).find(r => r.checked).value;

    showStatus("Connecting to page...", "normal");
    scanBtn.disabled = true;
    resultsDiv.innerHTML = '';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes("ringcentral.com")) {
      showStatus("Please use on app.ringcentral.com", "error");
      scanBtn.disabled = false;
      return;
    }

    // Inject content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (err) {
      // Ignore if already injected
    }

    chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_PAGE" }, async (response) => {
      if (chrome.runtime.lastError || !response) {
        showStatus("Connection failed. Please refresh the RingCentral page.", "error");
        scanBtn.disabled = false;
        return;
      }

      if (response.count === 0) {
        showStatus("No mentions found. Scroll down to load messages.", "error");
        scanBtn.disabled = false;
        return;
      }

      showStatus(`Analyzing ${response.count} messages with ${provider === 'gemini' ? 'Gemini' : 'OpenAI'}...`, "normal");
      
      try {
        let summary;
        if (provider === 'gemini') {
          summary = await callGemini(apiKey, response.data);
        } else {
          summary = await callOpenAI(apiKey, response.data);
        }
        renderResults(summary);
        showStatus("Analysis Complete ✅", "success");
      } catch (error) {
        console.error(error);
        showStatus("AI Error: " + error.message, "error");
      }
      scanBtn.disabled = false;
    });
  });

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.style.color = type === 'error' ? '#d32f2f' : (type === 'success' ? '#388e3c' : '#666');
  }

  async function callGemini(apiKey, messages) {
    // Gemini 1.5 Flash is fast and cheap/free
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${apiKey}`;
    
    const prompt = `
      You are a helpful assistant. Analyze these RingCentral messages and return a JSON array summarizing actionable items.
      Format: JSON Array of objects with keys: "priority" (High/Medium/Low), "sender", "summary" (concise), "action" (suggested next step).
      
      Messages:
      ${JSON.stringify(messages).substring(0, 30000)}
    `;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  }

  async function callOpenAI(apiKey, messages) {
    const prompt = `
      Analyze these messages and return a JSON array.
      Keys: priority (High/Medium/Low), sender, summary, action.
      Messages: ${JSON.stringify(messages).substring(0, 15000)}
    `;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return JSON.parse(data.choices[0].message.content);
  }

  function renderResults(list) {
    if (!Array.isArray(list)) return;
    
    const priorityMap = { "High": 3, "Medium": 2, "Low": 1 };
    list.sort((a, b) => priorityMap[b.priority] - priorityMap[a.priority]);

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';
      const pClass = item.priority === 'High' ? 'tag-high' : (item.priority === 'Medium' ? 'tag-medium' : 'tag-low');
      
      card.innerHTML = `
        <div class="card-header">
          <span class="sender-name">${item.sender}</span>
          <span class="tag ${pClass}">${item.priority}</span>
        </div>
        <div class="card-body">${item.summary}</div>
        <div class="card-action">👉 ${item.action}</div>
      `;
      resultsDiv.appendChild(card);
    });
  }
});