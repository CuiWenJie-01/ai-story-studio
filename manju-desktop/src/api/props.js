import request from '@/utils/request'

export const propAPI = {
  list(params) {
    return request.get('/props', { params })
  },
  create(data) {
    return request.post('/props', data)
  },
  update(id, data) {
    return request.put(`/props/${id}`, data)
  },
  delete(id) {
    return request.delete(`/props/${id}`)
  },
  generateImage(id, prompt, style) {
    return request.post(`/props/${id}/generate-image`, { prompt, style })
  }
}
