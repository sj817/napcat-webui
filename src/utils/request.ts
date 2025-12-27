import axios from 'axios';

import key from '@/const/key';

export const serverRequest = axios.create({
  timeout: 5000,
});

export const request = axios.create({
  timeout: 10000,
});

/**
 * 获取 API 基础 URL
 * 从 protocol、host 和 port 组合生成完整 URL，自动添加 /api 后缀
 */
export const getBaseURL = (): string => {
  const storedProtocol = localStorage.getItem(key.baseProtocol);
  const storedHost = localStorage.getItem(key.baseHost);
  const storedPort = localStorage.getItem(key.basePort);

  if (storedHost && storedPort) {
    try {
      const protocol = storedProtocol ? JSON.parse(storedProtocol) : 'http';
      const host = JSON.parse(storedHost);
      const port = JSON.parse(storedPort);
      if (host && typeof host === 'string' && host.trim() && port && typeof port === 'string' && port.trim()) {
        // 移除 host 末尾的斜杠
        const cleanHost = host.replace(/\/+$/, '');
        return `${protocol}://${cleanHost}:${port}/api`;
      }
    } catch {
      // 解析失败
    }
  }
  // 未设置后端地址时返回空，触发登录页面提示
  return '';
};

/**
 * 获取 WebSocket 基础 URL
 * 将 HTTP URL 转换为 WebSocket URL
 */
export const getWebSocketBaseURL = (): string => {
  const baseUrl = getBaseURL();
  if (!baseUrl) {
    return '';
  }
  // 自定义 URL，转换协议
  return baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
};

export const requestServerWithFetch = async (
  url: string,
  options: RequestInit
) => {
  const token = localStorage.getItem(key.token);

  if (token) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${JSON.parse(token)}`,
    };
  }

  const baseURL = getBaseURL();

  const response = await fetch(baseURL + url, options);

  return response;
};

serverRequest.interceptors.request.use((config) => {
  const baseURL = getBaseURL();

  config.baseURL = baseURL;

  const token = localStorage.getItem(key.token);

  if (token) {
    config.headers['Authorization'] = `Bearer ${JSON.parse(token)}`;
  }

  return config;
});

serverRequest.interceptors.response.use((response) => {
  // 如果是流式传输的文件
  if (response.headers['content-type'] === 'application/octet-stream') {
    return response;
  }
  if (response.data.code !== 0) {
    if (response.data.message === 'Unauthorized') {
      const token = localStorage.getItem(key.token);
      if (token && JSON.parse(token)) {
        localStorage.removeItem(key.token);
        window.location.reload();
      }
    }
    throw new Error(response.data.message);
  }

  return response;
});
