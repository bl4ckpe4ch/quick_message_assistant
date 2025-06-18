// src/popup/popup.js
let dragRaf = null;

document.addEventListener('DOMContentLoaded', initApp);

const PRESET_MESSAGES = [
  { id: 1, content: "10.25是的生日🎂，别忘记了" },
  { id: 2, content: "我要自动拿到每个标签页的标题：{{/html/head/title}}" },
  { id: 3, content: "你好，xxx（页面固定位置可使用xpath模板），请你及时联系我，我的电话是xxx" },
  { id: 4, content: "你好，xxx44444444" },
  { id: 5, content: "你好，xxx（55555555555555" },
  { id: 6, content: "你好，xxx（页面6666666666666666666是xxx" },
  { id: 6, content: "你好，xxx（页面777777777777777777777，我的电话是xxx" }

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
      <div class="drag-handle">☰</div>
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

  // 设置拖拽排序
  setupDragSorting();
}
function setupDragSorting() {
  const messageList = document.getElementById('messageList');
  let items = Array.from(messageList.querySelectorAll('.message-item'));
  
  // 添加触摸事件支持
  items.forEach(item => {
    const dragHandle = item.querySelector('.drag-handle');
    dragHandle.addEventListener('mousedown', startDrag);
    dragHandle.addEventListener('touchstart', startDrag, { passive: true });
  });

  // 拖拽状态变量
  let isDragging = false;
  let dragItem = null;
  let dragPlaceholder = null;
  let startMouseY = 0;
  let dragOffsetY = 0;
  let listTop = 0;
  let originalIndex = 0;
  
  function startDrag(e) {
    if (e.type === 'touchstart' && e.touches) {
      e = e.touches[0];
    }
    
    e.preventDefault();
    if (isEditing) return;

    isDragging = true;
    dragItem = e.target.closest('.message-item');
    
    // 记录原始位置索引
    originalIndex = Array.from(messageList.querySelectorAll('.message-item')).indexOf(dragItem);
    
    // 记录初始位置
    const rect = dragItem.getBoundingClientRect();
    startMouseY = e.clientY;
    dragOffsetY = e.clientY - rect.top;
    listTop = messageList.getBoundingClientRect().top;
    
    dragItem.classList.add('dragging');
    
    // 创建拖拽占位符
    dragPlaceholder = document.createElement('div');
    dragPlaceholder.className = 'drag-placeholder';
    dragPlaceholder.style.height = `${rect.height}px`;
    messageList.insertBefore(dragPlaceholder, dragItem.nextSibling);
    
    // 提升拖拽元素层级
    dragItem.style.position = 'fixed';
    dragItem.style.zIndex = '1000';
    dragItem.style.width = `${rect.width}px`;
    dragItem.style.top = `${rect.top}px`;
    dragItem.style.left = `${rect.left}px`;
    
    // 添加事件监听
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('touchmove', onDragMove, { passive: true });
    document.addEventListener('wheel', onWheelScroll, { passive: false });
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);
  }

  function onWheelScroll(e) {
    if (!isDragging) return;
    
    const scrollDelta = e.deltaY * 0.5;
    messageList.scrollTop += scrollDelta;
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!isDragging) return;
    
    if (dragRaf) cancelAnimationFrame(dragRaf);
    dragRaf = requestAnimationFrame(() => {
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      if (!clientY) return;
      
      // 更新拖拽项位置
      dragItem.style.top = `${clientY - dragOffsetY}px`;
      
      // 获取所有消息项（排除占位符和拖拽项）
      const targetItems = Array.from(messageList.querySelectorAll('.message-item:not(.dragging)'));
      const tailElement = document.getElementById('tailElement');
      
      // 清除所有元素的标记
      targetItems.forEach(item => {
        item.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
      });
      tailElement.classList.remove('drag-target');
      
      // 计算拖拽项中心点
      const dragRect = dragItem.getBoundingClientRect();
      const dragCenterY = dragRect.top + dragRect.height / 2;
      
      // 检查是否拖拽到尾元素区域
      const tailRect = tailElement.getBoundingClientRect();
      const isOverTail = dragCenterY > tailRect.top;
      
      if (isOverTail) {
        // 拖拽到尾元素区域
        tailElement.classList.add('drag-target');
        console.log('拖拽到尾元素区域');
        
        // 隐藏占位符，因为拖拽到尾元素时不需要占位符
        if (dragPlaceholder && dragPlaceholder.parentNode) {
          dragPlaceholder.style.display = 'none';
        }
      } else {
        // 正常的位置检测
        // 确保占位符可见
        if (dragPlaceholder) {
          dragPlaceholder.style.display = '';
        }
        
        let insertIndex = targetItems.length; // 默认插入到最后
        let closestItem = null;
        
        // 遍历所有目标项，找到正确的插入位置
        for (let i = 0; i < targetItems.length; i++) {
          const targetItem = targetItems[i];
          const targetRect = targetItem.getBoundingClientRect();
          const targetCenterY = targetRect.top + targetRect.height / 2;
          
          // 使用元素高度的一半作为判定距离
          const threshold = targetRect.height / 2;
          
          // 如果拖拽项中心在目标项中心之上，则插入到该位置
          if (dragCenterY < targetCenterY - threshold) {
            insertIndex = i;
            closestItem = targetItem;
            break;
          }
        }
        
        // 如果循环结束但没有找到位置，说明拖拽到最后
        if (insertIndex === targetItems.length && targetItems.length > 0) {
          closestItem = targetItems[targetItems.length - 1];
        }
        
        // 调试日志
        console.log(`拖拽位置: ${dragCenterY}, 目标索引: ${insertIndex}, 总项目数: ${targetItems.length}, 目标项:`, closestItem?.textContent?.substring(0, 20) || '无');
        
        // 高亮目标项
        if (closestItem) {
          closestItem.classList.add('drag-over');
          if (insertIndex === targetItems.length) {
            // 拖拽到底部，高亮最后一个元素
            closestItem.classList.add('drag-over-bottom');
          } else {
            closestItem.classList.add('drag-over-top');
          }
        }
        
        // 更新占位符位置
        const currentPlaceholderIndex = Array.from(messageList.children).indexOf(dragPlaceholder);
        let targetIndex = insertIndex;
        
        // 调整目标索引，考虑占位符的存在
        if (currentPlaceholderIndex !== -1 && currentPlaceholderIndex < targetIndex) {
          targetIndex++;
        }
        
        // 只有当目标位置真正改变时才移动占位符
        if (currentPlaceholderIndex !== targetIndex) {
          console.log(`移动占位符: ${currentPlaceholderIndex} -> ${targetIndex}, 插入索引: ${insertIndex}, 总项目数: ${targetItems.length}`);
          
          if (targetIndex === 0) {
            // 插入到第一个位置
            messageList.insertBefore(dragPlaceholder, messageList.firstChild);
          } else if (targetIndex >= messageList.children.length) {
            // 插入到最后
            messageList.appendChild(dragPlaceholder);
            console.log('已添加到列表末尾');
          } else {
            // 插入到中间位置
            const targetElement = messageList.children[targetIndex];
            messageList.insertBefore(dragPlaceholder, targetElement);
          }
        }
      }
      
      dragRaf = null;
    });
  }

  function stopDrag(e) {
    if (!isDragging) return;
    
    // 完成拖拽
    isDragging = false;
    
    // 清除事件监听
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('wheel', onWheelScroll);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchend', stopDrag);
    
    // 检查是否拖拽到尾元素
    const tailElement = document.getElementById('tailElement');
    const isOverTail = tailElement.classList.contains('drag-target');
    
    if (isOverTail) {
      // 拖拽到尾元素，直接添加到列表末尾
      dragItem.classList.remove('dragging');
      messageList.appendChild(dragItem);
      console.log('拖拽到尾元素，添加到列表末尾');
    } else {
      // 正常放置拖拽元素
      if (dragPlaceholder && dragPlaceholder.parentNode) {
        dragItem.classList.remove('dragging');
        dragPlaceholder.replaceWith(dragItem);
      }
    }
    
    // 恢复普通定位
    dragItem.style.position = '';
    dragItem.style.top = '';
    dragItem.style.left = '';
    dragItem.style.width = '';
    dragItem.style.zIndex = '';
    dragItem.style.transform = '';
    
    // 移除占位符
    if (dragPlaceholder && dragPlaceholder.parentNode) {
      dragPlaceholder.remove();
    }
    
    // 清除尾元素样式
    tailElement.classList.remove('drag-target');
    
    // 清除视觉标记
    items.forEach(item => {
      item.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    });
    
    // 检查是否有实际的位置变化
    const newIndex = Array.from(messageList.querySelectorAll('.message-item')).indexOf(dragItem);
    if (originalIndex !== newIndex) {
      // 保存新顺序
      updateMessageOrder();
    }
    
    // 清除动画帧
    if (dragRaf) cancelAnimationFrame(dragRaf);
    dragRaf = null;
  }
}

function updateDragPosition(e) {
  if (!isDragging) return;

  // 限制拖拽范围在列表内
  const listRect = messageList.getBoundingClientRect();
  const dragY = e.clientY - offsetY - listRect.top;
  const maxY = listRect.height - dragItem.offsetHeight;

  // 设置元素位置
  dragItem.style.position = 'absolute';
  dragItem.style.zIndex = 1000;
  dragItem.style.left = '0';
  dragItem.style.top = Math.max(0, Math.min(maxY, dragY)) + 'px';
  dragItem.style.width = '100%';
}


// 优化后的更新消息顺序函数
async function updateMessageOrder() {
  const messageList = document.getElementById('messageList');
  const items = Array.from(messageList.querySelectorAll('.message-item:not(.dragging)'));

  const { messages } = await chrome.storage.local.get('messages');
  if (!messages) return;

  const messageMap = messages.reduce((map, msg) => {
    map[msg.id] = msg;
    return map;
  }, {});

  const orderedMessages = items.map(item => {
    return messageMap[parseInt(item.dataset.id)];
  }).filter(Boolean);

  await chrome.storage.local.set({ messages: orderedMessages });
  showToast('顺序已调整');
}

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