// Firebase 初始化
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 全局变量
let selectedFile = null;

// 文件选择事件
document.getElementById('videoInput').addEventListener('change', (e) => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
        const fileInfo = `
            <div class="file-info">
                <strong>已选择：</strong> ${selectedFile.name}<br>
                <small>大小：${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</small>
            </div>
        `;
        document.getElementById('selectedFile').innerHTML = fileInfo;
    }
});

// 上传视频
async function uploadVideo() {
    const uploadBtn = document.getElementById('uploadBtn');
    const progressDiv = document.getElementById('uploadProgress');
    
    if (!selectedFile) {
        alert('请先选择视频文件');
        return;
    }
    
    const comment = document.getElementById('commentInput').value.trim();
    const project = document.getElementById('projectName').value.trim();
    const tags = document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t);
    
    if (!comment) {
        alert('请添加工作注释');
        return;
    }
    
    // 禁用上传按钮，显示进度
    uploadBtn.disabled = true;
    uploadBtn.textContent = '上传中...';
    
    try {
        // 显示上传进度
        progressDiv.innerHTML = '<div class="progress-bar"><div class="progress" style="width: 0%"></div></div>';
        const progressBar = progressDiv.querySelector('.progress');
        
        // 1. 上传到 Google Drive
        progressDiv.innerHTML = '正在上传到 Google Drive...';
        const driveResponse = await driveUploader.uploadVideo(selectedFile, (percent) => {
            progressBar.style.width = percent + '%';
        });
        
        // 2. 设置文件为公开访问
        progressDiv.innerHTML = '正在设置共享权限...';
        const videoUrl = await driveUploader.makeFilePublic(driveResponse.id);
        const embedUrl = driveUploader.getVideoEmbedUrl(driveResponse.id);
        
        // 3. 保存信息到 Firebase
        progressDiv.innerHTML = '正在保存信息...';
        await db.collection('work_videos').add({
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            fileId: driveResponse.id,
            videoUrl: videoUrl,
            embedUrl: embedUrl,
            comment: comment,
            project: project || '未分类',
            tags: tags,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            uploader: '匿名用户', // 可以添加简单用户名
            views: 0
        });
        
        // 4. 重置表单
        selectedFile = null;
        document.getElementById('videoInput').value = '';
        document.getElementById('selectedFile').innerHTML = '';
        document.getElementById('commentInput').value = '';
        document.getElementById('projectName').value = '';
        document.getElementById('tags').value = '';
        
        // 5. 显示成功消息
        progressDiv.innerHTML = '<div class="success">✅ 上传成功！视频已共享</div>';
        
    } catch (error) {
        console.error('上传失败:', error);
        progressDiv.innerHTML = `<div class="error">❌ 上传失败: ${error.message}</div>`;
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '上传视频并共享';
    }
}

// 实时加载视频列表
function setupVideosListener() {
    db.collection('work_videos')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            const videosList = document.getElementById('videosList');
            const countElement = document.getElementById('count');
            
            videosList.innerHTML = '';
            countElement.textContent = `(${snapshot.size})`;
            
            if (snapshot.empty) {
                videosList.innerHTML = `
                    <div class="empty-state">
                        <p>还没有共享视频，点击上方按钮上传第一个视频</p>
                    </div>
                `;
                return;
            }
            
            snapshot.forEach((doc) => {
                const data = doc.data();
                const videoCard = createVideoCard(doc.id, data);
                videosList.appendChild(videoCard);
            });
        });
}

// 创建视频卡片
function createVideoCard(id, data) {
    const div = document.createElement('div');
    div.className = 'video-card';
    
    const time = data.timestamp 
        ? new Date(data.timestamp.toDate()).toLocaleString('zh-CN')
        : '未知时间';
    
    const fileSizeMB = (data.fileSize / (1024 * 1024)).toFixed(1);
    
    // 生成标签HTML
    const tagsHtml = data.tags && data.tags.length > 0 
        ? data.tags.map(tag => `<span class="tag">${tag}</span>`).join('')
        : '';
    
    div.innerHTML = `
        <div class="video-card-header">
            <h3>${escapeHtml(data.project)}</h3>
            <span class="video-time">${time}</span>
        </div>
        
        <div class="video-card-body">
            <!-- Google Drive 嵌入播放器 -->
            <div class="video-player">
                <iframe 
                    src="${data.embedUrl}"
                    width="100%"
                    height="300"
                    frameborder="0"
                    allowfullscreen>
                </iframe>
            </div>
            
            <div class="video-info">
                <div class="file-name">
                    <strong>文件名：</strong>${escapeHtml(data.fileName)}
                    <span class="file-size">(${fileSizeMB} MB)</span>
                </div>
                
                <div class="video-comment">
                    <strong>工作注释：</strong>
                    <p>${escapeHtml(data.comment)}</p>
                </div>
                
                <div class="video-tags">
                    ${tagsHtml}
                </div>
            </div>
        </div>
        
        <div class="video-card-footer">
            <button onclick="copyVideoLink('${data.embedUrl}')" class="btn-small">
                📋 复制链接
            </button>
            <button onclick="incrementViews('${id}')" class="btn-small">
                👁️ 已查看 <span id="views-${id}">${data.views || 0}</span>
            </button>
            <a href="${data.videoUrl}" target="_blank" class="btn-small">
                ⬇️ 下载原文件
            </a>
        </div>
    `;
    
    return div;
}

// 复制链接
function copyVideoLink(url) {
    navigator.clipboard.writeText(url)
        .then(() => alert('链接已复制到剪贴板！'))
        .catch(err => console.error('复制失败:', err));
}

// 增加查看次数
async function incrementViews(videoId) {
    try {
        const docRef = db.collection('work_videos').doc(videoId);
        await docRef.update({
            views: firebase.firestore.FieldValue.increment(1)
        });
    } catch (error) {
        console.error('更新查看次数失败:', error);
    }
}

// 搜索功能
document.getElementById('searchInput').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const videoCards = document.querySelectorAll('.video-card');
    
    videoCards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(searchTerm) ? 'block' : 'none';
    });
});

// 安全转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 页面加载
document.addEventListener('DOMContentLoaded', () => {
    setupVideosListener();
});