import axios from 'axios';
const API_ROOT_URL = 'http:/api.something.com'

const api = axios.create({
  baseURL: `${API_ROOT_URL}`,
});

api.interceptors.response.use(
  (response) => {
    if (response?.data?.payload) return response.data.payload;
    if (response?.data) return response.data;
    return response;
  },
  (err) => {
    console.log(err)
    Promise.reject(err.response)
  }
);

export default api;
