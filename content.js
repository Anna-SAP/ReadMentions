// content.js

// 监听来自 Popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SCRAPE_PAGE") {
    console.log("[RC Scraper] Received scrape request");
    const data = scrapeMentions();
    
    // 去重 (基于内容和发送者)
    const uniqueData = data.filter((v, i, a) => a.findIndex(t => (t.content === v.content && t.sender === v.sender)) === i);
    
    console.log(`[RC Scraper] Sending back ${uniqueData.length} unique messages.`);
    sendResponse({ 
      success: true, 
      count: uniqueData.length, 
      data: uniqueData 
    });
  }
  return true; 
});

/**
 * 智能抓取函数 - 采用多种策略以应对 RC 复杂的 DOM 结构
 */
function scrapeMentions() {
  let nodes = [];

  // --- 策略 1: 标准选择器 (优先尝试) ---
  // 针对 RC 常见的列表项容器
  const selectors = [
    'div[role="listitem"]',
    'div[data-test-id="message-item"]',
    'div[data-test-id^="mention-"]',
    '.MentionItem', 
    'div[class*="styles-item"]', // 模糊匹配样式类名
    'div[class*="MessageItem"]'
  ];

  for (const sel of selectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) {
      console.log(`[RC Scraper] Strategy 1 matched with selector: ${sel}, count: ${found.length}`);
      nodes = Array.from(found);
      break; 
    }
  }

  // --- 策略 2: 时间戳锚点 (最强力的兜底方案) ---
  // 如果策略 1 失败，或者只找到极少元素，尝试通过“时间戳”反向查找容器
  if (nodes.length < 2) {
    console.log("[RC Scraper] Strategy 1 yielded few results. Trying Timestamp Anchor strategy...");
    
    // RC 的时间格式通常是: "12:12 AM", "Yesterday", "Mon", "1/17"
    const timeRegex = /^(?:\d{1,2}:\d{2}\s?(?:AM|PM)|Yesterday|Today|Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{1,2}\/\d{1,2})$/i;
    
    // 查找所有简短的文本节点
    const allElements = document.querySelectorAll('span, time, div, p');
    const potentialTimeNodes = Array.from(allElements).filter(el => {
      // 必须是末端节点，且文本符合日期格式
      return el.childElementCount === 0 && 
             el.innerText && 
             el.innerText.length < 15 && 
             timeRegex.test(el.innerText.trim());
    });

    console.log(`[RC Scraper] Found ${potentialTimeNodes.length} potential timestamp anchors.`);

    const containerSet = new Set();
    potentialTimeNodes.forEach(timeNode => {
      // 向上遍历寻找合适的容器
      // 容器通常包含比时间戳多得多的文本
      let parent = timeNode.parentElement;
      let depth = 0;
      while (parent && depth < 8) {
        // 启发式判断：容器通常是 block 元素，宽度足够，且包含超过 30 个字符的文本
        const text = parent.innerText;
        if (text.length > 30 && parent.offsetWidth > 200) {
          // 只有当这个容器看起来像是一个独立的卡片时才添加 (避免选中整个大列表)
          // 检查容器高度是否合理 (例如 < 500px)
          if (parent.offsetHeight < 600) {
            containerSet.add(parent);
            break; // 找到最近的符合条件的祖先就停止
          }
        }
        parent = parent.parentElement;
        depth++;
      }
    });
    
    if (containerSet.size > 0) {
      nodes = Array.from(containerSet);
      console.log(`[RC Scraper] Timestamp strategy found ${nodes.length} containers.`);
    }
  }

  // --- 解析数据 ---
  const messages = [];
  
  nodes.forEach((node, index) => {
    try {
      const fullText = node.innerText || "";
      const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);

      if (lines.length < 2) return;

      // 提取逻辑 (基于截图的视觉层级)
      // 格式通常为: [Sender Name] [Action] [Context] [Time] ... [Content]
      
      let sender = "Unknown Sender";
      let context = "Direct Message";
      let content = "";
      
      // 1. 提取发送者: 通常是第一行，或者是加粗的元素
      const senderEl = node.querySelector('span[class*="sender"], strong, [data-test-id="message-sender"]');
      if (senderEl) {
        sender = senderEl.innerText;
      } else {
        // 尝试第一行，排除掉像 "Today", "Yesterday" 这样的分割线
        if (lines[0] && !lines[0].match(/Today|Yesterday/)) {
            sender = lines[0];
        }
      }

      // 2. 提取 Context (群组名): 通常包含 "in " 或紧跟在 sender 后面
      // 查找包含 " in " 的行
      const contextLine = lines.find(l => l.includes(' in '));
      if (contextLine) {
        const parts = contextLine.split(' in ');
        if (parts.length > 1) context = parts[1];
      } else {
        // 如果没有 "in", 尝试找 icons 旁边的文本，或者简单的假设第二行是 context
        // 这里为了安全，保持默认或尝试从 link 提取
        const groupLink = node.querySelector('a[href*="/teams/"], a[href*="/glip/groups"]');
        if (groupLink) context = groupLink.innerText;
      }

      // 3. 提取正文
      // 排除掉 sender 和 metadata 之后最长的段落
      // 针对 @mentions 页面，正文通常有特殊的背景色或高亮
      // 但通用做法是排除短行，取剩下的
      
      // 过滤掉包含 "replied to", "shared", "Yesterday", Sender Name 的行
      const contentLines = lines.filter(l => {
        return !l.includes(sender) && 
               !l.match(/replied to|shared a|added|pinned/i) &&
               l.length > 5; // 太短的通常是时间或元数据
      });
      
      content = contentLines.join(' ');
      
      // 如果正文为空，可能整个 node 就是正文，回退一步
      if (!content && fullText.length > sender.length + 20) {
          content = fullText.replace(sender, '').trim();
      }

      if (content) {
        messages.push({
          sender: sender.replace(/[:：]/g, '').trim(), // 清理冒号
          context: context.trim(),
          content: content.substring(0, 500), // 限制长度
          priority: "Unknown" // 占位
        });
      }
    } catch (e) {
      console.warn("Failed to parse node", e);
    }
  });

  return messages;
}