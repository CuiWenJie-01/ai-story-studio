import request from '@/utils/request'

export const taskAPI = {
  get(id) {
    return request.get(`/tasks/${id}`)
  },
  list(params) {
    return request.get('/tasks', { params })
  },
  create(data) {
    return request.post('/tasks', data)
  }
}
