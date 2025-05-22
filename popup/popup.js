// src/popup/popup.js
document.addEventListener('DOMContentLoaded', initApp);

const PRESET_MESSAGES = [
  { id: 1, content: "10.25是某人的生日🎂，别忘记了"},
  { id: 2, content: "我要自动拿到每个标签页的标题：{{/html/head/title}}"},
  { id: 3, content: "你好，xxx（页面固定位置可使用xpath模板），请你及时联系我，我的电话是xxx"}
];
// const PLACEHOLDER_REGEX = /\{\{(.+?)\}\}/g;
const PLACEHOLDER_REGEX = /([@「]?)\{\{(.+?)\}\}([」]?)(\s*)/g;
let isEditing = false;
let currentTabId = null;

async function initApp() {
  // 获取当前标签页
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;
  
  // 初始化消息
  await initPresetMessages();
  const messages = await loadMessages();
  await renderDynamicContent(messages);
  setupEventListeners();
}

async function initPresetMessages() {
  const { messages } = await chrome.storage.local.get('messages');
  if (!messages) {
    await chrome.storage.local.set({ messages: PRESET_MESSAGES });
  }
}

async function loadMessages() {
  const { messages } = await chrome.storage.local.get('messages');
  return messages || [];
}

// 渲染消息列表（显示解析内容）
async function renderDynamicContent(messages) {
  const list = document.getElementById('messageList');
  list.innerHTML = messages.map(msg => `
    <div class="message-item" data-id="${msg.id}">
      <div class="message-content loading">加载中...</div>
      <div class="actions">
        <button class="editBtn">✎</button>
        <button class="deleteBtn">✕</button>
      </div>
    </div>
  `).join('');

  // 异步解析内容
  const items = list.children;
  for (let i = 0; i < messages.length; i++) {
    const resolved = await resolveContent(messages[i].content);
    items[i].querySelector('.message-content').textContent = resolved;
    items[i].querySelector('.message-content').classList.remove('loading');
  }
}

// async function resolveContent(content) {
//   const matches = [...content.matchAll(PLACEHOLDER_REGEX)];
//   let result = content;
//   console.log(result);
//   for (const [full, xpath] of matches) {
//     const value = await evaluateXPath(xpath);
//     // result = result.replace(full, value || `[${xpath}无效]`); # xpath 报错
//     result = result.replace(full, value || ""); 
//   }
//   return result;
// }

async function resolveContent(content) {
  let result = content;
  const matches = [];
  
  // 收集所有匹配项及其位置
  let match;
  while ((match = PLACEHOLDER_REGEX.exec(content)) !== null) {
    matches.push(match);
  }

  // 逆序处理避免替换影响索引
  for (let i = matches.length - 1; i >= 0; i--) {
    const [full, prefix, xpath, suffix, space] = matches[i];
    const value = await evaluateXPath(xpath);
    
    const replacement = value 
      ? `${prefix}${value}${suffix}${space}`
      : '';
    
    result = result.slice(0, matches[i].index) 
           + replacement 
           + result.slice(matches[i].index + full.length);
  }

  return result;
}

async function evaluateXPath(xpath) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: (xpath) => {
        try {
          const node = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          ).singleNodeValue;
          return node?.textContent?.trim() || null;
        } catch (e) {
          return null;
        }
      },
      args: [xpath]
    });
    return result.result || null;
  } catch (e) {
    return null;
  }
}

function setupEventListeners() {
  const messageList = document.getElementById('messageList');

  messageList.addEventListener('click', (e) => {
    if (isEditing) return;
    
    const item = e.target.closest('.message-item');
    if (!item) return;

    if (e.target.classList.contains('editBtn')) {
      startEditing(item);
    } else if (e.target.classList.contains('deleteBtn')) {
      deleteMessage(item);
    } else if (e.target.classList.contains('message-content')) {
      copyMessage(item);
    }
  });

  document.getElementById('addBtn').addEventListener('click', async () => {
    if (!isEditing) {
      const newMessage = {
        id: Date.now(),
        content: `新消息 ${new Date().toLocaleTimeString()}`
      };
      const messages = await loadMessages();
      messages.push(newMessage);
      await chrome.storage.local.set({ messages });
      await renderDynamicContent(messages);
    }
  });
  //导入导出
  document.getElementById('exportBtn').addEventListener('click', exportMessages);
  document.getElementById('importBtn').addEventListener('click', handleFileImport);
}

// 编辑功能（显示原始模板）
async function startEditing(item) {
  isEditing = true;
  const contentDiv = item.querySelector('.message-content');
  const originalContent = await getOriginalContent(item.dataset.id);
  
  const textarea = document.createElement('textarea');
  textarea.className = 'edit-textarea';
  textarea.value = originalContent;
  
  textarea.style.height = `${textarea.scrollHeight}px`;
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  });

  const saveHandler = async () => {
    const newContent = textarea.value.trim();
    if (newContent !== originalContent) {
      await updateMessage(item.dataset.id, newContent);
      await renderDynamicContent(await loadMessages());
    }
    isEditing = false;
    textarea.replaceWith(contentDiv);
  };

  textarea.addEventListener('blur', saveHandler);
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveHandler();
    }
  });

  contentDiv.replaceWith(textarea);
  textarea.focus();
}

async function getOriginalContent(id) {
  const messages = await loadMessages();
  return messages.find(m => m.id == id)?.content || '';
}

// 统一复制功能
async function copyMessage(item) {
  try {
    const rawContent = await getOriginalContent(item.dataset.id);
    const parsedContent = await resolveContent(rawContent);
    
    await navigator.clipboard.writeText(parsedContent);
    showToast('内容已复制');
    item.style.animation = 'highlight 1.5s';
  } catch (error) {
    console.error('复制失败:', error);
    showToast('复制失败');
  }
}

async function updateMessage(id, newContent) {
  const messages = await loadMessages();
  const index = messages.findIndex(msg => msg.id == id);
  messages[index].content = newContent;
  await chrome.storage.local.set({ messages });
}

async function deleteMessage(item) {
  const messages = await loadMessages();
  const filtered = messages.filter(msg => msg.id != item.dataset.id);
  await chrome.storage.local.set({ messages: filtered });
  await renderDynamicContent(filtered);
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// 导出

async function exportMessages() {
  try {
    const messages = await loadMessages();
    const timestamp = new Date().toISOString().slice(0, 10);
    const dataStr = JSON.stringify(messages, null, 2);
    
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `messages_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(url), 100);
    showToast(`已导出 ${messages.length} 条消息`);
  } catch (error) {
    console.error('导出失败:', error);
    showToast('导出失败，请重试');
  }
}

// 导入

function handleFileImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          
          // 数据格式校验
          if (!Array.isArray(imported) || imported.some(m => !m.id || !m.content)) {
            throw new Error('文件格式不符合要求');
          }

          // 用户确认
          const confirmImport = confirm(`即将导入 ${imported.length} 条消息，是否覆盖现有数据？`);
          if (confirmImport) {
            await chrome.storage.local.set({ messages: imported });
            await renderDynamicContent(imported);
            showToast('导入成功');
          }
        } catch (error) {
          console.error('导入失败:', error);
          showToast(`导入失败: ${error.message}`);
        }
      };
      reader.readAsText(file);
    } catch (error) {
      showToast('文件读取失败');
    }
  };
  
  input.click();
}