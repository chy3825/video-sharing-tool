// Google Drive 上传器
class GoogleDriveUploader {
    constructor() {
        this.CLIENT_ID = '你的客户端ID.apps.googleusercontent.com';
        this.API_KEY = '你的API密钥';
        this.SCOPES = 'https://www.googleapis.com/auth/drive.file';
        this.tokenClient = null;
        this.gapiInited = false;
        this.gisInited = false;
    }

    // 初始化 Google API
    async initGoogleApi() {
        return new Promise((resolve) => {
            gapi.load('client', async () => {
                await gapi.client.init({
                    apiKey: this.API_KEY,
                    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                });
                this.gapiInited = true;
                resolve();
            });
        });
    }

    // 初始化 Google Identity Services
    initGoogleIdentity() {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.CLIENT_ID,
            scope: this.SCOPES,
            callback: (tokenResponse) => {
                // 令牌回调，处理上传
            },
        });
        this.gisInited = true;
    }

    // 获取访问令牌
    async getAccessToken() {
        return new Promise((resolve, reject) => {
            if (!this.tokenClient) {
                reject(new Error('GIS未初始化'));
                return;
            }

            this.tokenClient.callback = async (tokenResponse) => {
                if (tokenResponse.error) {
                    reject(new Error(tokenResponse.error));
                    return;
                }
                resolve(tokenResponse.access_token);
            };

            if (gapi.client.getToken() === null) {
                this.tokenClient.requestAccessToken({ prompt: 'consent' });
            } else {
                this.tokenClient.requestAccessToken({ prompt: '' });
            }
        });
    }

    // 上传视频到 Google Drive
    async uploadVideo(file, progressCallback) {
        const accessToken = await this.getAccessToken();
        
        // 创建文件元数据
        const metadata = {
            name: file.name,
            mimeType: file.type,
            parents: ['root'], // 上传到根目录，也可以创建特定文件夹
        };

        // 创建 FormData
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        // 使用 Fetch API 上传（支持进度跟踪）
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
            xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
            
            xhr.upload.onprogress = (event) => {
                if (progressCallback && event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    progressCallback(percent);
                }
            };
            
            xhr.onload = () => {
                if (xhr.status === 200) {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } else {
                    reject(new Error('上传失败: ' + xhr.statusText));
                }
            };
            
            xhr.onerror = () => reject(new Error('网络错误'));
            
            xhr.send(form);
        });
    }

    // 设置文件为公开可读
    async makeFilePublic(fileId) {
        const accessToken = await this.getAccessToken();
        
        const response = await gapi.client.drive.permissions.create({
            fileId: fileId,
            resource: {
                role: 'reader',
                type: 'anyone',
            },
        });
        
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }

    // 获取视频嵌入代码
    getVideoEmbedUrl(fileId) {
        return `https://drive.google.com/file/d/${fileId}/preview`;
    }
}

// 创建全局实例
const driveUploader = new GoogleDriveUploader();

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await driveUploader.initGoogleApi();
    driveUploader.initGoogleIdentity();
});