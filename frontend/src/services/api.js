import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url === '/auth/login';
    const status = error.response?.status;

    if (status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      localStorage.setItem('sessionNotice', 'Your session has expired. Please sign in again.');
      delete api.defaults.headers.common['Authorization'];
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;