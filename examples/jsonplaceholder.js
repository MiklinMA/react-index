import axios from 'axios'
import index from 'react-index'

const api = axios.create({
  baseURL: 'https://jsonplaceholder.typicode.com/',
});

let cancel
api.interceptors.request.use(
  (config) => {
    if (cancel) cancel('debounce')

    config.cancelToken = new axios.CancelToken(
      function executor(c) {
        cancel = c
      }
    )
    return config
  },
  (err) => Promise.reject(err),
)
api.interceptors.response.use(
  (response) => {
    if (response?.data) return response.data;
    return response;
  },
  (err) => Promise.reject(err.response),
);

export const apiTodo = index({
  api,
  objectName: 'todos',
  getId: item => item?.id,
  defaultFilters: {
    completed: null,
    userId: null,
    _limit: 10,
  },
})