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

    showStatus("Scanning page elements...", "normal");
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
      console.log("Script might already be injected", err);
    }

    // Send message with timeout handling
    let responseReceived = false;
    
    chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_PAGE" }, async (response) => {
      responseReceived = true;
      
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        showStatus("Connection error. Try refreshing the page.", "error");
        scanBtn.disabled = false;
        return;
      }

      if (!response || !response.success) {
        showStatus("Failed to scrape data.", "error");
        scanBtn.disabled = false;
        return;
      }

      if (response.count === 0) {
        showStatus("Found 0 messages. Please scroll down to load mentions.", "error");
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

    // Fallback if no response in 5 seconds
    setTimeout(() => {
        if (!responseReceived && scanBtn.disabled) {
            showStatus("Timeout: Page not responding. Please refresh.", "error");
            scanBtn.disabled = false;
        }
    }, 5000);
  });

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.style.color = type === 'error' ? '#d32f2f' : (type === 'success' ? '#388e3c' : '#666');
  }

  async function callGemini(apiKey, messages) {
    // Gemini 1.5 Flash is fast and cheap/free
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${apiKey}`;
    
    // Simplification for API payload size
    const simplifiedMessages = messages.map(m => `[${m.sender} in ${m.context}]: ${m.content.substring(0, 200)}`).join('\n');

    const prompt = `
      Task: Summarize these work mentions into a TODO list.
      Format: JSON Array only. No markdown.
      Schema: [{"priority": "High"|"Medium"|"Low", "sender": "string", "summary": "string", "action": "string"}]
      
      Messages:
      ${simplifiedMessages}
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
    // Simplification for API payload size
    const simplifiedMessages = messages.map(m => `[${m.sender} in ${m.context}]: ${m.content.substring(0, 200)}`).join('\n');

    const prompt = `
      Summarize these messages into a JSON array (priority, sender, summary, action).
      Messages: ${simplifiedMessages}
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
      let pClass = 'tag-low';
      if (item.priority === 'High') pClass = 'tag-high';
      else if (item.priority === 'Medium') pClass = 'tag-medium';
      
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