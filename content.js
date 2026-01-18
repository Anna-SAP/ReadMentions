// content.js
// 监听来自 Popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SCRAPE_PAGE") {
    const data = scrapeMentions();
    
    // 简单的去重处理 (基于内容和发送者)
    const uniqueData = data.filter((v, i, a) => a.findIndex(t => (t.content === v.content && t.sender === v.sender)) === i);
    
    sendResponse({ 
      success: true, 
      count: uniqueData.length, 
      data: uniqueData 
    });
  }
  return true; // 保持消息通道开启以进行异步响应
});

/**
 * 启发式抓取当前页面可见的消息列表
 * 适配 RingCentral 的 DOM 结构
 */
function scrapeMentions() {
  const messages = [];
  
  // 策略：查找常见的消息容器特征
  // RingCentral 消息通常在 role="listitem" 或特定的 div 结构中
  const messageNodes = document.querySelectorAll('div[data-test-id^="message-item"], div[role="listitem"], .message-item');

  console.log(`[RC Scraper] Found ${messageNodes.length} potential message nodes.`);

  messageNodes.forEach((node) => {
    try {
      const textContent = node.innerText.split('\n').filter(t => t.trim() !== '');
      
      let sender = "Unknown";
      let context = "Direct Message";
      let time = "";
      let content = "";

      // 1. 尝试查找发送者 (通常是加粗的或者第一行)
      const senderNode = node.querySelector('span[class*="sender"], h3, strong, [data-test-id="message-sender"]');
      if (senderNode) sender = senderNode.innerText;
      else if (textContent.length > 0) sender = textContent[0];

      // 2. 尝试查找上下文 (包含 "in" 的文本，或者群组名)
      const contextNode = Array.from(node.querySelectorAll('*')).find(el => el.innerText && el.innerText.includes(' in '));
      if (contextNode) {
         context = contextNode.innerText.split(' in ')[1] || contextNode.innerText;
      }

      // 3. 尝试查找时间
      const timeNode = node.querySelector('time, span[class*="time"]');
      if (timeNode) time = timeNode.innerText;
      
      // 4. 提取正文
      // 过滤掉发送者、时间和太短的文本
      const bodyText = textContent.filter(t => !t.includes(sender) && !t.includes(time) && t.length > 2);
      content = bodyText.join(' ');

      if (content.length > 0) {
        messages.push({
          sender: sender.trim(),
          context: context.trim(),
          time: time.trim(),
          content: content.trim()
        });
      }
    } catch (e) {
      console.error("[RC Scraper] Error parsing node", e);
    }
  });

  return messages;
}