import axios from 'axios'
import index from 'react-index'

const api = axios.create({
  baseURL: 'https://jsonplaceholder.typicode.com/',
});

api.interceptors.response.use(
  (response) => {
    if (response?.data) return response.data;
    return response;
  },
  (err) => {
    console.log(err)
    Promise.reject(err.response)
  }
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